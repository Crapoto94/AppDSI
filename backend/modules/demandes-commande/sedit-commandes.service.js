/**
 * Lecture (seule) des commandes Sedit (FI.COMMANDE) pour associer une commande
 * à une demande de commande — voir skill "sedit-finances".
 */
const oracledb = require('oracledb');
const financeShare = require('../finance/finance-share.controller');

const SELECT = `
  SELECT TRIM(c.ROO_IMA_REF) AS ROO,
         c.COMMANDE AS NUMERO,
         TO_CHAR(c.CMD_DATECOMMANDE, 'DD/MM/YYYY') AS DATE_COMMANDE,
         c.MONTANT_TTC AS MONTANT_TTC,
         c.LIBELLE || c.CMD_LIBELLE2 AS LIBELLE,
         (SELECT REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2) FROM FI.TIERS t WHERE TRIM(t.ROO_IMA_REF) = TRIM(c.TIERS) AND ROWNUM = 1) AS TIERS_NOM,
         (SELECT s.CLEACCES || ' / ' || s.LIBELLE FROM FI.SERVICEFI s WHERE TRIM(s.ROO_IMA_REF) = TRIM(c.SERVICE) AND ROWNUM = 1) AS SERVICE
    FROM FI.COMMANDE c`;

// Périmètre DSI : code service (SERVICEFI.CLEACCES) commençant par BF (ex. « BF1 / DIRECTION DSI »).
const DSI_FILTER = `EXISTS (SELECT 1 FROM FI.SERVICEFI sd WHERE TRIM(sd.ROO_IMA_REF) = TRIM(c.SERVICE) AND sd.CLEACCES LIKE 'BF%')`;

const OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/** Les `limit` dernières commandes de la DSI (par date puis n°), filtrables par n°/libellé. */
async function listLastCommandes({ limit = 20, search = '' } = {}) {
    const n = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const binds = {};
    let where = `WHERE ${DSI_FILTER}`;
    if (search) {
        where += ` AND UPPER(c.COMMANDE || ' ' || c.LIBELLE || c.CMD_LIBELLE2) LIKE '%' || UPPER(:search) || '%'`;
        binds.search = String(search);
    }
    const sql = `${SELECT} ${where} ORDER BY c.CMD_DATECOMMANDE DESC NULLS LAST, c.COMMANDE DESC FETCH FIRST ${n} ROWS ONLY`;
    return financeShare.withFinanceOracle(async (conn) => (await conn.execute(sql, binds, OPTS)).rows);
}

async function getCommandeByRoo(roo) {
    return financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(`${SELECT} WHERE TRIM(c.ROO_IMA_REF) = :roo AND ${DSI_FILTER}`, { roo: String(roo).trim() }, OPTS);
        return r.rows[0] || null;
    });
}

/**
 * État d'avancement de commandes Sedit (lecture seule), par ROO :
 *   CMD_CODEAVANCEMENT : 0 = saisie (brouillon), 1 = en circuit de validation, 4 = validée (bon édité)
 *   EDITION 'O' = bon de commande édité ; SIGNED = 1 sur la PJ « BonDeCommande… » = bon signé.
 */
async function getCommandesEtat(roos) {
    const list = [...new Set((roos || []).map(r => String(r || '').trim()).filter(Boolean))];
    const out = new Map();
    if (!list.length) return out;
    await financeShare.withFinanceOracle(async (conn) => {
        for (let i = 0; i < list.length; i += 500) {
            const chunk = list.slice(i, i + 500);
            const binds = {};
            const ph = chunk.map((r, k) => { binds['r' + k] = r; return ':r' + k; }).join(',');
            const r = await conn.execute(
                `SELECT TRIM(c.ROO_IMA_REF) AS ROO, c.CMD_CODEAVANCEMENT AS AVANCEMENT, c.EDITION AS EDITION,
                        NVL((SELECT MAX(pj.SIGNED) FROM FI.FIPES_OBJ_PJ l JOIN FI.PJ_PES pj ON pj.ROO_IMA_REF = l.PJPES_ROO
                              WHERE l.OBJECT_ROO = c.ROO_IMA_REF AND l.OBJECT_TYPE = 'COMMANDE' AND pj.NOM_PJ LIKE 'BonDeCommande%'), 0) AS SIGNE
                   FROM FI.COMMANDE c WHERE TRIM(c.ROO_IMA_REF) IN (${ph})`, binds, OPTS);
            for (const row of r.rows) out.set(row.ROO, { avancement: String(row.AVANCEMENT), edition: row.EDITION === 'O', signe: Number(row.SIGNE) === 1 });
        }
    });
    return out;
}

module.exports = { listLastCommandes, getCommandeByRoo, getCommandesEtat };
