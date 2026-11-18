const oracledb = require('oracledb');
const { pool } = require('../../shared/database');
const financeShare = require('./finance-share.controller');
const seditDroits = require('./sedit-droits.service');
const dgp = require('./dgp.service');

// « Mes factures » (MagApp, BETA) : factures SEDIT que l'agent a le droit de VOIR, avec service fait et DGP.
//
// Périmètre = couples (budget × service) sur lesquels son compte SEDIT a un accès 'I' (interrogation) ou 'M' (modification)
// dans FI.DROITSER, appliqués à FI.FACTURE (BUDGET, EF_SERVICE = ROO du service). Voir sedit-droits.service.js.
//
// Partage : un agent peut donner à un autre agent la vue de SES factures (finance.factures_partages). Le droit est LIVE :
// à chaque lecture, le périmètre du bénéficiaire = son propre périmètre SEDIT (s'il a un compte) + le périmètre ACTUEL
// SEDIT de chaque agent qui lui a donné accès. Si les droits du donneur changent dans SEDIT, ceux du bénéficiaire suivent.
// (Non transitif : un bénéficiaire ne peut pas repartager ce qu'il reçoit.)

let tableReady = false;
async function ensureTables() {
    if (tableReady) return;
    await pool.query('CREATE SCHEMA IF NOT EXISTS finance');
    await pool.query(`CREATE TABLE IF NOT EXISTS finance.factures_partages (
        id SERIAL PRIMARY KEY,
        owner_username TEXT NOT NULL, owner_name TEXT, owner_email TEXT,
        shared_username TEXT NOT NULL, shared_name TEXT, shared_email TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (owner_username, shared_username))`);
    tableReady = true;
}

const low = (v) => String(v || '').trim().toLowerCase();
const clean = (v) => (v == null ? '' : String(v).trim());

/**
 * Sources d'accès de l'agent : { key, label, services[] } — 'me' (ses droits SEDIT) + un élément par agent qui lui a partagé ses factures.
 */
async function getSources(user) {
    await ensureTables();
    const me = low(user.username);
    const sources = [];
    const sedit = await seditDroits.resolveSeditUser(user);
    if (sedit) {
        const services = await seditDroits.getVisibleServices(sedit);
        if (services.length) sources.push({ key: 'me', label: 'Mes droits SEDIT', services });
    }
    const r = await pool.query('SELECT * FROM finance.factures_partages WHERE LOWER(shared_username) = $1 ORDER BY owner_name NULLS LAST', [me]);
    for (const row of r.rows) {
        let services = [];
        try {
            const owner = await seditDroits.resolveSeditUser({ username: row.owner_username, email: row.owner_email });
            if (owner) services = await seditDroits.getVisibleServices(owner);
        } catch { /* donneur sans compte SEDIT actif : périmètre vide */ }
        sources.push({ key: low(row.owner_username), label: `Partagé par ${row.owner_name || row.owner_username}`, owner: row.owner_name || row.owner_username, services });
    }
    return sources;
}

async function getAccess(user) {
    const sources = await getSources(user);
    const hasOwn = sources.some(s => s.key === 'me');
    const received = sources.filter(s => s.key !== 'me');
    return {
        allowed: sources.some(s => s.services.length > 0),
        canShare: hasOwn, // seul un agent disposant de droits SEDIT propres peut partager
        sources: sources.map(s => ({ key: s.key, label: s.label, nb_services: s.services.length, inactive: s.key !== 'me' && s.services.length === 0 })),
        received: received.map(s => ({ key: s.key, name: s.owner })),
    };
}

// ───────── partages ─────────
async function listShares(user) {
    await ensureTables();
    const me = low(user.username);
    const given = await pool.query('SELECT id, shared_username, shared_name, shared_email, created_at FROM finance.factures_partages WHERE LOWER(owner_username) = $1 ORDER BY created_at DESC', [me]);
    const received = await pool.query('SELECT id, owner_username, owner_name, created_at FROM finance.factures_partages WHERE LOWER(shared_username) = $1 ORDER BY created_at DESC', [me]);
    return { given: given.rows, received: received.rows };
}

