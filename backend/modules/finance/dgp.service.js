/**
 * DGP — délai global de paiement des factures (Sedit, Oracle FI).
 *
 * DGP = nombre de jours entre la date de réception (FACTURE.DATENTREE) et la date
 * de paiement effective (FI.MANDAT.DATE_PAIEMENT, atteint via FI.FAIT). Pour les
 * factures non encore payées (mandatées ou non), on calcule un délai PROVISOIRE =
 * jours écoulés depuis la réception (aujourd'hui - DATENTREE).
 *
 * Ces valeurs sont PRÉCALCULÉES dans `finance.facture_dgp` et rafraîchies une fois
 * par jour (cron 05h00, voir server.js) : côté Sedit la date de mandatement n'est
 * mise à jour qu'une fois par jour, donc un cache quotidien suffit — et il évite un
 * scan de FI.FAIT (~1,9 M lignes, non indexée sur la facture) à chaque affichage de
 * la liste des factures. Les lectures (liste + widget dashboard) se font donc sur
 * Postgres, quasi instantanément.
 */
const oracledb = require('oracledb');
const { pool, getSqlite } = require('../../shared/database');
const financeShare = require('./finance-share.controller');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Mots-clés à ne pas préfixer par T1."..." (même liste que sedit-direct.service.js).
const RESERVED_WHERE = new Set([
    'WHERE', 'AND', 'OR', 'LIKE', 'IN', 'NULL', 'IS', 'NOT', 'BETWEEN', 'ORDER', 'BY',
    'DESC', 'ASC', 'DATE', 'TO_DATE', 'TO_CHAR', 'NVL', 'COALESCE', 'TRIM', 'UPPER',
    'LOWER', 'SUBSTR', 'INSTR', 'COUNT', 'SUM', 'ROWNUM',
]);

