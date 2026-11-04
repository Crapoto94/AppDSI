/**
 * Lecture EN DIRECT dans Sedit (Oracle FI) des FACTURES et des COMMANDES de la DSI, pour /budget.
 *
 * Jusqu'ici ces deux listes venaient d'une copie PostgreSQL (oracle.gf_oracle_facture / gf_oracle_commande) mise à jour
 * par une synchronisation quotidienne : une facture reçue ou une commande passée dans la journée n'apparaissait qu'au
 * lendemain. Les lignes retournées ici ont EXACTEMENT les noms de colonnes de la copie (FACTURE_*, COMMANDE_*, TIERS_*,
 * SERVICEFI_*, BUDGET_*), de sorte que le reste du code (finance.controller.js) ne change pas.
 *
 * Périmètre = celui de la synchro (clause WHERE configurée dans /admin « oracle_sync_config », services de la DSI).
 * Cache mémoire court (3 min) par table et exercice, avec fusion des lectures concurrentes.
 */
const oracledb = require('oracledb');
const { getSqlite } = require('../../shared/database');
const financeShare = require('./finance-share.controller');

const OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const TTL_MS = 3 * 60 * 1000;
const cache = new Map();   // clé -> { ts, rows }
const inflight = new Map(); // clé -> Promise

const trim = (v) => (v == null ? null : String(v).trim());
const iso = (d) => (d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null);
const day = (d) => (d instanceof Date && !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

/** Clause de périmètre configurée pour la synchro de la table (ex. « EF_SERVICE LIKE '5301…%' OR … »), préfixée par l'alias. */
async function scopeWhere(table, alias) {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    const row = await db.get("SELECT where_clause FROM oracle_sync_config WHERE type = 'FINANCES' AND table_name = ?", [table]);
    const raw = String(row && row.where_clause || '').trim().replace(/"/g, "'").replace(/^where\s+/i, '');
    if (!raw) return null;
    const reserved = new Set(['WHERE', 'AND', 'OR', 'LIKE', 'IN', 'NULL', 'IS', 'NOT', 'BETWEEN', 'TRIM', 'UPPER', 'LOWER', 'NVL']);
    // Préfixe les noms de colonnes (hors mots-clés et hors littéraux entre quotes)
    return '(' + raw.replace(/'[^']*'|\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (m, id) => (id && !reserved.has(id.toUpperCase()) ? `${alias}.${id}` : m)) + ')';
}

async function cached(key, loader, refresh) {
    const hit = cache.get(key);
    if (!refresh && hit && Date.now() - hit.ts < TTL_MS) return hit.rows;
    if (inflight.has(key)) return inflight.get(key);
    const p = loader().then((rows) => { cache.set(key, { ts: Date.now(), rows }); return rows; }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
}

/** Factures dont la date d'arrivée OU l'échéance tombe dans l'exercice. */
function readFactures(year, { refresh = false } = {}) {
    const y = parseInt(year, 10);
    return cached(`F${y}`, async () => {
        const scope = await scopeWhere('FACTURE', 'f');
        const sql = `
            SELECT TRIM(f.ROO_IMA_REF) AS ROO, f.POBJ_EXTRACT AS POBJ, TRIM(f.FACTURE) AS NUM, f.FACTIERS AS FACTIERS,
                   f.LIBELLE1 AS LIB1, f.LIBELLE2 AS LIB2, f.REFERENCE AS REF, f.DATENTREE AS DT_ENTREE, f.DATPAIPREV AS DT_PAIPREV,
                   f.MONTANTTC_E AS MONTANT,
                   (SELECT s.CLEACCES FROM FI.SERVICEFI s WHERE TRIM(s.ROO_IMA_REF) = TRIM(f.EF_SERVICE) AND ROWNUM = 1) AS SERVICE_CLE,
                   (SELECT e.LIBELLE FROM FI.FACETAT e WHERE TRIM(e.ROO_IMA_REF) = TRIM(f.FACETAT) AND ROWNUM = 1) AS ETAT_LIB,
                   (SELECT e.BLOCAGE FROM FI.FACETAT e WHERE TRIM(e.ROO_IMA_REF) = TRIM(f.FACETAT) AND ROWNUM = 1) AS ETAT_BLOC,
                   (SELECT e.CLEACCES FROM FI.FACETAT e WHERE TRIM(e.ROO_IMA_REF) = TRIM(f.FACETAT) AND ROWNUM = 1) AS ETAT_CLE,
                   (SELECT t.POBJ_EXTRACT FROM FI.TIERS t WHERE TRIM(t.ROO_IMA_REF) = TRIM(f.TIERS) AND ROWNUM = 1) AS TIERS_POBJ
              FROM FI.FACTURE f
             WHERE (EXTRACT(YEAR FROM f.DATENTREE) = :y OR EXTRACT(YEAR FROM f.DATPAIPREV) = :y)
               ${scope ? `AND ${scope}` : ''}`;
        const rows = await financeShare.withFinanceOracle(async (conn) => (await conn.execute(sql, { y }, OPTS)).rows);
        return rows.map((r) => {
            const seg = String(r.POBJ || '').split('\u0001').map((x) => x.trim());
            const tseg = String(r.TIERS_POBJ || '').split('\u0001').map((x) => x.trim());
            const out = {
                FACTURE_ROO_IMA_REF: r.ROO, FACTURE_POBJ_EXTRACT: r.POBJ, TIERS_POBJ_EXTRACT: r.TIERS_POBJ,
                FACTURE_FACTURE: r.NUM, FACTURE_FACTIERS: trim(r.FACTIERS), FACTURE_LIBELLE1: trim(r.LIB1), FACTURE_LIBELLE2: trim(r.LIB2), FACTURE_REFERENCE: trim(r.REF),
                // « XXXXX » = valeur de repli de la copie synchronisée quand l'état est introuvable : les écrans la traitent comme « à traiter »
                FACETAT_LIBELLE: trim(r.ETAT_LIB) || 'XXXXX', FACETAT_BLOCAGE: trim(r.ETAT_BLOC) || 'XXXXX', FACETAT_CLEACCES: trim(r.ETAT_CLE) || 'XXXXX',
                FACTURE_DATENTREE: day(r.DT_ENTREE), FACTURE_DATPAIPREV: day(r.DT_PAIPREV),
                FACTURE_MONTANTTC_E: r.MONTANT == null ? null : String(r.MONTANT),
                SERVICEFI_CLEACCES: trim(r.SERVICE_CLE),
            };
            for (let i = 1; i <= 9; i++) out[`FACTURE_POBJ_EXTRACT_${i}`] = seg[i - 1] || '';
            for (let i = 1; i <= 7; i++) out[`TIERS_POBJ_EXTRACT_${i}`] = tseg[i - 1] || '';
            return out;
        });
    }, refresh);
}

/** Commandes de l'exercice (date de commande), avec section F/I déduite de la 1re ligne imputée (comme la vue commandes_with_section). */
function readCommandes(year, { refresh = false } = {}) {
    const y = parseInt(year, 10);
    return cached(`C${y}`, async () => {
        const scope = await scopeWhere('COMMANDE', 'c');
        const sql = `
            SELECT TRIM(c.ROO_IMA_REF) AS ROO, c.COMMANDE AS NUM, c.LIBELLE AS LIB, c.CMD_LIBELLE2 AS LIB2, c.CMD_DATECOMMANDE AS DT,
                   c.CMD_COMMENTAIRE AS COMMENTAIRE, c.NB_LIGNES_COMMANDE AS NB, c.MONTANT_HT AS HT, c.MONTANT_TVA AS TVA, c.MONTANT_TTC AS TTC,
                   (SELECT t.TIERS FROM FI.TIERS t WHERE TRIM(t.ROO_IMA_REF) = TRIM(c.TIERS) AND ROWNUM = 1) AS TIERS_CODE,
                   (SELECT s.CLEACCES FROM FI.SERVICEFI s WHERE TRIM(s.ROO_IMA_REF) = TRIM(c.SERVICE) AND ROWNUM = 1) AS SERVICE_CLE,
                   (SELECT s.LIBELLE FROM FI.SERVICEFI s WHERE TRIM(s.ROO_IMA_REF) = TRIM(c.SERVICE) AND ROWNUM = 1) AS SERVICE_LIB,
                   (SELECT b.BUDGET FROM FI.BUDGET b WHERE TRIM(b.ROO_IMA_REF) = TRIM(c.BUDGET) AND ROWNUM = 1) AS BUDGET_CODE,
                   (SELECT b.LIBELLE FROM FI.BUDGET b WHERE TRIM(b.ROO_IMA_REF) = TRIM(c.BUDGET) AND ROWNUM = 1) AS BUDGET_LIB,
                   NVL((SELECT i.TYPE_SECTION FROM FI.CMDLIGNE cl LEFT JOIN FI.IMPUTATION i ON cl.IMPUTATION = i.ROO_IMA_REF
                         WHERE cl.COMMANDE = c.ROO_IMA_REF AND ROWNUM = 1), 'F') AS SECTION
              FROM FI.COMMANDE c
             WHERE EXTRACT(YEAR FROM c.CMD_DATECOMMANDE) = :y
               ${scope ? `AND ${scope}` : ''}`;
        const rows = await financeShare.withFinanceOracle(async (conn) => (await conn.execute(sql, { y }, OPTS)).rows);
        return rows.map((r) => ({
            COMMANDE_ROO_IMA_REF: r.ROO, TIERS_TIERS: trim(r.TIERS_CODE), SERVICEFI_CLEACCES: trim(r.SERVICE_CLE), SERVICEFI_LIBELLE: trim(r.SERVICE_LIB),
            COMMANDE_COMMANDE: trim(r.NUM), COMMANDE_LIBELLE: r.LIB, COMMANDE_CMD_LIBELLE2: r.LIB2, COMMANDE_CMD_DATECOMMANDE: iso(r.DT),
            COMMANDE_CMD_COMMENTAIRE: r.COMMENTAIRE, BUDGET_BUDGET: trim(r.BUDGET_CODE), BUDGET_LIBELLE: trim(r.BUDGET_LIB),
            COMMANDE_NB_LIGNES_COMMANDE: r.NB == null ? null : String(r.NB), COMMANDE_MONTANT_HT: r.HT == null ? null : String(r.HT),
            COMMANDE_MONTANT_TVA: r.TVA == null ? null : String(r.TVA), COMMANDE_MONTANT_TTC: r.TTC == null ? null : String(r.TTC),
            section: trim(r.SECTION) || 'F',
        }));
    }, refresh);
}

/**
 * Avancement réel de factures dans Sedit (suivi FACSUIVI + mouvements), par n° de facture :
 * « FACTURE REFUSEE » / « FACTURE MANDATEE » / « SERVICE FAIT » / « FACTURE RECUE ». Mis en cache 3 min par facture.
 */
const etatCache = new Map();
async function getEtatsReels(numeros) {
    const list = [...new Set((numeros || []).map((n) => String(n || '').trim()).filter(Boolean))];
    const out = {};
    const todo = [];
    for (const n of list) {
        const hit = etatCache.get(n);
        if (hit && Date.now() - hit.ts < TTL_MS) out[n] = hit.val; else todo.push(n);
    }
    if (todo.length) {
        const st = await financeShare.getFacsuiviStatus(todo);
        for (const n of todo) {
            const s = st[n] || {};
            const val = s.rejete && s.rejete.done ? 'FACTURE REFUSEE'
                : s.mandate && s.mandate.done ? 'FACTURE MANDATEE'
                : s.service_fait && s.service_fait.done ? 'SERVICE FAIT'
                : 'FACTURE RECUE';
            etatCache.set(n, { ts: Date.now(), val });
            out[n] = val;
        }
    }
    return out;
}

module.exports = { readFactures, readCommandes, getEtatsReels };
