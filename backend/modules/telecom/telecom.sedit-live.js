/**
 * Accès DIRECT à Sedit (Oracle FI) pour le module télécom, comme /budget (Factures beta),
 * au lieu de la copie locale Postgres `oracle.gf_oracle_facture`.
 *
 * Les requêtes SQL télécom (RESOLVED_INVOICES_SQL, factures disponibles, rejetées…) sont
 * écrites en Postgres avec des jointures LATERAL sur la table des factures. Plutôt que de
 * les réécrire en Oracle, on lit les factures en direct dans Sedit (mêmes colonnes, mêmes
 * noms que le miroir) et on les charge dans `hub_telecom.sedit_factures_live`, rafraîchie
 * au plus toutes les REFRESH_TTL_MS. Le miroir `oracle.gf_oracle_*` n'est plus utilisé.
 */
const { pool } = require('../../shared/database');
const financeShare = require('../finance/finance-share.controller');
const seditDirect = require('../finance/sedit-direct.service');

const REFRESH_TTL_MS = 60 * 1000;
const YEARS_BACK = 3; // factures reçues depuis le 1er janvier de (année - YEARS_BACK)

// Colonnes (noms identiques au miroir `oracle.gf_oracle_facture`) et type Postgres.
const COLUMNS = [
    ['FACTURE_REFERENCE', 'text'],
    ['FACTURE_LIBELLE1', 'text'],
    ['FACTURE_LIBELLE2', 'text'],
    ['FACTURE_FACTIERS', 'text'],
    ['FACTURE_FACTURE', 'text'],
    ['FACTURE_ROO_IMA_REF', 'text'],
    ['FACETAT_LIBELLE', 'text'],
    ['TIERS_POBJ_EXTRACT', 'text'],
    ['FACTURE_MONTANTTC_E', 'numeric'],
    ['FACTURE_DATENTREE', 'timestamp'],
    // Codes des engagements (FI.MOUVEMENT) auxquels Sedit a rapproché la facture (via ses
    // lignes FI.MVTLIGNE), séparés par « , ». Colonne calculée, absente du miroir.
    ['ENGAGEMENT', 'text'],
];
const ENGAGEMENT_SQL = `(SELECT LISTAGG(DISTINCT TRIM(mv.MOUVEMENT), ',') WITHIN GROUP (ORDER BY TRIM(mv.MOUVEMENT))
    FROM FI.MVTLIGNE ml JOIN FI.MOUVEMENT mv ON mv.ROO_IMA_REF = ml.MOUVEMENT
    WHERE ml.FACTURE = "_o"."FACTURE_ROO_IMA_REF")`;

let lastRefresh = 0;
let inflight = null;
let tableReady = false;

async function ensureTable() {
    if (tableReady) return;
    await pool.query('CREATE SCHEMA IF NOT EXISTS hub_telecom');
    await pool.query(`CREATE UNLOGGED TABLE IF NOT EXISTS hub_telecom.sedit_factures_live (
        ${COLUMNS.map(([c, t]) => `"${c}" ${t}`).join(', ')}
    )`);
    for (const [c, t] of COLUMNS) {
        await pool.query(`ALTER TABLE hub_telecom.sedit_factures_live ADD COLUMN IF NOT EXISTS "${c}" ${t}`);
    }
    // Engagements télécom (nature 6262) de l'exercice, lus dans Sedit à chaque rafraîchissement.
    await pool.query(`CREATE UNLOGGED TABLE IF NOT EXISTS hub_telecom.sedit_engagements_live (
        commitment_number text, tiers_code text)`);
    // Choix de l'utilisateur : engagement géré (ou non) en fluide. Absent = géré (défaut).
    await pool.query(`CREATE TABLE IF NOT EXISTS hub_telecom.engagement_settings (
        commitment_number text PRIMARY KEY, managed boolean NOT NULL DEFAULT true,
        updated_by text, updated_at timestamp DEFAULT CURRENT_TIMESTAMP)`);
    tableReady = true;
}