const dayNum = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
// Date locale (jour calendaire) : node-oracledb renvoie les DATE à minuit LOCAL ; toISOString() les décalait d'un jour (UTC).
const toDateStr = (d) => {
    const x = d ? new Date(d) : null;
    if (!x || isNaN(x.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

/** Filtre de périmètre (services) de la synchro FACTURE, préfixé pour l'alias T1. */
async function getFactureScopeWhere() {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    const row = await db.get("SELECT where_clause FROM oracle_sync_config WHERE type = 'FINANCES' AND table_name = 'FACTURE'");
    const raw = String(row?.where_clause || '').trim().replace(/"/g, "'").replace(/^where\s+/i, '');
    if (!raw) return null;
    return '(' + raw.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m) => (
        RESERVED_WHERE.has(m.toUpperCase()) ? m : `T1."${m}"`
    )) + ')';
}

/** Ligne Oracle (FACTURE + FAIT/MANDAT agreges) -> enregistrement du cache. */
function rowToRecord(row) {
    const nowDay = dayNum(new Date());
    const roo = String(row.FROO || '').trim();
    if (!roo) return null;
    const fy = Number(row.FY) || null;
    const received = row.DT ? new Date(row.DT) : null;
    const paid = row.DP ? new Date(row.DP) : null;
    const mandate = Number(row.NB) > 0;

    let dgp = null;
    let definitive = false;
    if (row.DREJ) {
        // Facture REJETEE : le delai s'arrete a la date de rejet (reception -> rejet), definitif ; refused = true la distingue des payees.
        const rejected = new Date(row.DREJ);
        if (received && !isNaN(received.getTime()) && !isNaN(rejected.getTime())) {
            dgp = Math.max(0, Math.round((dayNum(rejected) - dayNum(received)) / 86400000));
            definitive = true;
        }
    } else if (received && !isNaN(received.getTime())) {
        // Regle : le DGP est definitif UNIQUEMENT une fois la facture PAYEE (reception -> date de paiement). Tant qu'elle n'est pas
        // payee - y compris mandatee - il est PROVISOIRE : jours ecoules depuis la reception (aujourd'hui - reception). On n'utilise
        // plus la date de paiement PREVUE (DATPAIPREV) : elle donnait un DGP futur (ex. 18 j pour une facture recue la veille).
        let endDay;
        if (paid) { endDay = dayNum(paid); definitive = true; }
        else { endDay = nowDay; definitive = false; }
        dgp = Math.max(0, Math.round((endDay - dayNum(received)) / 86400000));
    }
    return {
        roo, num: String(row.NUM || '').trim(), fy,
        reception: toDateStr(row.DT), paiement: toDateStr(row.DP), dgp, definitive, refused: !!row.DREJ,
        mandate_date: toDateStr(row.DMAND), mandated: mandate, in_scope: Number(row.IN_SCOPE) === 1,
    };
}

/** Upsert par lots dans finance.facture_dgp (sur facture_roo). */
async function upsertRecords(client, records) {
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const values = [];
        const placeholders = batch.map((r, j) => {
            const b = j * 11;
            values.push(r.roo, r.num, r.fy, r.reception, r.paiement, r.dgp, r.definitive, r.refused, r.mandate_date, r.mandated, r.in_scope);
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
        });
        await client.query(
            `INSERT INTO finance.facture_dgp
               (facture_roo, facture_num, fiscal_year, reception_date, paiement_date, dgp, definitive, refused, mandate_date, mandated, in_scope)
             VALUES ${placeholders.join(',')}
             ON CONFLICT (facture_roo) DO UPDATE SET
               facture_num = EXCLUDED.facture_num, fiscal_year = EXCLUDED.fiscal_year, reception_date = EXCLUDED.reception_date,
               paiement_date = EXCLUDED.paiement_date, dgp = EXCLUDED.dgp, definitive = EXCLUDED.definitive, refused = EXCLUDED.refused,
               mandate_date = EXCLUDED.mandate_date, mandated = EXCLUDED.mandated, in_scope = finance.facture_dgp.in_scope OR EXCLUDED.in_scope,
               updated_at = NOW()`,
            values
        );
    }
}

/**
 * DGP A LA DEMANDE (MagApp « Mes factures ») : calcule et met en cache le DGP des seules factures demandees qui manquent au cache
 * ou dont le calcul a plus de `maxAgeHours` heures. Evite un recalcul de toute la collectivite : ~1-2 s pour quelques centaines de
 * factures (le scan de FI.FAIT est restreint a la liste). Les lignes creees ici sont hors perimetre DSI (in_scope = false) et
 * n'alterent donc pas les statistiques /budget. Les appels concurrents s'executent a la suite (pas de double calcul).
 */
let ensureChain = Promise.resolve();
function ensureDgpForRoos(roos, opts = {}) {
    const run = () => ensureDgpForRoosNow(roos, opts);
    const p = ensureChain.then(run, run);
    ensureChain = p.catch(() => {});
    return p;
}
async function ensureDgpForRoosNow(roos, { maxAgeHours = 6 } = {}) {
    const list = Array.from(new Set((roos || []).map(r => String(r || '').trim()).filter(Boolean)));
    if (!list.length) return 0;
    const fresh = await pool.query(
        `SELECT facture_roo FROM finance.facture_dgp WHERE facture_roo = ANY($1) AND updated_at > NOW() - ($2 || ' hours')::interval`,
        [list, String(maxAgeHours)]
    );
    const freshSet = new Set(fresh.rows.map(r => r.facture_roo));
    const todo = list.filter(r => !freshSet.has(r));
    if (!todo.length) return 0;

    const CHUNK = 500;
    const records = [];
    await financeShare.withFinanceOracle(async (conn) => {
        for (let i = 0; i < todo.length; i += CHUNK) {
            const chunk = todo.slice(i, i + CHUNK);
            const binds = {};
            const marks = chunk.map((r, k) => { binds['r' + k] = r; return ':r' + k; }).join(',');
            const res = await conn.execute(
                `SELECT TRIM(f.ROO_IMA_REF) AS FROO, TRIM(f.FACTURE) AS NUM, f.DATENTREE AS DT, f.DATE_REJET AS DREJ,
                        EXTRACT(YEAR FROM f.DATENTREE) AS FY, 0 AS IN_SCOPE, p.NB AS NB, p.DP AS DP, p.DMAND AS DMAND
                   FROM FI.FACTURE f
                   LEFT JOIN (
                       SELECT TRIM(fa.FACTURE_ID_CS) AS FROO, COUNT(fa.MANDAT_ID_CS) AS NB,
                              MAX(mm.DATE_PAIEMENT) AS DP, MAX(mm.DATMANDAT) AS DMAND
                         FROM FI.FAIT fa
                         LEFT JOIN FI.MANDAT mm ON TRIM(mm.ROO_IMA_REF) = TRIM(fa.MANDAT_ID_CS)
                        WHERE TRIM(fa.FACTURE_ID_CS) IN (${marks})
                        GROUP BY TRIM(fa.FACTURE_ID_CS)
                   ) p ON p.FROO = TRIM(f.ROO_IMA_REF)
                  WHERE TRIM(f.ROO_IMA_REF) IN (${marks})`,
                binds
            );
            for (const row of res.rows) { const rec = rowToRecord(row); if (rec) records.push(rec); }
        }
    });
    if (records.length) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); await upsertRecords(client, records); await client.query('COMMIT'); }
        catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
        finally { client.release(); }
    }
    return records.length;
}

