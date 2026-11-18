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
    const budgetFilter = clean(q.budget).toUpperCase();
    const budgetsInScope = new Set();
    for (const src of chosen) {
        for (const sv of src.services) {
            budgetsInScope.add(sv.budget);
            if (budgetFilter && sv.budget.toUpperCase() !== budgetFilter) continue;
            const k = `${sv.budgetRoo}|${sv.serviceRoo}`;
            if (!pairs.has(k)) pairs.set(k, { budgetRoo: sv.budgetRoo, serviceRoo: sv.serviceRoo, via: new Set() });
            pairs.get(k).via.add(src.key);
        }
    }
    const year = Number(q.year) || new Date().getFullYear();
    const limit = Math.max(1, Math.min(parseInt(q.limit, 10) || 50, 200));
    const offset = Math.max(0, parseInt(q.offset, 10) || 0);
    const budgets = [...budgetsInScope].filter(Boolean).sort();
    const empty = { budgets, dgp_alert: null, collectivite: null, rows: [], total: 0, stats: null, a_traiter: 0, year, sources: sources.map(s => ({ key: s.key, label: s.label })) };
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

    // 1) ROO de tout le périmètre de l'exercice (hors filtres de recherche) : sert au résumé, au DGP et aux filtres rapides
    const baseBinds = pick(binds, Object.keys(binds).filter(k => k !== 'search'));
    const roos = await financeShare.withFinanceOracle(async (conn) =>
        ((await conn.execute(`SELECT TRIM(f.ROO_IMA_REF) AS ROO ${FROM} WHERE ${baseWhere.join(' AND ')}`, baseBinds, opts)).rows || []).map(r => r.ROO));

    // 2) DGP calculé À LA DEMANDE pour les factures du périmètre absentes du cache (ou de plus de 6 h) : pas de recalcul de toute la collectivité
    let dgpError = null;
    await dgp.ensureDgpForRoos(roos).catch(e => { dgpError = e.message; console.warn('[MesFactures] DGP à la demande:', e.message); });

    // 3) Filtres rapides des KPI : « à traiter » (SF non validé), « hors délai » (DGP > 30 j), « en circuit » (service fait en cours)
    const inList = (expr, values, prefix) => {
        if (!values.length) return '1=0';
        const parts = [];
        for (let i = 0; i < values.length; i += 500) {
            const marks = values.slice(i, i + 500).map((v, k) => { const name = `${prefix}${i + k}`; binds[name] = v; return `:${name}`; });
            parts.push(`${expr} IN (${marks.join(',')})`);
        }
        return `(${parts.join(' OR ')})`;
    };
    const kpi = clean(q.kpi);
    if (kpi === 'todo') where.push(todoCond);
    else if (kpi === 'late') {
        const late = (await pool.query('SELECT facture_roo FROM finance.facture_dgp WHERE facture_roo = ANY($1) AND dgp > 30 AND NOT refused', [roos])).rows.map(r => r.facture_roo);
        where.push(inList('TRIM(f.ROO_IMA_REF)', late, 'kl'));
    } else if (kpi === 'circuit') {
        const nums = (await pool.query(`SELECT DISTINCT invoice_ref FROM finance.service_fait_workflows WHERE status IN ('en_attente','en_cours','transfere','en_pause','en_attente_visa')`)).rows.map(r => r.invoice_ref);
        where.push(inList('TRIM(f.FACTURE)', nums, 'kc'));
    }

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
        const aTraiter = Number((await conn.execute(`SELECT COUNT(*) AS N ${FROM} WHERE ${baseWhere.join(' AND ')} AND ${todoCond}`, baseBinds, opts)).rows[0].N) || 0;
        return { total, rows, roos, aTraiter };
    });

    // Enrichissements : circuit SEDIT (rapprochement / service fait / rejet / mandat), workflow AppDSI, DGP
    const nums = data.rows.map(r => r.NUM);
    const roosPage = data.rows.map(r => r.ROO);
    const [facsuivi, wf, dgpMap] = await Promise.all([
        nums.length ? financeShare.getFacsuiviStatus(nums).catch(() => ({})) : {},
        nums.length ? pool.query(`SELECT DISTINCT ON (invoice_ref) id, invoice_ref, status, verifier_name, requested_by, created_at FROM finance.service_fait_workflows WHERE invoice_ref = ANY($1) ORDER BY invoice_ref, updated_at DESC`, [nums]).then(r => r.rows).catch(() => []) : [],
        dgp.getFacturesDgp(roosPage).catch(() => ({})),
    ]);
    const wfMap = new Map(wf.map(r => [r.invoice_ref, r.status]));
    const wfInfo = new Map(wf.map(r => [r.invoice_ref, r]));
    const ONGOING = ['en_attente', 'en_cours', 'transfere', 'en_pause', 'en_attente_visa'];

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
        // Tendance du DGP moyen : factures payées ces 30 derniers jours vs les 30 jours précédents + moyenne hebdomadaire sur 12 semaines
        const tr = await pool.query(
            `SELECT ROUND(AVG(dgp) FILTER (WHERE paiement_date > CURRENT_DATE - 30), 1) AS recent, COUNT(*) FILTER (WHERE paiement_date > CURRENT_DATE - 30)::int AS nb_recent,
                    ROUND(AVG(dgp) FILTER (WHERE paiement_date <= CURRENT_DATE - 30 AND paiement_date > CURRENT_DATE - 60), 1) AS precedent,
                    COUNT(*) FILTER (WHERE paiement_date <= CURRENT_DATE - 30 AND paiement_date > CURRENT_DATE - 60)::int AS nb_precedent
               FROM finance.facture_dgp WHERE facture_roo = ANY($1) AND definitive AND NOT refused AND paiement_date > CURRENT_DATE - 60`, [data.roos]);
        const wk = await pool.query(
            `SELECT to_char(date_trunc('week', paiement_date), 'YYYY-MM-DD') AS semaine, ROUND(AVG(dgp), 1) AS moyenne, COUNT(*)::int AS nb
               FROM finance.facture_dgp WHERE facture_roo = ANY($1) AND definitive AND NOT refused AND paiement_date > CURRENT_DATE - 84
              GROUP BY 1 ORDER BY 1`, [data.roos]);
        const t = tr.rows[0] || {};
        const recent = t.recent != null ? Number(t.recent) : null, precedent = t.precedent != null ? Number(t.precedent) : null;
        const tendance = {
            recent, precedent, nb_recent: Number(t.nb_recent) || 0, nb_precedent: Number(t.nb_precedent) || 0,
            delta: recent != null && precedent != null ? Math.round((recent - precedent) * 10) / 10 : null,
            semaines: wk.rows.map(x => ({ semaine: x.semaine, moyenne: Number(x.moyenne), nb: x.nb })),
        };
        stats = {
            tendance,
            nb_factures: data.roos.length, nb_payees: nbPayees, nb_non_payees: Number(r.nb_non_payees) || 0,
            dgp_moyen: r.dgp_moyen != null ? Number(r.dgp_moyen) : null,
            nb_hors_delai: nbHors, nb_prov_hors_delai: Number(r.nb_prov) || 0,
            taux_dans_delai: nbPayees > 0 ? Math.round(((nbPayees - nbHors) / nbPayees) * 1000) / 10 : null,
        };
    }

    // Actions service fait : réservées aux droits de MODIFICATION propres à l'agent (un accès partagé = consultation seule)
    const ownSedit = await seditDroits.resolveSeditUser(user).catch(() => null);
    const modPairs = new Set((await seditDroits.getModifiableServices(ownSedit).catch(() => [])).map(x => `${x.budgetRoo}|${x.serviceRoo}`));
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
            dgp: d ? d.dgp : null, dgp_definitif: !!(d && d.def), dgp_rejete: !!(d && d.refuse),
            via: via ? [...via.via].map(k => labelOf.get(k) || k) : [],
            // SF en cours de circuit (vérificateur désigné, pas encore de décision) : annulable par le demandeur ou un agent ayant le droit de modification
            circuit: (() => {
                const w = wfInfo.get(r.NUM);
                if (!w || !ONGOING.includes(w.status) || (fs && fs.service_fait && fs.service_fait.done)) return null;
                return { status: w.status, verificateur: w.verifier_name || '', depuis: w.created_at, demandeur: w.requested_by,
                    can_cancel: low(w.requested_by) === low(user.username) || modPairs.has(`${r.BUDGET_ROO}|${r.SERVICE_ROO}`) };
            })(),
            can_sf: modPairs.has(`${r.BUDGET_ROO}|${r.SERVICE_ROO}`) && !(fs && fs.service_fait && fs.service_fait.done) && !r.DATE_REJET
                && !(fs && fs.mandate && fs.mandate.done) && (!wfMap.get(r.NUM) || ['non_valide', 'ne_me_concerne_pas', 'annule'].includes(wfMap.get(r.NUM))),
        };
    });
    let seditUrl = 'https://seditgfprod.ivry.local/SeditGfSMProd';
    try { const db = require('../../shared/database').getSqlite(); const r = db && await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'url_sedit_fi'"); if (r && r.setting_value) seditUrl = String(r.setting_value).replace(/\/+$/, ''); } catch { /* défaut */ }
    // Alerte : le cache DGP ne couvre pas tout le périmètre (calcul en échec ou factures encore absentes)
    let dgpAlert = null;
    try {
        const found = (await pool.query('SELECT COUNT(*)::int AS n FROM finance.facture_dgp WHERE facture_roo = ANY($1)', [data.roos])).rows[0].n;
        const missing = Math.max(0, data.roos.length - found);
        if (dgpError || missing > 0) dgpAlert = { error: dgpError, missing, total: data.roos.length };
    } catch (e) { dgpAlert = { error: e.message, missing: data.roos.length, total: data.roos.length }; }
    const collectivite = await dgp.getCollectiviteStats(year);
    return { budgets, dgp_alert: dgpAlert, collectivite, sedit_url: seditUrl, rows, total: data.total, stats, a_traiter: data.aTraiter, year, sources: sources.map(s => ({ key: s.key, label: s.label })) };
}