async function fetchFromSedit() {
    const sync = await seditDirect.getOracleSyncConfig('gf_oracle_facture');
    const since = new Date(new Date().getFullYear() - YEARS_BACK, 0, 1);
    return financeShare.withFinanceOracle(async (conn) => {
        const metaRes = await conn.execute(`SELECT * FROM "${sync.tableName}" WHERE 1 = 0`);
        const validColumns = new Set((metaRes.metaData || []).map((m) => m.name));
        const inner = seditDirect.buildOracleInner(sync, validColumns);
        const innerMeta = await conn.execute(`SELECT * FROM (${inner}) WHERE 1 = 0`);
        const present = new Set((innerMeta.metaData || []).map((m) => m.name));
        const select = COLUMNS.map(([c]) => {
            if (c === 'ENGAGEMENT') return present.has('FACTURE_ROO_IMA_REF') ? `${ENGAGEMENT_SQL} AS "${c}"` : `NULL AS "${c}"`;
            return (present.has(c) ? `"_o"."${c}"` : `NULL`) + ` AS "${c}"`;
        }).join(', ');
        const where = present.has('FACTURE_DATENTREE') ? 'WHERE "_o"."FACTURE_DATENTREE" >= :since' : '';
        const binds = where ? { since } : {};
        const res = await conn.execute(`SELECT ${select} FROM (${inner}) "_o" ${where}`, binds, { maxRows: 0 });
        return res.rows;
    });
}

async function doRefresh() {
    await ensureTable();
    const rows = await fetchFromSedit();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM hub_telecom.sedit_factures_live');
        const n = COLUMNS.length;
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
            const chunk = rows.slice(i, i + BATCH);
            const params = [];
            const values = chunk.map((r, ri) => {
                COLUMNS.forEach(([c]) => {
                    const v = r[c];
                    params.push(v === undefined || v === null ? null : (v instanceof Date ? v : (typeof v === 'string' ? v : String(v))));
                });
                return '(' + COLUMNS.map((_, ci) => `$${ri * n + ci + 1}`).join(', ') + ')';
            });
            await client.query(
                `INSERT INTO hub_telecom.sedit_factures_live (${COLUMNS.map(([c]) => `"${c}"`).join(', ')}) VALUES ${values.join(', ')}`,
                params
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
    } finally {
        client.release();
    }
    lastRefresh = Date.now();
    console.log(`[Telecom] ${rows.length} factures lues en direct dans Sedit`);
    await refreshEngagementsTable().catch((e) => console.error('[Telecom] Lecture des engagements Sedit impossible :', e.message));
    await autoImportEngagementInvoices().catch((e) => console.error('[Telecom] Import auto des factures rapprochées impossible :', e.message));
    await autoLinkAccounts().catch((e) => console.error('[Telecom] Rattachement auto des comptes impossible :', e.message));
}