/**
 * Recalcule le cache `finance.facture_dgp` depuis Sedit pour les exercices demandés
 * (année en cours + n-1 par défaut). Une passe Oracle « set-based » (le scan de
 * FI.FAIT est fait une seule fois, groupé par facture), puis upsert Postgres.
 *
 * @param {object} [opts]
 * @param {number} [opts.year]   exercice de référence (défaut : année en cours)
 * @param {number[]} [opts.years] exercices à recalculer (défaut : [year, year-1])
 */
async function refreshFacturesDgpCache(opts = {}) {
    const year = Number(opts.year) || new Date().getFullYear();
    const years = Array.isArray(opts.years) && opts.years.length ? opts.years.map(Number) : [year, year - 1];
    const scopeWhere = await getFactureScopeWhere();

    const yearBinds = {};
    const yearPlaceholders = years.map((y, i) => { yearBinds['y' + i] = y; return ':y' + i; });
    const conditions = [`EXTRACT(YEAR FROM f.DATENTREE) IN (${yearPlaceholders.join(',')})`];
    if (scopeWhere) conditions.push(scopeWhere.replace(/\bT1\./g, 'f.'));

    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const res = await conn.execute(
            `SELECT TRIM(f.ROO_IMA_REF) AS FROO, TRIM(f.FACTURE) AS NUM,
                    f.DATENTREE AS DT, f.DATPAIPREV AS DPP, f.DATE_REJET AS DREJ,
                    EXTRACT(YEAR FROM f.DATENTREE) AS FY,
                    ${scopeWhere ? `CASE WHEN ${scopeWhere.replace(/\bT1\./g, 'f.')} THEN 1 ELSE 0 END` : '1'} AS IN_SCOPE,
                    p.NB AS NB, p.DP AS DP, p.DMAND AS DMAND
               FROM FI.FACTURE f
               LEFT JOIN (
                   SELECT TRIM(fa.FACTURE_ID_CS) AS FROO,
                          COUNT(fa.MANDAT_ID_CS) AS NB,
                          MAX(mm.DATE_PAIEMENT) AS DP,
                          MAX(mm.DATMANDAT) AS DMAND
                     FROM FI.FAIT fa
                     LEFT JOIN FI.MANDAT mm ON TRIM(mm.ROO_IMA_REF) = TRIM(fa.MANDAT_ID_CS)
                    GROUP BY TRIM(fa.FACTURE_ID_CS)
               ) p ON p.FROO = TRIM(f.ROO_IMA_REF)
              WHERE ${conditions.join(' AND ')}`,
            yearBinds
        );
        return res.rows;
    });

    const records = rows.map(rowToRecord).filter(Boolean);

    // Remplacement atomique des exercices recalcules pour le PERIMETRE DSI (les lignes calculees a la demande, hors perimetre, sont conservees).
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM finance.facture_dgp WHERE fiscal_year = ANY($1) AND in_scope', [years]);
        await upsertRecords(client, records);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }

    console.log(`[DGP] Cache recalculé : ${records.length} facture(s) (exercices ${years.join(', ')}).`);
    return { years, count: records.length, refreshed_at: new Date().toISOString() };
}

