/**
 * DGP — délai global de paiement des factures (Sedit, Oracle FI).
 *
 * DGP = nombre de jours entre la date de réception (FACTURE.DATENTREE) et la date
 * de paiement effective (FI.MANDAT.DATE_PAIEMENT, atteint via FI.FAIT). Pour les
 * factures non encore payées (non mandatées), on calcule un délai PROVISOIRE =
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
const toDateStr = (d) => (d && !isNaN(new Date(d).getTime()))
    ? new Date(d).toISOString().slice(0, 10) : null;

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

    const nowDay = dayNum(new Date());
    const records = [];
    for (const row of rows) {
        const roo = String(row.FROO || '').trim();
        if (!roo) continue;
        const fy = Number(row.FY) || null;
        const received = row.DT ? new Date(row.DT) : null;
        const paid = row.DP ? new Date(row.DP) : null;
        const planned = row.DPP ? new Date(row.DPP) : null;
        const mandate = Number(row.NB) > 0;

        let dgp = null;
        let definitive = false;
        if (row.DREJ) {
            // Facture refusée : DGP masqué (refused = true, dgp null).
        } else if (received && !isNaN(received.getTime())) {
            let endDay;
            if (paid) { endDay = dayNum(paid); definitive = true; }
            else if (mandate) { endDay = planned ? dayNum(planned) : nowDay; definitive = true; }
            else { endDay = nowDay; definitive = false; }
            dgp = Math.round((endDay - dayNum(received)) / 86400000);
        }

        records.push({
            roo,
            num: String(row.NUM || '').trim(),
            fy,
            reception: toDateStr(row.DT),
            paiement: toDateStr(row.DP),
            dgp,
            definitive,
            refused: !!row.DREJ,
            mandate_date: toDateStr(row.DMAND),
            mandated: mandate,
        });
    }

    // Remplacement atomique des exercices recalculés (DELETE puis INSERT par lots).
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM finance.facture_dgp WHERE fiscal_year = ANY($1)', [years]);
        const BATCH = 500;
        for (let i = 0; i < records.length; i += BATCH) {
            const batch = records.slice(i, i + BATCH);
            const values = [];
            const placeholders = batch.map((r, j) => {
                const b = j * 10;
                values.push(r.roo, r.num, r.fy, r.reception, r.paiement, r.dgp, r.definitive, r.refused, r.mandate_date, r.mandated);
                return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
            });
            await client.query(
                `INSERT INTO finance.facture_dgp
                   (facture_roo, facture_num, fiscal_year, reception_date, paiement_date, dgp, definitive, refused, mandate_date, mandated)
                 VALUES ${placeholders.join(',')}`,
                values
            );
        }
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
          WHERE fiscal_year = $1 AND NOT refused`,
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

module.exports = { getDgpStats, getFacturesDgp, refreshFacturesDgpCache, getMandateInfoByRoos };