/** Recopie dans Postgres la liste des engagements télécom (6262) de l'exercice lue dans Sedit. */
async function refreshEngagementsTable() {
    const list = await getTelecomEngagementsLive();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM hub_telecom.sedit_engagements_live');
        for (const e of list) {
            await client.query('INSERT INTO hub_telecom.sedit_engagements_live (commitment_number, tiers_code) VALUES ($1, $2)',
                [e.commitment_number, e.tiers_code || null]);
        }
        await client.query('COMMIT');
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Intègre automatiquement à l'historique télécom toutes les factures que Sedit a rapprochées d'un
 * engagement télécom GÉRÉ EN FLUIDE : engagement de nature 6262 de l'exercice (ou n° d'engagement
 * d'un compte de facturation) non désactivé dans l'onglet Engagements. Facture de l'année en cours
 * (+ déc. N-1), non écartée (rejet « hors télécom » ou déjà rejetée). Opérateur déduit du compte
 * de l'engagement, à défaut du tiers de l'engagement ; compte renseigné seulement s'il est unique.
 * Une facture dont les engagements pointent vers plusieurs opérateurs n'est pas importée.
 */
async function autoImportEngagementInvoices() {
    const r = await pool.query(`
        INSERT INTO hub_telecom.invoices (invoice_number, operator_id, billing_account_id)
        SELECT c.num, MIN(x.operator_id),
               CASE WHEN COUNT(DISTINCT x.account_id) = 1 THEN MIN(x.account_id) END
        FROM (
            SELECT COALESCE(substring(f."FACTURE_LIBELLE1" from 'N°([^ ]+)'),
                            substring(f."FACTURE_LIBELLE1" from '([A-Z]\\d{4}VTF\\d{4,5})'),
                            NULLIF(TRIM(f."FACTURE_FACTIERS"), '')) AS num,
                   f."ENGAGEMENT" AS eng,
                   COALESCE(to_date(substring(f."FACTURE_LIBELLE1" from '(\\d{2}/\\d{2}/\\d{4})'), 'DD/MM/YYYY'),
                            f."FACTURE_DATENTREE"::date) AS dt
            FROM hub_telecom.sedit_factures_live f
            WHERE f."ENGAGEMENT" IS NOT NULL
        ) c
        JOIN LATERAL (
            SELECT COALESCE(a.operator_id, o.id) AS operator_id, a.id AS account_id
            FROM unnest(string_to_array(c.eng, ',')) AS code(v)
            JOIN (
                SELECT commitment_number, tiers_code FROM hub_telecom.sedit_engagements_live
                UNION
                SELECT TRIM(commitment_number), NULL FROM hub_telecom.billing_accounts
                WHERE commitment_number IS NOT NULL AND TRIM(commitment_number) <> ''
            ) e ON e.commitment_number = TRIM(code.v)
            LEFT JOIN hub_telecom.engagement_settings s ON s.commitment_number = e.commitment_number
            LEFT JOIN hub_telecom.billing_accounts a ON TRIM(a.commitment_number) = e.commitment_number
            LEFT JOIN hub_telecom.operators o ON o.tier_code IS NOT NULL AND TRIM(o.tier_code) = TRIM(e.tiers_code)
            WHERE COALESCE(s.managed, true)
        ) x ON x.operator_id IS NOT NULL
        WHERE c.num IS NOT NULL AND c.dt IS NOT NULL
          AND (EXTRACT(YEAR FROM c.dt) = EXTRACT(YEAR FROM CURRENT_DATE)
               OR (EXTRACT(YEAR FROM c.dt) = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND EXTRACT(MONTH FROM c.dt) = 12))
          AND NOT EXISTS (SELECT 1 FROM hub_telecom.invoices i WHERE LOWER(TRIM(i.invoice_number)) = LOWER(TRIM(c.num)))
          AND NOT EXISTS (SELECT 1 FROM hub_telecom.rejected_invoices rj WHERE LOWER(TRIM(rj.invoice_number)) = LOWER(TRIM(c.num)))
        GROUP BY c.num
        HAVING COUNT(DISTINCT x.operator_id) = 1
    `);
    if (r.rowCount > 0) console.log(`[Telecom] ${r.rowCount} facture(s) rapprochée(s) à un engagement télécom géré en fluide intégrée(s) automatiquement`);
}

/**
 * Rattache automatiquement au compte de facturation les factures télécom qui n'en ont pas :
 * Sedit rapproche chaque facture reçue d'un engagement, et le compte est celui dont le n°
 * d'engagement correspond (uniquement si un seul compte de l'opérateur correspond).
 */
async function autoLinkAccounts() {
    await pool.query(`
        UPDATE hub_telecom.invoices i
        SET billing_account_id = m.account_id
        FROM (
            SELECT i2.id AS invoice_id, MIN(a.id) AS account_id
            FROM hub_telecom.invoices i2
            JOIN LATERAL (
                SELECT f."ENGAGEMENT" FROM hub_telecom.sedit_factures_live f
                WHERE f."ENGAGEMENT" IS NOT NULL AND (
                       LOWER(TRIM(f."FACTURE_REFERENCE")) = LOWER(TRIM(i2.invoice_number))
                    OR f."FACTURE_LIBELLE1" ILIKE '%' || TRIM(i2.invoice_number) || '%'
                    OR LOWER(TRIM(f."FACTURE_FACTIERS")) = LOWER(TRIM(i2.invoice_number)))
                ORDER BY (LOWER(TRIM(f."FACTURE_REFERENCE")) = LOWER(TRIM(i2.invoice_number))) DESC
                LIMIT 1
            ) bf ON TRUE
            JOIN hub_telecom.billing_accounts a ON a.operator_id = i2.operator_id
                AND TRIM(a.commitment_number) = ANY(string_to_array(bf."ENGAGEMENT", ','))
            WHERE i2.billing_account_id IS NULL AND TRIM(COALESCE(i2.invoice_number, '')) <> ''
            GROUP BY i2.id
            HAVING COUNT(DISTINCT a.id) = 1
        ) m
        WHERE i.id = m.invoice_id
    `);
}

/** Recharge les factures depuis Sedit si la dernière lecture a plus de REFRESH_TTL_MS. */
async function refreshFactures({ force = false } = {}) {
    if (!force && Date.now() - lastRefresh < REFRESH_TTL_MS) return;
    if (!inflight) inflight = doRefresh().finally(() => { inflight = null; });
    return inflight;
}

/** Middleware Express : lecture Sedit en direct avant les routes télécom. */
async function refreshMiddleware(req, res, next) {
    try {
        await refreshFactures();
    } catch (e) {
        // On continue avec la dernière lecture réussie (éventuellement vide) plutôt que de bloquer la page.
        console.error('[Telecom] Lecture directe Sedit impossible :', e.message);
    }
    next();
}

/** Nom et complément officiels d'un tiers, lus en direct dans Sedit (table TIERS). */
async function getTierNames(tierCode) {
    const part = (n) => `REGEXP_SUBSTR("POBJ_EXTRACT", '[^' || CHR(1) || ']+', 1, ${n})`;
    return financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(
            `SELECT ${part(2)} AS NOM, ${part(3)} AS COMPLEMENT FROM "TIERS" WHERE TRIM("TIERS") = TRIM(:code) AND ROWNUM = 1`,
            { code: String(tierCode) }
        );
        const row = r.rows[0];
        return { nom: row?.NOM ? String(row.NOM).trim() : '', complement: row?.COMPLEMENT ? String(row.COMPLEMENT).trim() : '' };
    });
}