/**
 * DGP par facture depuis le cache Postgres (lecture rapide) pour une liste de ROO.
 * Renvoie `{ [roo]: { dgp, def, refuse } }` :
 *   - `dgp`    : délai en jours (ou null si non calculable / facture refusée) ;
 *   - `def`    : 1 = définitif (facture mandatée/payée), 0 = provisoire (non mandatée) ;
 *   - `refuse` : 1 = facture rejetée dans Sedit (DGP masqué côté front).
 */
async function getFacturesDgp(roos) {
    const list = Array.from(new Set((roos || []).map(r => String(r || '').trim()).filter(Boolean))).slice(0, 5000);
    if (list.length === 0) return {};
    const { rows } = await pool.query(
        `SELECT facture_roo, dgp, definitive, refused
           FROM finance.facture_dgp WHERE facture_roo = ANY($1)`,
        [list]
    );
    const out = {};
    for (const r of rows) {
        out[r.facture_roo] = {
            dgp: r.dgp == null ? null : Number(r.dgp),
            def: r.definitive ? 1 : 0,
            refuse: r.refused ? 1 : 0,
        };
    }
    return out;
}

/**
 * Statistiques DGP pour un exercice (widget dashboard), depuis le cache Postgres.
 * @param {object} [opts]
 * @param {number|string} [opts.fiscalYear] année (colonne FACTURE.DATENTREE)
 */