async function addShare(user, target) {
    await ensureTables();
    const tUser = low(target && target.username);
    if (!tUser) { const e = new Error('Agent à qui donner l’accès : identifiant manquant'); e.status = 400; throw e; }
    if (tUser === low(user.username)) { const e = new Error('Vous ne pouvez pas partager vos factures avec vous-même'); e.status = 400; throw e; }
    const access = await getAccess(user);
    if (!access.canShare) { const e = new Error('Seul un agent ayant des droits SEDIT peut partager ses factures'); e.status = 403; throw e; }
    const owner = await pool.query('SELECT displayname, email FROM hub.users WHERE LOWER(TRIM(username)) = $1 LIMIT 1', [low(user.username)]);
    await pool.query(
        `INSERT INTO finance.factures_partages (owner_username, owner_name, owner_email, shared_username, shared_name, shared_email)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (owner_username, shared_username) DO UPDATE SET shared_name = EXCLUDED.shared_name, shared_email = EXCLUDED.shared_email`,
        [low(user.username), (owner.rows[0] && owner.rows[0].displayname) || user.displayName || user.username, (owner.rows[0] && owner.rows[0].email) || user.email || null,
            tUser, clean(target.displayName) || tUser, clean(target.email) || null]);
}

// Le donneur retire l'accès, ou le bénéficiaire le décline
async function removeShare(user, id) {
    await ensureTables();
    const me = low(user.username);
    const r = await pool.query('DELETE FROM finance.factures_partages WHERE id = $1 AND (LOWER(owner_username) = $2 OR LOWER(shared_username) = $2)', [id, me]);
    return r.rowCount > 0;
}

// ───────── liste ─────────
function etatOf(fs, wf) {
    if (fs && fs.rejete && fs.rejete.done) return 'refusee';
    if (fs && fs.mandate && fs.mandate.done) return 'mandatee';
    if (fs && fs.service_fait && fs.service_fait.done) return 'service_fait';
    if (fs && fs.rapprochement && fs.rapprochement.done) return 'rapprochee';
    return 'recue';
}

