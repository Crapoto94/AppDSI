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
];

let lastRefresh = 0;
let inflight = null;
let tableReady = false;

async function ensureTable() {
    if (tableReady) return;
    await pool.query('CREATE SCHEMA IF NOT EXISTS hub_telecom');
    await pool.query(`CREATE UNLOGGED TABLE IF NOT EXISTS hub_telecom.sedit_factures_live (
        ${COLUMNS.map(([c, t]) => `"${c}" ${t}`).join(', ')}
    )`);
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
        const select = COLUMNS.map(([c]) => (present.has(c) ? `"_o"."${c}"` : `NULL`) + ` AS "${c}"`).join(', ');
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

module.exports = { refreshFactures, refreshMiddleware, getTierNames, TABLE: 'hub_telecom.sedit_factures_live' };