/**
 * Synthèse des engagements (FI.MOUVEMENT / FI.MVTLIGNE) lue en direct dans Sedit, comme l'écran
 * « Synthèse » d'un engagement : Initial (MTTC_INITIAL), Engagé (MONTANTTC_E), Dégagé
 * (MTSERFAIT_E) et Reste engagé (Engagé − Dégagé), en TTC et en HT. Seuls les engagements de
 * l'année en cours sont renvoyés.
 */
async function getEngagementsLive(codes) {
    const list = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
    if (!list.length) return {};
    const binds = { year: new Date().getFullYear() };
    const ph = list.map((c, i) => { binds[`c${i}`] = c; return `:c${i}`; }).join(', ');
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    return financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(
            `SELECT TRIM(m.MOUVEMENT) AS CODE, m.LIBELLE AS LIBELLE, COUNT(*) AS N, MAX(l.EXEORIGINE) AS EXERCICE,
                    SUM(l.MTTC_INITIAL) AS INIT_TTC, SUM(l.MTTC_INITIAL - NVL(l.MTVA_INITIAL, 0)) AS INIT_HT,
                    SUM(l.MONTANTTC_E) AS ENG_TTC, SUM(l.MONTANTTC_E - NVL(l.MTVA_E, 0)) AS ENG_HT,
                    SUM(l.MTSERFAIT_E) AS DEG_TTC,
                    SUM(CASE WHEN l.MONTANTTC_E = 0 THEN 0
                             ELSE l.MTSERFAIT_E * (l.MONTANTTC_E - NVL(l.MTVA_E, 0)) / l.MONTANTTC_E END) AS DEG_HT
             FROM FI.MOUVEMENT m
             JOIN FI.MVTLIGNE l ON l.MOUVEMENT = m.ROO_IMA_REF
             WHERE TRIM(m.MOUVEMENT) IN (${ph})
             GROUP BY TRIM(m.MOUVEMENT), m.ROO_IMA_REF, m.LIBELLE
             HAVING MAX(l.EXEORIGINE) = :year`,
            binds
        );
        // Un même code peut exister sur plusieurs mouvements (ex. régularisation) : on garde celui
        // qui compte le plus de lignes.
        const best = {};
        for (const row of r.rows) {
            if (!best[row.CODE] || row.N > best[row.CODE].N) best[row.CODE] = row;
        }
        const out = {};
        for (const [code, row] of Object.entries(best)) {
            const ttc = { initial: r2(row.INIT_TTC), engage: r2(row.ENG_TTC), degage: r2(row.DEG_TTC) };
            const ht = { initial: r2(row.INIT_HT), engage: r2(row.ENG_HT), degage: r2(row.DEG_HT) };
            out[code] = {
                libelle: row.LIBELLE ? String(row.LIBELLE).trim() : '',
                exercice: row.EXERCICE,
                ttc: { ...ttc, reste: r2(ttc.engage - ttc.degage) },
                ht: { ...ht, reste: r2(ht.engage - ht.degage) },
            };
        }
        return out;
    });
}