async function getDgpStats(opts = {}) {
    const fiscalYear = Number(opts.fiscalYear) || new Date().getFullYear();
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS nb,
                COUNT(*) FILTER (WHERE definitive)::int AS nb_payees,
                COUNT(*) FILTER (WHERE NOT definitive)::int AS nb_non_payees,
                ROUND(AVG(dgp) FILTER (WHERE definitive), 1) AS dgp_moyen,
                COUNT(*) FILTER (WHERE definitive AND dgp > 30)::int AS nb_hors,
                COUNT(*) FILTER (WHERE NOT definitive AND dgp > 30)::int AS nb_prov
           FROM finance.facture_dgp
          WHERE fiscal_year = $1 AND NOT refused AND in_scope`,
        [fiscalYear]
    );
    const r = rows[0] || {};
    const nbPayees = Number(r.nb_payees) || 0;
    const nbHors = Number(r.nb_hors) || 0;
    return {
        fiscal_year: fiscalYear,
        nb_factures: Number(r.nb) || 0,
        nb_payees: nbPayees,
        nb_non_payees: Number(r.nb_non_payees) || 0,
        dgp_moyen: r.dgp_moyen != null ? Number(r.dgp_moyen) : null,
        nb_hors_delai: nbHors,
        nb_prov_hors_delai: Number(r.nb_prov) || 0,
        taux_dans_delai: nbPayees > 0 ? Math.round(((nbPayees - nbHors) / nbPayees) * 1000) / 10 : null,
    };
}

/**
 * Évolution du DGP au cours de l'année, PAR SEMAINE (lundi → dimanche), depuis le cache Postgres.
 * Base : factures effectivement PAYÉES dans l'année (date de paiement), non refusées ; le DGP d'une facture est le délai
 * réception → paiement. Pour chaque semaine : DGP moyen des factures payées cette semaine-là, et DGP moyen CUMULÉ depuis
 * janvier. Les semaines sans paiement sont présentes (valeurs nulles) pour une courbe continue.
 * @param {object} [opts]
 * @param {number|string} [opts.fiscalYear] année (défaut : année en cours)
 * @param {'global'|'ville'} [opts.mode] « global » (défaut) : réception → PAIEMENT (inclut le délai du comptable public / DGFiP), seuil 30 j,
 *        facture classée dans la semaine de son paiement ; « ville » : réception → MANDATEMENT (délai de la collectivité seule),
 *        seuil 20 j (part de l'ordonnateur), facture classée dans la semaine de son mandatement.
 */
async function getDgpWeekly(opts = {}) {
    const year = Number(opts.fiscalYear) || new Date().getFullYear();
    const mode = opts.mode === 'ville' ? 'ville' : 'global';
    const seuil = mode === 'ville' ? 20 : 30;
    // Date de fin du délai et durée en jours selon le mode (dates du cache : réception, mandatement, paiement)
    const endCol = mode === 'ville' ? 'mandate_date' : 'paiement_date';
    const dureeExpr = mode === 'ville' ? '(mandate_date::date - reception_date::date)' : 'dgp';
    const { rows } = await pool.query(
        `SELECT to_char(date_trunc('week', ${endCol}), 'YYYY-MM-DD') AS semaine,
                COUNT(*)::int AS nb, SUM(${dureeExpr})::int AS somme, COUNT(*) FILTER (WHERE ${dureeExpr} > ${seuil})::int AS nb_hors
           FROM finance.facture_dgp
          WHERE in_scope AND NOT refused AND ${endCol} IS NOT NULL AND reception_date IS NOT NULL AND ${dureeExpr} IS NOT NULL
            AND EXTRACT(YEAR FROM ${endCol}) = $1
          GROUP BY 1 ORDER BY 1`,
        [year]
    );
    const bySemaine = new Map(rows.map(r => [r.semaine, r]));
    const iso = (d) => d.toISOString().slice(0, 10);
    // Lundi de la semaine contenant le 1er janvier → dernière semaine à afficher (semaine courante, ou fin d'année)
    const start = new Date(Date.UTC(year, 0, 1));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const today = new Date();
    const end = year < today.getFullYear() ? new Date(Date.UTC(year, 11, 31)) : new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const weeks = [];
    let cumNb = 0, cumSum = 0, cumHors = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
        const key = iso(d);
        const r = bySemaine.get(key);
        const nb = r ? Number(r.nb) : 0;
        if (r) { cumNb += nb; cumSum += Number(r.somme); cumHors += Number(r.nb_hors); }
        // Numéro de semaine ISO (jeudi de la semaine)
        const th = new Date(d); th.setUTCDate(th.getUTCDate() + 3);
        const jan4 = new Date(Date.UTC(th.getUTCFullYear(), 0, 4));
        const num = 1 + Math.round(((th - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
        weeks.push({
            semaine: key, num, nb,
            dgp_semaine: r ? Math.round((Number(r.somme) / nb) * 10) / 10 : null,
            dgp_cumule: cumNb ? Math.round((cumSum / cumNb) * 10) / 10 : null,
            nb_cumule: cumNb,
            nb_hors_cumule: cumHors,
        });
    }
    return { year, mode, seuil, weeks, dgp_moyen: cumNb ? Math.round((cumSum / cumNb) * 10) / 10 : null, nb_payees: cumNb, nb_hors_delai: cumHors };
}

/**
 * Info de mandatement par facture (ROO) depuis le cache : `{ [roo]: { mandate_date, mandated } }`.
 * Utilisé par /telecom (contour « mandaté » + infobulle date de mandatement de la synthèse mensuelle).
 */
async function getMandateInfoByRoos(roos) {
    const list = Array.from(new Set((roos || []).map(r => String(r || '').trim()).filter(Boolean)));
    if (list.length === 0) return {};
    const { rows } = await pool.query(
        `SELECT facture_roo, mandate_date, mandated
           FROM finance.facture_dgp WHERE facture_roo = ANY($1)`,
        [list]
    );
    const out = {};
    for (const r of rows) {
        out[r.facture_roo] = {
            mandate_date: r.mandate_date ? new Date(r.mandate_date).toISOString().slice(0, 10) : null,
            mandated: !!r.mandated,
        };
    }
    return out;
}

module.exports = { ensureDgpForRoos, getDgpStats, getDgpWeekly, getFacturesDgp, refreshFacturesDgpCache, getMandateInfoByRoos };
