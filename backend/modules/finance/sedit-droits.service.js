const oracledb = require('oracledb');
const { pool } = require('../../shared/database');
const financeShare = require('./finance-share.controller');

// Droits budgétaires d'un agent, lus EN DIRECT dans SEDIT Finances (lecture seule).
//
// Modèle SEDIT (vérifié en production, nov. 2026) :
//   SM.SMUTILISAT   compte SEDIT (UTILISAT = code, MAIL, ACTIF 'O'/'N'). Le login AppDSI (AD) n'est PAS le code SEDIT
//                   (machevalier ≠ MCHEVALIER) : on rapproche par e-mail, puis par code = login en majuscules.
//   FI.UTILISATFI   profil « finances » d'un compte SEDIT, UNE LIGNE PAR BUDGET (Principal, annexes…) : UTILISAT → SMUTILISAT, BUDGET.
//   FI.DROITSER     droit d'un profil sur un service gestionnaire : UTILISATFI × SERVICEFI, ACCES = 'M' (modification),
//                   'I' (interrogation seule) ou 'N' (aucun) ; HERITAGE 'O' = droit hérité/par défaut ; RATTACHE 1 = rattaché explicitement.
//   FI.SERVICEFI    CLEACCES = code service (BF1, BF6…) = FI.IMPUTATION.CODESERG.
// Ligne budgétaire autorisée = IMPUTATION dont le budget = UTILISATFI.BUDGET ET CODESERG = SERVICEFI.CLEACCES avec ACCES = 'M'.
// Un virement de crédits modifie le budget : seul l'accès 'M' est retenu (pas 'I').

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

const trim = (v) => (v == null ? '' : String(v).trim());

async function withCache(key, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
    const v = await fn();
    cache.set(key, { t: Date.now(), v });
    return v;
}

// Compte SEDIT actif correspondant à l'agent AppDSI (null = pas de compte SEDIT).
async function resolveSeditUser(user) {
    if (!user || !user.username) return null;
    const username = String(user.username).trim();
    return withCache(`user:${username.toLowerCase()}`, async () => {
        let email = String(user.email || '').trim().toLowerCase();
        try {
            // user.id (SQLite) ne correspond pas à hub.users.id : on joint par username
            const r = await pool.query('SELECT email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [username]);
            if (r.rows[0] && r.rows[0].email) email = String(r.rows[0].email).trim().toLowerCase();
        } catch { /* repli sur l'e-mail du JWT */ }
        return financeShare.withFinanceOracle(async (conn) => {
            const run = async (where, binds) => (await conn.execute(
                `SELECT TRIM(ROO_IMA_REF) ROO, TRIM(UTILISAT) CODE, TRIM(NOM) NOM, TRIM(MAIL) MAIL
                   FROM SM.SMUTILISAT WHERE ACTIF = 'O' AND ${where} ORDER BY DATE_DERNIERE_CONNEXION DESC NULLS LAST`,
                binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 2 })).rows || [];
            let rows = email ? await run('LOWER(TRIM(MAIL)) = :m', { m: email }) : [];
            if (!rows.length) rows = await run('UPPER(TRIM(UTILISAT)) = :u', { u: username.toUpperCase() });
            const r = rows[0];
            return r ? { roo: r.ROO, code: r.CODE, nom: r.NOM, mail: r.MAIL } : null;
        });
    });
}

// Couples (budget, service gestionnaire) sur lesquels le compte a l'un des accès demandés ('M' seul = modification ;
// 'I','M' = consultation, c.-à-d. les factures qu'il VOIT dans SEDIT). serviceRoo = FI.SERVICEFI.ROO_IMA_REF (= FACTURE.EF_SERVICE).
async function loadServices(seditUser, levels) {
    if (!seditUser) return [];
    return withCache(`droits:${levels.join('')}:${seditUser.roo}`, () => financeShare.withFinanceOracle(async (conn) => {
        const binds = { u: seditUser.roo };
        const marks = levels.map((l, i) => { binds[`a${i}`] = l; return `:a${i}`; });
        const r = await conn.execute(
            `SELECT f.BUDGET AS BUDGET_ROO, TRIM(bu.LIBELLE) AS BUDGET, TRIM(s.ROO_IMA_REF) AS SERVICE_ROO, TRIM(s.CLEACCES) AS SERVICE, TRIM(s.LIBELLE) AS LIBELLE
               FROM FI.UTILISATFI f
               JOIN FI.DROITSER d ON TRIM(d.UTILISATFI) = TRIM(f.ROO_IMA_REF)
               JOIN FI.SERVICEFI s ON TRIM(s.ROO_IMA_REF) = TRIM(d.SERVICEFI)
               JOIN FI.BUDGET bu ON TRIM(bu.ROO_IMA_REF) = TRIM(f.BUDGET)
              WHERE TRIM(f.UTILISAT) = :u AND d.ACCES IN (${marks.join(',')})
              ORDER BY 2, 4`,
            binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 5000 });
        return (r.rows || []).map(x => ({ budgetRoo: x.BUDGET_ROO, budget: trim(x.BUDGET), serviceRoo: trim(x.SERVICE_ROO), service: trim(x.SERVICE), libelle: trim(x.LIBELLE) }));
    }));
}
const getModifiableServices = (seditUser) => loadServices(seditUser, ['M']);
// Factures visibles dans SEDIT : accès interrogation OU modification
const getVisibleServices = (seditUser) => loadServices(seditUser, ['I', 'M']);

// Accès complet d'un agent : compte SEDIT + services modifiables (null = pas de compte SEDIT).
async function getAccess(user) {
    const sedit = await resolveSeditUser(user);
    if (!sedit) return null;
    const services = await getModifiableServices(sedit);
    return { sedit, services };
}

module.exports = { resolveSeditUser, getModifiableServices, getVisibleServices, getAccess };