// Mandatement d'une facture (infobulle), uniquement si la facture est dans le périmètre de l'agent
const dstr = (d) => {
    if (!d) return null;
    const x = new Date(d);
    if (isNaN(x.getTime())) return String(d);
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};
async function assertVisible(user, numero) {
    const num = clean(numero);
    const sources = await getSources(user);
    const byBudget = new Map();
    for (const src of sources) for (const sv of src.services) {
        if (!byBudget.has(sv.budgetRoo)) byBudget.set(sv.budgetRoo, new Set());
        byBudget.get(sv.budgetRoo).add(sv.serviceRoo);
    }
    if (!num || !byBudget.size) { const e = new Error('Facture hors de votre périmètre'); e.status = 403; throw e; }
    const binds = { n: num };
    let n = 0, bi = 0;
    const blocks = [];
    for (const [roo, set] of byBudget) {
        const names = [...set].map(sv => { const k = `s${n++}`; binds[k] = sv; return `:${k}`; });
        binds[`b${bi}`] = roo;
        blocks.push(`(f.BUDGET = :b${bi} AND TRIM(f.EF_SERVICE) IN (${names.join(',')}))`);
        bi++;
    }
    const ok = await financeShare.withFinanceOracle(async (conn) => Number((await conn.execute(
        `SELECT COUNT(*) AS N FROM FI.FACTURE f WHERE TRIM(f.FACTURE) = :n AND (${blocks.join(' OR ')})`, binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows[0].N) > 0);
    if (!ok) { const e = new Error('Facture hors de votre périmètre'); e.status = 403; throw e; }
    return num;
}

async function getMandatement(user, numero) {
    const num = await assertVisible(user, numero);
    const res = await require('./sedit-mandat.service').getMandatementByFacture(num);
    return { numero: num, mandats: res.mandats.map(m => ({
        ...m, date_emission: dstr(m.date_emission), date_transmission: dstr(m.date_transmission), date_paiement: dstr(m.date_paiement),
    })) };
}

// Facture sur laquelle l'agent peut AGIR (service fait) : budget × service en accès 'M' de SON compte SEDIT, pas via un partage.
async function getInvoiceForAction(user, numero) {
    const num = clean(numero);
    const sedit = await seditDroits.resolveSeditUser(user);
    const mod = sedit ? await seditDroits.getModifiableServices(sedit) : [];
    const forbid = () => { const e = new Error('Vous n’avez pas le droit de modification SEDIT sur le service de cette facture'); e.status = 403; return e; };
    if (!num || !mod.length) throw forbid();
    const byBudget = new Map();
    for (const sv of mod) { if (!byBudget.has(sv.budgetRoo)) byBudget.set(sv.budgetRoo, new Set()); byBudget.get(sv.budgetRoo).add(sv.serviceRoo); }
    const binds = { n: num };
    let n = 0, bi = 0;
    const blocks = [];
    for (const [roo, set] of byBudget) {
        const names = [...set].map(sv => { const k = `s${n++}`; binds[k] = sv; return `:${k}`; });
        binds[`b${bi}`] = roo;
        blocks.push(`(f.BUDGET = :b${bi} AND TRIM(f.EF_SERVICE) IN (${names.join(',')}))`);
        bi++;
    }
    const row = await financeShare.withFinanceOracle(async (conn) => (await conn.execute(
        `SELECT TRIM(f.FACTURE) AS NUM, TRIM(f.LIBELLE1) AS LIBELLE, f.MONTANTTC_E AS MONTANT,
                TRIM(REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2)) AS TIERS
           FROM FI.FACTURE f LEFT JOIN FI.TIERS t ON t.ROO_IMA_REF = f.TIERS
          WHERE TRIM(f.FACTURE) = :n AND (${blocks.join(' OR ')})`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows[0]);
    if (!row) throw forbid();
    return { invoice_ref: row.NUM, invoice_number: row.NUM, invoice_label: row.LIBELLE || '', invoice_supplier: row.TIERS || '', invoice_amount: row.MONTANT != null ? String(row.MONTANT) : '', invoice_section: '' };
}

// ───────── Vérificateurs du service fait : agents de MA direction uniquement ─────────
async function searchVerifiers(user, q) {
    const query = clean(q);
    if (query.length < 2) return [];
    const { rhPlacement } = require('./virement-credits-signataires.service');
    const me = await rhPlacement(user);
    if (!me || !me.direction_code) return [];
    const rhStudio = require('../../shared/rh_studio');
    // Candidats : annuaire AD (adresse e-mail), complété par RH Studio quand il connaît l'e-mail
    const cands = new Map(); // email -> { displayName, matricule? }
    try {
        const { getSqlite } = require('../../shared/database');
        const { searchADUsersByQuery } = require('../../shared/ad_helper');
        const db = getSqlite();
        const ad = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
        if (ad && ad.is_enabled) {
            for (const u of ((await searchADUsersByQuery(query, ad)) || []).slice(0, 25)) {
                const e = clean(u.email).toLowerCase();
                if (/@ivry94\.fr$/.test(e)) cands.set(e, { displayName: clean(u.displayName) || e });
            }
        }
    } catch { /* AD indisponible : RH Studio seul */ }
    for (const a of ((await rhStudio.searchAgents(query).catch(() => [])) || [])) {
        const e = clean(a.email).toLowerCase();
        if (/@ivry94\.fr$/.test(e)) cands.set(e, { displayName: [a.prenom, a.nom].filter(Boolean).join(' ') || e, matricule: clean(a.matricule) });
    }
    if (!cands.size) return [];
    // Matricule RH de chaque candidat (par e-mail), puis filtre sur MA direction
    const entries = await Promise.all([...cands.entries()].map(async ([email, c]) => {
        let mat = c.matricule;
        if (!mat) { const ag = await rhStudio.findAgentByEmail(email).catch(() => null); mat = ag ? clean(ag.matricule) : ''; }
        return { email, displayName: c.displayName, matricule: mat };
    }));
    const mats = entries.map(e => e.matricule).filter(Boolean);
    if (!mats.length) return [];
    const rows = (await pool.query(
        `SELECT DISTINCT TRIM("MATRICULE") AS m, TRIM("SERVICE_L") AS service FROM oracle.rh_v_extract_dsi
          WHERE TRIM("MATRICULE") = ANY($1) AND TRIM("DIRECTION") = $2`, [mats, me.direction_code])).rows;
    const svc = new Map(rows.map(r => [r.m, r.service]));
    return entries
        .filter(e => e.matricule && svc.has(e.matricule))
        .slice(0, 12)
        .map(e => ({ username: e.email.split('@')[0], displayName: e.displayName, email: e.email, service: svc.get(e.matricule) || '' }));
}

// Le vérificateur choisi doit appartenir à la direction de l'agent (contrôle serveur, pas seulement l'affichage)
async function assertVerifierInDirection(user, email) {
    const { rhPlacement } = require('./virement-credits-signataires.service');
    const me = await rhPlacement(user);
    const rhStudio = require('../../shared/rh_studio');
    const ag = await rhStudio.findAgentByEmail(clean(email)).catch(() => null);
    const mat = ag && clean(ag.matricule);
    let ok = false;
    if (me && me.direction_code && mat) {
        const r = await pool.query(`SELECT 1 FROM oracle.rh_v_extract_dsi WHERE TRIM("MATRICULE") = $1 AND TRIM("DIRECTION") = $2 LIMIT 1`, [mat, me.direction_code]);
        ok = r.rows.length > 0;
    }
    if (!ok) { const e = new Error('Le vérificateur doit appartenir à votre direction'); e.status = 403; throw e; }
}

// Annulation d'un circuit de service fait en cours : par le demandeur, ou par un agent ayant le droit de modification SEDIT sur la facture
async function getCancellableWorkflowId(user, numero) {
    const num = clean(numero);
    const r = await pool.query(
        `SELECT id, requested_by FROM finance.service_fait_workflows
          WHERE invoice_ref = $1 AND status IN ('en_attente','en_cours','transfere','en_pause','en_attente_visa') ORDER BY id DESC LIMIT 1`, [num]);
    const wf = r.rows[0];
    if (!wf) { const e = new Error('Aucun circuit de service fait en cours pour cette facture'); e.status = 404; throw e; }
    if (low(wf.requested_by) !== low(user.username)) await getInvoiceForAction(user, num); // sinon : droit de modification requis (403 sinon)
    return wf.id;
}

// Courbe hebdomadaire du DGP sur le périmètre de l'agent (même courbe que /budget, restreinte à ses factures)
async function getDgpWeeklyForUser(user, q = {}) {
    const sources = await getSources(user);
    const scope = String(q.scope || 'all');
    const chosen = scope === 'all' ? sources : sources.filter(s => s.key === scope);
    const year = Number(q.year) || new Date().getFullYear();
    const byBudget = new Map();
    const bf = clean(q.budget).toUpperCase();
    for (const src of chosen) for (const sv of src.services) {
        if (bf && sv.budget.toUpperCase() !== bf) continue;
        if (!byBudget.has(sv.budgetRoo)) byBudget.set(sv.budgetRoo, new Set());
        byBudget.get(sv.budgetRoo).add(sv.serviceRoo);
    }
    if (!byBudget.size) return dgp.getDgpWeekly({ fiscalYear: year, mode: q.mode, roos: [] });
    // Factures reçues dans l'exercice ET celles de l'exercice précédent payées cette année (la courbe est classée par semaine de paiement)
    const binds = { y0: `${year - 1}-01-01`, y1: `${year + 1}-01-01` };
    let n = 0, bi = 0;
    const blocks = [];
    for (const [roo, set] of byBudget) {
        const names = [...set].map(sv => { const k = `s${n++}`; binds[k] = sv; return `:${k}`; });
        binds[`b${bi}`] = roo;
        blocks.push(`(f.BUDGET = :b${bi} AND TRIM(f.EF_SERVICE) IN (${names.join(',')}))`);
        bi++;
    }
    const roos = await financeShare.withFinanceOracle(async (conn) => ((await conn.execute(
        `SELECT TRIM(f.ROO_IMA_REF) AS ROO FROM FI.FACTURE f WHERE f.DATENTREE >= TO_DATE(:y0,'YYYY-MM-DD') AND f.DATENTREE < TO_DATE(:y1,'YYYY-MM-DD') AND (${blocks.join(' OR ')})`,
        binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 100000 })).rows || []).map(r => r.ROO));
    await dgp.ensureDgpForRoos(roos).catch(e => console.warn('[MesFactures] DGP à la demande:', e.message));
    return dgp.getDgpWeekly({ fiscalYear: year, mode: q.mode, roos });
}

// Pièces jointes SEDIT (PDF / XML) d'une facture du périmètre de l'agent — les URL de téléchargement repassent par MagApp (contrôle de périmètre)
async function listDocuments(user, numero) {
    const num = await assertVisible(user, numero);
    const documents = await financeShare.buildFactureDocumentsList(num, `/api/magapp/mes-factures/${encodeURIComponent(num)}`);
    return { numero: num, documents };
}
async function streamDocument(user, numero, docId, res) {
    const num = await assertVisible(user, numero);
    return financeShare.streamFactureDocumentFile(num, String(docId || '').trim(), res);
}

// Directeur de ma direction (circuit « informé » / « avec visa »)
async function getMyDirector(user) {
    const { getSignataires } = require('./virement-credits-signataires.service');
    const r = await getSignataires(user, []);
    const d = r.defaults.directeur;
    return d ? { name: `${d.prenom || ''} ${d.nom || ''}`.trim(), email: d.email, direction_code: d.direction_code, direction_label: d.direction_label } : null;
}

// Lot : factures du MÊME fournisseur, toutes dans le périmètre de modification de l'agent (données relues dans SEDIT)
async function prepareBatch(user, nums) {
    const list = [...new Set((Array.isArray(nums) ? nums : []).map(clean).filter(Boolean))];
    if (list.length < 2) { const e = new Error('Sélectionnez au moins deux factures'); e.status = 400; throw e; }
    if (list.length > 50) { const e = new Error('50 factures maximum par lot'); e.status = 400; throw e; }
    const items = [];
    for (const n of list) items.push(await getInvoiceForAction(user, n));
    const suppliers = new Set(items.map(i => i.invoice_supplier.toUpperCase()));
    if (suppliers.size > 1) { const e = new Error('Un lot ne peut contenir que des factures d’un même fournisseur'); e.status = 400; throw e; }
    return items;
}

module.exports = { getAccess, listFactures, listShares, addShare, removeShare, getMandatement, getInvoiceForAction, searchVerifiers, assertVerifierInDirection, getCancellableWorkflowId, getDgpWeeklyForUser, listDocuments, streamDocument, getMyDirector, prepareBatch };