/**
 * Liste des engagements télécom de l'exercice en cours lue en direct dans Sedit : engagements
 * (FI.MOUVEMENT) ayant au moins une ligne d'imputation de nature 6262. Montants TTC comme
 * l'écran « Synthèse » : engagé (MONTANTTC_E), dégagé (MTSERFAIT_E), reste = engagé − dégagé.
 */
async function getTelecomEngagementsLive() {
    const year = new Date().getFullYear();
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(
            `SELECT TRIM(m.MOUVEMENT) AS CODE, m.LIBELLE AS LIBELLE, COUNT(*) AS N,
                    SUM(l.MONTANTTC_E) AS ENG, SUM(l.MTSERFAIT_E) AS DEG,
                    (SELECT REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2) FROM FI.TIERS t WHERE t.ROO_IMA_REF = m.TIERS) AS TIERS,
                    (SELECT TRIM(t.TIERS) FROM FI.TIERS t WHERE t.ROO_IMA_REF = m.TIERS) AS TIERS_CODE,
                    MAX((SELECT MAX(i.TYPE_SECTION) FROM FI.IMPUTATION i WHERE i.ROO_IMA_REF = l.IMPUTATION)) AS SECTION
             FROM FI.MOUVEMENT m
             JOIN FI.MVTLIGNE l ON l.MOUVEMENT = m.ROO_IMA_REF
             WHERE l.EXEORIGINE = :year
               AND EXISTS (SELECT 1 FROM FI.MVTLIGNE l2 JOIN FI.IMPUTATION i2 ON i2.ROO_IMA_REF = l2.IMPUTATION
                           WHERE l2.MOUVEMENT = m.ROO_IMA_REF AND TRIM(i2.CODECOMP) = '6262')
             GROUP BY TRIM(m.MOUVEMENT), m.ROO_IMA_REF, m.LIBELLE, m.TIERS`,
            { year }
        );
        return r.rows;
    });
    // Un même code peut exister sur plusieurs mouvements : on garde celui qui a le plus de lignes.
    const best = {};
    for (const row of rows) if (!best[row.CODE] || row.N > best[row.CODE].N) best[row.CODE] = row;
    return Object.values(best).map((row) => {
        const engaged = r2(row.ENG);
        const degage = r2(row.DEG);
        return {
            commitment_number: row.CODE,
            label: row.LIBELLE ? String(row.LIBELLE).trim() : '',
            operator_name: row.TIERS ? String(row.TIERS).trim() : '',
            tiers_code: row.TIERS_CODE ? String(row.TIERS_CODE).trim() : null,
            year: String(year),
            section: row.SECTION ? String(row.SECTION).trim() : '',
            amount: engaged,
            engaged_amount: engaged,
            remaining_amount: r2(engaged - degage),
            invoiced_amount: degage,
        };
    }).sort((a, b) => a.commitment_number.localeCompare(b.commitment_number));
}

module.exports = { getTelecomEngagementsLive, getEngagementsLive, refreshFactures, refreshMiddleware, getTierNames, TABLE: 'hub_telecom.sedit_factures_live' };