async function listFactures(user, q = {}) {
    const sources = await getSources(user);
    const scope = String(q.scope || 'all');
    const chosen = scope === 'all' ? sources : sources.filter(s => s.key === scope);

    // Couples (budget, service) → sources qui les ouvrent
    const pairs = new Map();
    for (const src of chosen) {
        for (const sv of src.services) {
            const k = `${sv.budgetRoo}|${sv.serviceRoo}`;
            if (!pairs.has(k)) pairs.set(k, { budgetRoo: sv.budgetRoo, serviceRoo: sv.serviceRoo, via: new Set() });
            pairs.get(k).via.add(src.key);
        }
    }
    const year = Number(q.year) || new Date().getFullYear();
    const limit = Math.max(1, Math.min(parseInt(q.limit, 10) || 50, 200));
    const offset = Math.max(0, parseInt(q.offset, 10) || 0);
    const empty = { rows: [], total: 0, stats: null, a_traiter: 0, year, sources: sources.map(s => ({ key: s.key, label: s.label })) };
    if (!pairs.size) return empty;

    const binds = { y0: `${year}-01-01`, y1: `${year + 1}-01-01` };
    const byBudget = new Map();
    for (const p of pairs.values()) {
        if (!byBudget.has(p.budgetRoo)) byBudget.set(p.budgetRoo, new Set());
        byBudget.get(p.budgetRoo).add(p.serviceRoo);
    }
    let n = 0, bi = 0;
    const blocks = [];
    for (const [roo, set] of byBudget) {
        const names = [...set].map(sv => { const k = `s${n++}`; binds[k] = sv; return `:${k}`; });
        binds[`b${bi}`] = roo;
        blocks.push(`(f.BUDGET = :b${bi} AND TRIM(f.EF_SERVICE) IN (${names.join(',')}))`);
        bi++;
    }
    const baseWhere = [`f.DATENTREE >= TO_DATE(:y0,'YYYY-MM-DD')`, `f.DATENTREE < TO_DATE(:y1,'YYYY-MM-DD')`, `(${blocks.join(' OR ')})`];

    const todoCond = `f.DATE_REJET IS NULL AND NOT EXISTS (SELECT 1 FROM FI.FACSUIVI fs WHERE fs.FACTURE = f.ROO_IMA_REF AND fs.AVANCEMENT = 'SERVICE_FAIT' AND fs.ETAT = 'VALIDE')`;
    const doneCond = `EXISTS (SELECT 1 FROM FI.FACSUIVI fs WHERE fs.FACTURE = f.ROO_IMA_REF AND fs.AVANCEMENT = 'SERVICE_FAIT' AND fs.ETAT = 'VALIDE')`;
    const where = [...baseWhere];
    const search = clean(q.search);
    if (search) {
        binds.search = search;
        where.push(`UPPER(f.FACTURE || ' ' || f.FACTIERS || ' ' || f.LIBELLE1 || ' ' || NVL(REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2), '')) LIKE '%' || UPPER(:search) || '%'`);
    }
    if (q.sf === 'todo') where.push(todoCond);
    else if (q.sf === 'done') where.push(doneCond);

    const FROM = `FROM FI.FACTURE f LEFT JOIN FI.TIERS t ON t.ROO_IMA_REF = f.TIERS
                  LEFT JOIN FI.SERVICEFI s ON s.ROO_IMA_REF = f.EF_SERVICE LEFT JOIN FI.BUDGET bu ON bu.ROO_IMA_REF = f.BUDGET`;
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 50000 };
    const pick = (b, keys) => Object.fromEntries(keys.filter(k => k in b).map(k => [k, b[k]]));

    const data = await financeShare.withFinanceOracle(async (conn) => {
        const bindsRows = { ...binds };
        const total = Number((await conn.execute(`SELECT COUNT(*) AS N ${FROM} WHERE ${where.join(' AND ')}`, bindsRows, opts)).rows[0].N) || 0;
        const rows = (await conn.execute(
            `SELECT TRIM(f.ROO_IMA_REF) AS ROO, TRIM(f.FACTURE) AS NUM, TRIM(f.FACTIERS) AS NUM_FOURN, TRIM(f.LIBELLE1) AS LIBELLE,
                    TO_CHAR(f.DATENTREE, 'YYYY-MM-DD') AS DATE_RECEPTION, f.MONTANTTC_E AS MONTANT,
                    TRIM(REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2)) AS TIERS,
                    TRIM(s.CLEACCES) AS SERVICE, TRIM(bu.LIBELLE) AS BUDGET, f.BUDGET AS BUDGET_ROO, TRIM(f.EF_SERVICE) AS SERVICE_ROO,
                    TO_CHAR(f.DATE_REJET, 'YYYY-MM-DD') AS DATE_REJET
             ${FROM} WHERE ${where.join(' AND ')}
             ORDER BY f.DATENTREE DESC, f.FACTURE DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`, bindsRows, opts)).rows || [];
        // Résumé : tout le périmètre de l'exercice (sans les filtres de recherche / service fait)
        const baseBinds = pick(binds, Object.keys(binds).filter(k => k !== 'search'));
        const roos = ((await conn.execute(`SELECT TRIM(f.ROO_IMA_REF) AS ROO ${FROM} WHERE ${baseWhere.join(' AND ')}`, baseBinds, opts)).rows || []).map(r => r.ROO);
        const aTraiter = Number((await conn.execute(`SELECT COUNT(*) AS N ${FROM} WHERE ${baseWhere.join(' AND ')} AND ${todoCond}`, baseBinds, opts)).rows[0].N) || 0;
        return { total, rows, roos, aTraiter };
    });

    // Enrichissements : circuit SEDIT (rapprochement / service fait / rejet / mandat), workflow AppDSI, DGP
    const nums = data.rows.map(r => r.NUM);
    const roosPage = data.rows.map(r => r.ROO);
    const [facsuivi, wf, dgpMap] = await Promise.all([
        nums.length ? financeShare.getFacsuiviStatus(nums).catch(() => ({})) : {},
        nums.length ? pool.query(`SELECT DISTINCT ON (invoice_ref) invoice_ref, status FROM finance.service_fait_workflows WHERE invoice_ref = ANY($1) ORDER BY invoice_ref, updated_at DESC`, [nums]).then(r => r.rows).catch(() => []) : [],
        dgp.getFacturesDgp(roosPage).catch(() => ({})),
    ]);
    const wfMap = new Map(wf.map(r => [r.invoice_ref, r.status]));

    // Stats DGP du périmètre (cache finance.facture_dgp, rafraîchi chaque nuit)
    let stats = null;
    if (data.roos.length) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS nb, COUNT(*) FILTER (WHERE definitive)::int AS nb_payees,
                    COUNT(*) FILTER (WHERE NOT definitive)::int AS nb_non_payees,
                    ROUND(AVG(dgp) FILTER (WHERE definitive), 1) AS dgp_moyen,
                    COUNT(*) FILTER (WHERE definitive AND dgp > 30)::int AS nb_hors,
                    COUNT(*) FILTER (WHERE NOT definitive AND dgp > 30)::int AS nb_prov
               FROM finance.facture_dgp WHERE facture_roo = ANY($1) AND NOT refused`, [data.roos]);
        const r = rows[0] || {};
        const nbPayees = Number(r.nb_payees) || 0, nbHors = Number(r.nb_hors) || 0;
        stats = {
            nb_factures: data.roos.length, nb_payees: nbPayees, nb_non_payees: Number(r.nb_non_payees) || 0,
            dgp_moyen: r.dgp_moyen != null ? Number(r.dgp_moyen) : null,
            nb_hors_delai: nbHors, nb_prov_hors_delai: Number(r.nb_prov) || 0,
            taux_dans_delai: nbPayees > 0 ? Math.round(((nbPayees - nbHors) / nbPayees) * 1000) / 10 : null,
        };
    }

    const labelOf = new Map(sources.map(s => [s.key, s.label]));
    const rows = data.rows.map(r => {
        const fs = facsuivi[r.NUM];
        const d = dgpMap[r.ROO];
        const via = pairs.get(`${r.BUDGET_ROO}|${r.SERVICE_ROO}`);
        return {
            roo: r.ROO, num: r.NUM, num_fournisseur: r.NUM_FOURN, libelle: r.LIBELLE, date: r.DATE_RECEPTION, montant: Number(r.MONTANT) || 0,
            tiers: r.TIERS || '', service: r.SERVICE || '', budget: r.BUDGET || '',
            etat: etatOf(fs),
            service_fait: !!(fs && fs.service_fait && fs.service_fait.done),
            service_fait_date: (fs && fs.service_fait && fs.service_fait.date) || null,
            rejetee: !!r.DATE_REJET,
            workflow: wfMap.get(r.NUM) || null,
            dgp: d && !d.refuse ? d.dgp : null, dgp_definitif: !!(d && d.def),
            via: via ? [...via.via].map(k => labelOf.get(k) || k) : [],
        };
    });
    return { rows, total: data.total, stats, a_traiter: data.aTraiter, year, sources: sources.map(s => ({ key: s.key, label: s.label })) };
}

module.exports = { getAccess, listFactures, listShares, addShare, removeShare };
