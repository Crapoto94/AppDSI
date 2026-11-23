/**
 * Entretiens professionnels — services partagés.
 *
 * Toutes les données métier vivent dans le schéma PostgreSQL `hub_entretiens`
 * (créé dans shared/pg_db.js). Aucune table SQLite n'est utilisée.
 *
 * Les dates d'entretien sont stockées en texte « YYYY-MM-DDTHH:mm » (heure de
 * Paris) : c'est volontaire, cela évite toute conversion de fuseau entre le
 * serveur (souvent en UTC), PostgreSQL et le navigateur.
 */
const { pgDb } = require('../../shared/database');
const {
    createOutlookEvent,
    updateOutlookEvent,
    deleteOutlookEvent,
} = require('../rencontres/outlook.service');

const epBeta = require('../../shared/ep-beta-mail');

const norm = (v) => String(v || '').trim().toLowerCase();
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

function pad2(n) { return String(n).padStart(2, '0'); }

/** Date/heure locale « YYYY-MM-DDTHH:mm » (fuseau du serveur). */
function localNow() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function normalizeDateTime(value) {
    if (!value) return null;
    const s = String(value).trim().replace(' ', 'T');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

/** Normalise une date seule « YYYY-MM-DD » (champs date d'une campagne). */
function normalizeDate(value) {
    if (!value) return null;
    const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
}

function formatDateTimeFr(value) {
    const s = normalizeDateTime(value);
    if (!s) return '';
    const [date, time] = s.split('T');
    const [y, mo, d] = date.split('-');
    return `${d}/${mo}/${y} à ${time}`;
}

function fullName(prenom, nom) {
    return `${String(prenom || '').trim()} ${String(nom || '').trim()}`.trim();
}

/** Identité de l'utilisateur connecté, complétée depuis hub.users si besoin. */
async function getActor(req) {
    const u = req.user || {};
    const actor = {
        id: u.id,
        username: String(u.username || '').trim(),
        role: String(u.role || '').trim(),
        email: String(u.email || '').trim(),
        displayName: String(u.displayName || '').trim(),
    };
    if ((!actor.email || !actor.displayName) && actor.username) {
        try {
            const row = await pgDb.get(
                'SELECT email, displayName AS "displayName" FROM hub.users WHERE LOWER(username) = LOWER(?) LIMIT 1',
                [actor.username]
            );
            if (row) {
                if (!actor.email) actor.email = row.email || '';
                if (!actor.displayName) actor.displayName = row.displayName || '';
            }
        } catch (e) { /* ignore */ }
    }
    return actor;
}

/** Un admin global (admin/superadmin) ou un admin délégué du module. */
async function isEpAdmin(actor) {
    if (['admin', 'superadmin'].includes(norm(actor.role))) return true;
    const clauses = [];
    const params = [];
    if (actor.username) { clauses.push('LOWER(username) = LOWER(?)'); params.push(actor.username); }
    if (actor.email) { clauses.push('LOWER(email) = LOWER(?)'); params.push(actor.email); }
    if (!clauses.length) return false;
    try {
        const row = await pgDb.get(
            `SELECT 1 FROM hub_entretiens.admins WHERE (${clauses.join(' OR ')}) LIMIT 1`,
            params
        );
        return !!row;
    } catch (e) {
        return false;
    }
}

/** Rôle « pilotage » : accès à l'onglet Pilotage en lecture seule (jamais aux CREP). */
async function isEpPilotage(actor) {
    const clauses = [];
    const params = [];
    if (actor.username) { clauses.push('LOWER(username) = LOWER(?)'); params.push(actor.username); }
    if (actor.email) { clauses.push('LOWER(email) = LOWER(?)'); params.push(actor.email); }
    if (!clauses.length) return false;
    try {
        return !!(await pgDb.get(`SELECT 1 FROM hub_entretiens.pilotage_users WHERE (${clauses.join(' OR ')}) LIMIT 1`, params));
    } catch (e) { return false; }
}

/**
 * Identités sous lesquelles l'utilisateur peut être désigné évaluateur :
 * son compte, plus l'éventuel agent du calendrier DSI correspondant (identifiant ou e-mail).
 */
async function evaluatorIdentity(actor) {
    const usernames = new Set();
    const emails = new Set();
    const add = (u, e) => { if (u) usernames.add(norm(u)); if (e) emails.add(norm(e)); };
    add(actor.username, actor.email);
    if (actor.username || actor.email) {
        try {
            const rows = await pgDb.all(
                'SELECT username, email FROM hub_calendrier.agents_dsi WHERE LOWER(username) = LOWER(?) OR (? <> \'\' AND LOWER(email) = LOWER(?))',
                [actor.username || '', actor.email || '', actor.email || '']
            );
            for (const r of rows || []) add(r.username, r.email);
        } catch (e) { /* ignore */ }
    }
    // Secrétaire de direction : mêmes droits que son directeur (ses entretiens d'évaluateur apparaissent aussi chez elle).
    try {
        const d = await require('../ep-base/ep-base.service').delegatedIdentities(actor);
        for (const u of d.usernames) usernames.add(norm(u));
        for (const e of d.emails) emails.add(norm(e));
    } catch (e) { /* base des agents indisponible */ }
    return { usernames: [...usernames], emails: [...emails] };
}

/** Clause SQL « l'entretien est évalué par cette identité » (null si aucune identité). */
function evaluatorClause(identity) {
    const parts = [];
    const params = [];
    if (identity.emails.length) { parts.push(`LOWER(evaluator_email) IN (${identity.emails.map(() => '?').join(',')})`); params.push(...identity.emails); }
    if (identity.usernames.length) { parts.push(`LOWER(evaluator_username) IN (${identity.usernames.map(() => '?').join(',')})`); params.push(...identity.usernames); }
    return parts.length ? { sql: `(${parts.join(' OR ')})`, params } : null;
}

/**
 * E-mail à l'agent : son entretien est planifié, il doit préparer sa fiche dans l'application.
 * (L'invitation Outlook seule ne suffit pas : elle n'arrive pas, par exemple, quand l'agent est aussi l'organisateur.)
 * Best effort : n'échoue jamais.
 */
async function sendPreparationMail(entretien, campaign) {
    try {
        if (!entretien?.agent_email || !entretien.date_entretien) return { ok: false, skipped: true };
        if (!(await epBeta.allowedForEntretien(entretien, entretien.agent_email, 'mail de préparation'))) return { ok: false, skipped: true, beta: true };
        const { sendParapheurEmail } = require('../parapheur/parapheur.service');
        const email = require('./entretiens-email');
        // L'agent·e a-t-il·elle accès à « Mon entretien » (option activée pour lui·elle) ? Sinon : préparation sur papier, pas de bouton.
        const avecAcces = !!(await selfAccessFor({ username: entretien.agent_username, email: entretien.agent_email }).catch(() => ({ allowed: false }))).allowed;
        const tpl = email.preparation({
            avecAcces,
            agent: fullName(entretien.agent_prenom, entretien.agent_nom) || 'Madame, Monsieur',
            annee: campaign?.annee,
            quand: formatDateTimeFr(entretien.date_entretien),
            duree: entretien.duree_minutes,
            lieu: entretien.lieu,
            evaluateur: entretien.evaluator_nom || entretien.evaluator_email,
            link: await email.entretiensUrl('moi'),
        });
        // Formulaire CREP vierge joint à la convocation (les agents sans accès à l'outil
        // peuvent ainsi l'imprimer et le préparer sur papier).
        let attachments = [];
        try {
            const pdf = await require('./crep-pdf.service').buildCrepPdf(
                { ...entretien, crep: null, crep_sent_at: null, crep_agent_validated_at: null },
                campaign?.annee
            );
            const safe = (fullName(entretien.agent_prenom, entretien.agent_nom) || 'agent').replace(/[^\w\-]+/g, '_');
            attachments = [{
                filename: `CREP-vierge-${campaign?.annee || ''}-${safe}.pdf`,
                content: Buffer.from(pdf).toString('base64'),
            }];
        } catch (e) {
            console.warn('[ENTRETIENS] formulaire CREP vierge non joint:', e.message);
        }
        await sendParapheurEmail(entretien.agent_email, tpl, null, attachments);
        return { ok: true };
    } catch (e) {
        console.warn('[ENTRETIENS] mail de préparation non envoyé:', e.message);
        return { ok: false, error: e.message };
    }
}

/** E-mail à l'évaluateur : un entretien lui est attribué, il doit prendre rendez-vous. Best effort. */
async function sendEvaluatorMail(entretien, campaign) {
    try {
        if (!entretien?.evaluator_email) return { ok: false, skipped: true };
        if (!(await epBeta.allowedForEntretien(entretien, entretien.evaluator_email, 'mail évaluateur'))) return { ok: false, skipped: true, beta: true };
        const { sendParapheurEmail } = require('../parapheur/parapheur.service');
        const email = require('./entretiens-email');
        const agentAcces = !!(await selfAccessFor({ username: entretien.agent_username, email: entretien.agent_email }).catch(() => ({ allowed: false }))).allowed;
        const base = {
            agentAcces,
            evaluateur: entretien.evaluator_nom || entretien.evaluator_email,
            agent: fullName(entretien.agent_prenom, entretien.agent_nom) || entretien.agent_email || 'un agent',
            annee: campaign?.annee,
            service: entretien.service,
            link: await email.entretiensUrl('evaluations'),
        };
        // Avec une date : confirmation du rendez-vous ; sans date : l'évaluateur doit planifier lui-même.
        const tpl = entretien.date_entretien
            ? email.rdvPlanifie({ ...base, quand: formatDateTimeFr(entretien.date_entretien), duree: entretien.duree_minutes, lieu: entretien.lieu })
            : email.aPlanifier(base);
        await sendParapheurEmail(entretien.evaluator_email, tpl);
        return { ok: true };
    } catch (e) {
        console.warn('[ENTRETIENS] mail évaluateur non envoyé:', e.message);
        return { ok: false, error: e.message };
    }
}

const tokenKey = (s) => norm(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean).sort().join(' ');

/**
 * EP de l'année précédente de l'agent (missions, objectifs du service, objectifs individuels) : valeurs proposées par défaut.
 * Rapprochement par « prénom + nom », à défaut par nom de famille s'il est unique.
 */
async function findReprise(entretien) {
    try {
        const full = tokenKey(`${entretien.agent_prenom || ''} ${entretien.agent_nom || ''}`);
        const fam = tokenKey(entretien.agent_nom);
        if (!fam) return null;
        let row = await pgDb.get('SELECT * FROM hub_entretiens.reprise_ep WHERE nom_key = ? ORDER BY annee_source DESC LIMIT 1', [full]);
        if (!row) {
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.reprise_ep WHERE nom_famille_key = ? ORDER BY annee_source DESC', [fam]);
            if (rows.length && rows.every(r => r.nom_key === rows[0].nom_key)) row = rows[0];
        }
        if (!row) return null;
        return {
            annee: row.annee_source,
            fonction: row.fonction || '',
            service: row.service || '',
            missions: row.missions || '',
            objectifs_service: row.objectifs_service || '',
            objectifs: Array.isArray(row.objectifs) ? row.objectifs : [],
        };
    } catch (e) { return null; }
}

/** Ajoute la reprise de l'année précédente à un entretien renvoyé au client. */
async function attachReprise(entretien) {
    if (!entretien) return entretien;
    return { ...entretien, reprise: await findReprise(entretien) };
}

/** Rôle effectif renvoyé au frontend : admin | evaluator | agent. */
async function resolveRole(actor) {
    const admin = await isEpAdmin(actor);
    let evaluator = false;
    const clause = evaluatorClause(await evaluatorIdentity(actor));
    if (clause) {
        const row = await pgDb.get(`SELECT 1 FROM hub_entretiens.entretiens WHERE deleted_at IS NULL AND ${clause.sql} LIMIT 1`, clause.params);
        evaluator = !!row;
    }
    return { role: admin ? 'admin' : (evaluator ? 'evaluator' : 'agent'), isAdmin: admin, isEvaluator: evaluator };
}

/**
 * Vue d'un entretien pour un utilisateur donné : l'agent ne voit ni les notes internes, ni le travail de
 * l'évaluateur (compte rendu) tant que celui-ci ne lui a pas été envoyé.
 */
function forViewer(entretien, access) {
    if (!entretien || !access) return entretien;
    if (access.isAdmin || access.isEvaluator || access.isSuperieur) return entretien;
    const out = { ...entretien };
    delete out.notes_admin;
    if (!out.crep_statut || out.crep_statut === 'non_envoye') {
        delete out.crep;
        delete out.synthese;
        delete out.appreciation_generale;
        delete out.objectifs_suivants;
        delete out.avis_agent;
        out.objectifs = (out.objectifs || []).map(o => { const c = { ...o }; delete c.niveau_evaluateur; delete c.commentaire_evaluateur; return c; });
    }
    return out;
}

/** Droits d'accès à un entretien donné. */
async function buildAccess(actor, entretien, adminFlag) {
    // Les administrateurs n'ont pas accès au contenu des EP de la Ville (ils ne font que désigner des valideurs).
    const admin = (adminFlag !== undefined ? adminFlag : await isEpAdmin(actor)) && entretien.source !== 'ville';
    const email = norm(actor.email);
    const username = norm(actor.username);
    const isAgent = !!(
        (email && norm(entretien.agent_email) === email) ||
        (username && norm(entretien.agent_username) === username)
    );
    const identity = await evaluatorIdentity(actor);
    const isEvaluator = !!(
        (norm(entretien.evaluator_email) && identity.emails.includes(norm(entretien.evaluator_email))) ||
        (norm(entretien.evaluator_username) && identity.usernames.includes(norm(entretien.evaluator_username)))
    );
    // Groupe DG (DGS et secrétaires de DG) : planification des rendez-vous au nom de tous les DG.
    let isPlanner = false;
    if (!isEvaluator) {
        try {
            const pid = await require('../ep-base/ep-base.service').plannerIdentities(actor);
            isPlanner = !!((norm(entretien.evaluator_email) && pid.emails.includes(norm(entretien.evaluator_email)))
                || (norm(entretien.evaluator_username) && pid.usernames.includes(norm(entretien.evaluator_username))));
        } catch (e) { /* base indisponible */ }
    }
    // Valideur situé au-dessus de l'évaluateur direct (cascade) : lecture seule de l'EP, jamais de modification.
    let isSuperieur = (!admin && !isAgent && !isEvaluator) ? await require('../ep-ville/ep-ville.hierarchy').isSuperieur(actor, entretien).catch(() => false) : false;
    // Valideur placé au-dessus de l'agent dans la base des agents à évaluer (classeur RH), à n'importe quel niveau.
    if (!admin && !isAgent && !isEvaluator && !isSuperieur) isSuperieur = await require('../ep-base/ep-base.service').isAboveInBase(actor, entretien).catch(() => false);
    if (!admin && !isAgent && !isEvaluator && !isSuperieur && !isPlanner) return null;

    // Valideur SANS adresse e-mail (donc sans accès à l'outil) : son N+1 (valideur placé au-dessus de lui) agit à sa place —
    // planifier, saisir/importer le compte rendu papier, imprimer, téléverser le CREP manuscrit signé. Les autres N+1 restent en lecture seule.
    const isDelegate = !!(isSuperieur && !isEvaluator && !admin && !norm(entretien.evaluator_email));

    // « Mon entretien » est fermé par défaut : l'agent ne voit son espace que
    // s'il a été explicitement autorisé (l'évaluateur et l'administrateur du
    // module gardent leur propre accès).
    if (isAgent && !admin && !isEvaluator) {
        const self = await selfAccessFor(actor);
        if (!self.allowed) return null;
    }

    // La préparation reste modifiable jusqu'à 7 jours après la date de
    // l'entretien (et tant que l'entretien n'est pas réalisé/clôturé).
    const d = normalizeDateTime(entretien.date_entretien);
    let withinWindow = true;
    if (d) {
        const limit = new Date();
        limit.setDate(limit.getDate() - 7);
        const limitStr = `${limit.getFullYear()}-${pad2(limit.getMonth() + 1)}-${pad2(limit.getDate())}T${pad2(limit.getHours())}:${pad2(limit.getMinutes())}`;
        withinWindow = d >= limitStr;
    }
    const lockedStatus = ['realise', 'cloture'].includes(entretien.statut);
    const canEditPreparation = (isAgent || admin) && !lockedStatus && withinWindow;

    return {
        isAdmin: admin,
        isAgent,
        isEvaluator: isEvaluator || isDelegate,
        isDelegate,
        isSuperieur,
        isPlanner,
        canPlan: isEvaluator || isDelegate || admin || isPlanner,
        canEditPreparation,
        // Une fois le compte rendu envoyé à l'agent, l'évaluateur ne peut plus le modifier.
        canEditEvaluation: (isEvaluator || isDelegate || admin) && entretien.statut !== 'cloture' && (!entretien.crep_statut || entretien.crep_statut === 'non_envoye'),
    };
}

async function getCurrentCampaign() {
    try {
        const row = await pgDb.get(
            `SELECT * FROM hub_entretiens.campaigns
             WHERE statut <> 'close'
             ORDER BY annee DESC, id DESC LIMIT 1`
        );
        if (row) return row;
        return await pgDb.get('SELECT * FROM hub_entretiens.campaigns ORDER BY annee DESC, id DESC LIMIT 1');
    } catch (e) {
        return null;
    }
}

async function getEntretienById(id) {
    const row = await pgDb.get('SELECT * FROM hub_entretiens.entretiens WHERE id = ? AND deleted_at IS NULL', [id]);
    return row || null;
}

/** Options de la campagne en cours (ouverte, à défaut la plus récente) : mode simple et analyse de cohérence. Alimente l'aide et le tutoriel. */
async function currentCampaignFlags() {
    try {
        const c = await pgDb.get("SELECT analyse_coherence, mode_simple FROM hub_entretiens.campaigns ORDER BY (statut = 'ouverte') DESC, annee DESC, id DESC LIMIT 1");
        return { simple_mode: !!c?.mode_simple, coherence_mode: !!c?.analyse_coherence };
    } catch (e) { return { simple_mode: false, coherence_mode: false }; }
}

/** Durées d'entretien autorisées (minutes). Toute autre valeur est ramenée à la valeur par défaut. */
const DUREES_EP = [60, 90, 120, 150];
const dureeEp = (v, fallback = 120) => { const n = Number(v); return DUREES_EP.includes(n) ? n : (DUREES_EP.includes(Number(fallback)) ? Number(fallback) : 120); };

/** Charge les objectifs et formations d'un entretien. */
async function withRelations(entretien) {
    if (!entretien) return null;
    const [objectifs, formations] = await Promise.all([
        pgDb.all('SELECT * FROM hub_entretiens.objectifs WHERE entretien_id = ? ORDER BY ordre, id', [entretien.id]),
        pgDb.all('SELECT * FROM hub_entretiens.formations WHERE entretien_id = ? ORDER BY id', [entretien.id]),
    ]);
    // Modèle de compte rendu (nom de l'onglet du classeur RH) et sa grille : le formulaire s'adapte à la catégorie de l'agent.
    let modele = '', crep_definition = null;
    try {
        const epBase = require('../ep-base/ep-base.service');
        modele = await epBase.modeleOfEntretien(entretien);
        if (modele) crep_definition = require('./crep.definition').definitionFor(modele);
    } catch (e) { /* modèles indisponibles : grille par défaut */ }
    const scan_reading = await scanReadingOn();
    const offline_form = await offlineFormOn();
    let digital_silent = false;
    try { digital_silent = !!(await pgDb.get("SELECT 1 AS x FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ? AND silent AND status = 'termine' AND result IS NOT NULL LIMIT 1", [entretien.id])); } catch (e) { /* table absente */ }
    let reopen_request = null;
    if (entretien.statut === 'cloture') { try { reopen_request = await require('./reopen').latestFor(entretien.id); } catch (e) { /* ignore */ } }
    let campaign_closed = false, campaign_coherence = false, campaign_simple = false;
    try {
        const camp = await pgDb.get('SELECT statut, analyse_coherence, mode_simple FROM hub_entretiens.campaigns WHERE id = ?', [entretien.campaign_id]);
        campaign_closed = camp?.statut === 'close';
        campaign_coherence = !!camp?.analyse_coherence;
        campaign_simple = !!camp?.mode_simple;
    } catch (e) { /* campagne inconnue */ }
    return {
        ...entretien,
        campaign_closed, campaign_coherence, campaign_simple, reopen_request, scan_reading, digital_silent,
        // Mode simple : plus de PDF formulaire hors ligne pour les évaluateurs (aucun téléversement)
        offline_form: offline_form && !campaign_simple,
        date_entretien_label: formatDateTimeFr(entretien.date_entretien),
        objectifs: objectifs || [],
        formations: formations || [],
        modele,
        crep_definition,
    };
}

/** Liste enrichie (compteurs de préparation) avec filtres facultatifs. */
let _listCols = null;
/** Colonnes de la liste sans le corps du compte rendu (volumineux, inutile dans un tableau). */
async function listColumns() {
    if (_listCols) return _listCols;
    try {
        const rows = await pgDb.all("SELECT column_name FROM information_schema.columns WHERE table_schema = 'hub_entretiens' AND table_name = 'entretiens'");
        const cols = rows.map(r => r.column_name).filter(c => c !== 'crep');
        if (cols.length > 5) _listCols = cols.map(c => `e."${c}"`).join(', ');
    } catch (e) { /* repli : toutes les colonnes */ }
    return _listCols || 'e.*';
}

async function listEntretiens({ campaignId, statut, evaluatorEmail, evaluatorIdentities, agentMatricules, light, agentEmail, search, excludeVille, ratIds, limit = 2000 } = {}) {
    try { await require('./crep-scan-jobs').ensureTable(); } catch (e) { /* table des lectures */ }
    const where = [];
    const params = [];
    if (excludeVille) where.push("COALESCE(e.source, 'hub') <> 'ville'");
    if (Array.isArray(ratIds)) { if (!ratIds.length) return []; where.push(`e.rattachement_id IN (${ratIds.map(() => '?').join(',')})`); params.push(...ratIds.map(Number)); }
    if (campaignId) { where.push('e.campaign_id = ?'); params.push(Number(campaignId)); }
    if (statut) { where.push('e.statut = ?'); params.push(statut); }
    if (evaluatorEmail) { where.push('LOWER(e.evaluator_email) = LOWER(?)'); params.push(evaluatorEmail); }
    if (agentEmail) { where.push('LOWER(e.agent_email) = LOWER(?)'); params.push(agentEmail); }
    if (Array.isArray(agentMatricules)) {
        if (!agentMatricules.length) return [];
        where.push(`e.agent_matricule IN (${agentMatricules.map(() => '?').join(',')})`); params.push(...agentMatricules.map(String));
    }
    // Filtrage par évaluateur directement en base (au lieu de charger toute la campagne puis de trier en mémoire)
    if (Array.isArray(evaluatorIdentities)) {
        const ors = []; 
        for (const id of evaluatorIdentities) {
            if (id && id.emails && id.emails.length) { ors.push(`LOWER(e.evaluator_email) IN (${id.emails.map(() => '?').join(',')})`); params.push(...id.emails.map(x => String(x).toLowerCase())); }
            if (id && id.usernames && id.usernames.length) { ors.push(`LOWER(e.evaluator_username) IN (${id.usernames.map(() => '?').join(',')})`); params.push(...id.usernames.map(x => String(x).toLowerCase())); }
        }
        if (!ors.length) return [];
        where.push(`(${ors.join(' OR ')})`);
    }
    if (search) {
        const q = `%${String(search).trim()}%`;
        where.push('(e.agent_nom ILIKE ? OR e.agent_prenom ILIKE ? OR e.agent_email ILIKE ? OR e.evaluator_nom ILIKE ? OR e.evaluator_email ILIKE ?)');
        params.push(q, q, q, q, q);
    }
    const sql = `
        SELECT ${light ? await listColumns() : 'e.*'},
          (SELECT COUNT(*) FROM hub_entretiens.objectifs o WHERE o.entretien_id = e.id) AS objectifs_total,
          (SELECT COUNT(*) FROM hub_entretiens.objectifs o WHERE o.entretien_id = e.id AND o.niveau IS NOT NULL AND o.niveau <> '') AS objectifs_renseignes,
          (SELECT COUNT(*) FROM hub_entretiens.formations f WHERE f.entretien_id = e.id) AS formations_total,
          (SELECT p.status FROM hub_parapheur.parapheurs p WHERE p.id = e.crep_parapheur_id) AS crep_parapheur_status,
          EXISTS (SELECT 1 FROM hub_entretiens.crep_scan_jobs j WHERE j.entretien_id = e.id AND j.silent AND j.status = 'termine' AND j.result IS NOT NULL) AS lecture_arriere_plan
        FROM hub_entretiens.entretiens e
        WHERE e.deleted_at IS NULL${where.length ? ' AND ' + where.join(' AND ') : ''}
        ORDER BY e.date_entretien NULLS LAST, e.agent_nom, e.agent_prenom
        LIMIT ${Math.max(1, Math.min(5000, Number(limit) || 2000))}
    `;
    const rows = await pgDb.all(sql, params);
    return (rows || []).map(r => ({
        ...r,
        date_entretien_label: formatDateTimeFr(r.date_entretien),
        objectifs_total: Number(r.objectifs_total || 0),
        objectifs_renseignes: Number(r.objectifs_renseignes || 0),
        formations_total: Number(r.formations_total || 0),
    }));
}

/** KPIs calculés à partir d'une liste d'entretiens. */
function computeStats(rows, agentsSansEntretien = 0) {
    const now = localNow();
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const in7Str = `${in7.getFullYear()}-${pad2(in7.getMonth() + 1)}-${pad2(in7.getDate())}T${pad2(in7.getHours())}:${pad2(in7.getMinutes())}`;

    let total = 0, planifies = 0, aPlanifier = 0, realises = 0, prepRecues = 0, evalRecues = 0;
    let aVenir7j = 0, sansEvaluateur = 0, outlookErreurs = 0, enRetard = 0;
    for (const r of rows || []) {
        total++;
        const d = normalizeDateTime(r.date_entretien);
        if (r.statut === 'realise' || r.statut === 'cloture') realises++;
        else if (d) planifies++;
        else aPlanifier++;
        if (r.preparation_statut === 'soumis') prepRecues++;
        if (r.evaluation_statut === 'soumis') evalRecues++;
        if (d && d >= now && d <= in7Str) aVenir7j++;
        if (!r.evaluator_nom && !r.evaluator_email) sansEvaluateur++;
        if (r.outlook_status === 'erreur') outlookErreurs++;
        if (d && d < now && !['realise', 'cloture'].includes(r.statut)) enRetard++;
    }
    // Chaque agent DSI doit avoir son entretien : ceux qui n'en ont pas encore sont « à planifier ».
    total += agentsSansEntretien;
    aPlanifier += agentsSansEntretien;
    const tauxRealisation = total ? Math.round((realises / total) * 100) : 0;
    return {
        total, planifies, a_planifier: aPlanifier, realises,
        preparations_recues: prepRecues, evaluations_recues: evalRecues,
        a_venir_7j: aVenir7j, sans_evaluateur: sansEvaluateur,
        outlook_erreurs: outlookErreurs, en_retard: enRetard,
        taux_realisation: tauxRealisation,
    };
}

async function getSetting(key) {
    try {
        const row = await pgDb.get('SELECT value FROM hub_entretiens.settings WHERE key = ?', [key]);
        return row?.value || '';
    } catch (e) { return ''; }
}

/** Lecture des entretiens numérisés (désactivée par défaut) : si elle est désactivée, le valideur consulte et valide le document signé sans qu'on lui parle de lecture ; le document est quand même lu en arrière-plan (administrateurs seuls). */
/** Option « PDF formulaire hors ligne » (désactivée par défaut) : 3e mode de saisie du CREP, en 2 téléversements. */
async function offlineFormOn() {
    return ['1', 'true'].includes(String(await getSetting('offline_form')).trim().toLowerCase());
}

async function scanReadingOn() {
    return ['1', 'true'].includes(String(await getSetting('scan_reading')).trim().toLowerCase());
}

/** Affichage du module : plein écran (true) ou « dans MagApp » comme à l'origine (défaut). */
async function fullscreenOn() {
    return ['1', 'true'].includes(String(await getSetting('fullscreen')).trim().toLowerCase());
}

async function setSetting(key, value) {
    await pgDb.run(
        `INSERT INTO hub_entretiens.settings (key, value, updated_at)
         VALUES (?, ?, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
    );
}

// Deux fonctions IA distinctes, chacune désactivable et ouverte à des
// évaluateurs explicitement choisis par un administrateur du module :
//  - draft  : rédaction assistée des rubriques du compte rendu ;
//  - review : relecture / évaluation assistée des compétences du compte rendu.
const AI_FEATURES = {
    draft: { enabledKey: 'ai_draft_enabled', evaluatorsKey: 'ai_draft_evaluators', allKey: 'ai_draft_all' },
    review: { enabledKey: 'ai_review_enabled', evaluatorsKey: 'ai_review_evaluators', allKey: 'ai_review_all' },
};
const aiFeature = (feature) => AI_FEATURES[feature] || AI_FEATURES.draft;

/** Liste des évaluateurs autorisés (stockée en JSON), tolérante aux valeurs historiques. */
function parseAiEvaluators(value) {
    try {
        const parsed = JSON.parse(String(value || '[]'));
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(e => (typeof e === 'string'
                ? { username: e.trim(), email: '', display_name: '' }
                : {
                    username: String(e?.username || '').trim(),
                    email: String(e?.email || '').trim(),
                    display_name: String(e?.display_name || e?.displayName || '').trim(),
                }))
            .filter(e => e.username || e.email);
    } catch (e) { return []; }
}

async function getAiEvaluators(feature = 'draft') {
    return parseAiEvaluators(await getSetting(aiFeature(feature).evaluatorsKey));
}

/**
 * IA désactivée par défaut. Lorsqu'elle est activée, seuls les évaluateurs
 * expressément choisis par un administrateur du module y ont accès.
 */
async function aiAccessFor(actor, feature = 'draft') {
    const cfg = aiFeature(feature);
    const rawEnabled = norm(await getSetting(cfg.enabledKey));
    const enabled = rawEnabled === 'true' || rawEnabled === '1';
    if (!enabled) return { feature, enabled: false, all: false, allowed: false, reason: 'disabled' };
    const all = ['true', '1'].includes(norm(await getSetting(cfg.allKey)));
    if (all) return { feature, enabled: true, all: true, allowed: true, reason: 'all' };
    const evaluators = await getAiEvaluators(feature);
    if (!evaluators.length) return { feature, enabled: true, all: false, allowed: false, reason: 'no_evaluators' };
    const identity = await evaluatorIdentity(actor);
    const usernames = new Set(identity.usernames.map(norm));
    const emails = new Set(identity.emails.map(norm));
    const allowed = evaluators.some(e => (
        (e.username && usernames.has(norm(e.username)))
        || (e.email && emails.has(norm(e.email)))
    ));
    return { feature, enabled: true, all: false, allowed, reason: allowed ? 'ok' : 'not_selected' };
}

/** Évaluateurs proposés à l'administrateur : ceux déjà désignés et les valideurs de la Ville. */
async function listAiEvaluatorCandidates() {
    const byKey = new Map();
    const add = (row) => {
        const username = String(row?.username || '').trim();
        const email = String(row?.email || '').trim();
        const displayName = String(row?.display_name || row?.displayName || '').trim();
        if (!username && !email) return;
        const key = norm(username) || norm(email);
        const prev = byKey.get(key);
        if (prev) {
            if (!prev.username && username) prev.username = username;
            if (!prev.email && email) prev.email = email;
            if (!prev.display_name && displayName) prev.display_name = displayName;
        } else {
            byKey.set(key, { username, email, display_name: displayName });
        }
    };
    try {
        const rows = await pgDb.all(
            `SELECT evaluator_username AS username, evaluator_email AS email, evaluator_nom AS display_name
             FROM hub_entretiens.entretiens
             WHERE deleted_at IS NULL
               AND (COALESCE(evaluator_username, '') <> '' OR COALESCE(evaluator_email, '') <> '')`
        );
        (rows || []).forEach(add);
    } catch (e) { /* ignore */ }
    try {
        const rows = await pgDb.all('SELECT username, email, display_name FROM hub_entretiens.valideurs');
        (rows || []).forEach(add);
    } catch (e) { /* ignore */ }
    const selected = [
        ...(await getAiEvaluators('draft')),
        ...(await getAiEvaluators('review')),
    ];
    selected.forEach(add);
    return [...byKey.values()].sort((a, b) => {
        const an = norm(a.display_name || a.username || a.email);
        const bn = norm(b.display_name || b.username || b.email);
        return an.localeCompare(bn, 'fr');
    });
}

async function getAiSettings() {
    const one = async (feature) => {
        const cfg = aiFeature(feature);
        const raw = norm(await getSetting(cfg.enabledKey));
        return {
            enabled: raw === 'true' || raw === '1',
            all: ['true', '1'].includes(norm(await getSetting(cfg.allKey))),
            evaluators: await getAiEvaluators(feature),
        };
    };
    return {
        draft: await one('draft'),
        review: await one('review'),
        candidates: await listAiEvaluatorCandidates(),
    };
}

async function getSelfAgents() {
    return parseAiEvaluators(await getSetting('self_agents'));
}

/** Un agent a-t-il accès à son propre espace « Mon entretien » ? */
async function selfAccessFor(actor) {
    const rawEnabled = norm(await getSetting('self_enabled'));
    const enabled = rawEnabled === 'true' || rawEnabled === '1';
    if (!enabled) return { enabled: false, all: false, allowed: false, reason: 'disabled' };
    const all = ['true', '1'].includes(norm(await getSetting('self_all')));
    if (all) return { enabled: true, all: true, allowed: true, reason: 'all' };
    const agents = await getSelfAgents();
    if (!agents.length) return { enabled: true, all: false, allowed: false, reason: 'no_agents' };
    const identity = await evaluatorIdentity(actor);
    const usernames = new Set(identity.usernames.map(norm));
    const emails = new Set(identity.emails.map(norm));
    const allowed = agents.some(e => (
        (e.username && usernames.has(norm(e.username)))
        || (e.email && emails.has(norm(e.email)))
    ));
    return { enabled: true, allowed, reason: allowed ? 'ok' : 'not_selected' };
}

/** Agents proposés pour l'ouverture de « Mon entretien » (agents ayant un EP dans une campagne). */
async function listAgentCandidates() {
    const byKey = new Map();
    const add = (row) => {
        const username = String(row?.username || '').trim();
        const email = String(row?.email || '').trim();
        const displayName = String(row?.display_name || row?.displayName || '').trim();
        if (!username && !email) return;
        const key = norm(username) || norm(email);
        const prev = byKey.get(key);
        if (prev) {
            if (!prev.username && username) prev.username = username;
            if (!prev.email && email) prev.email = email;
            if (!prev.display_name && displayName) prev.display_name = displayName;
        } else {
            byKey.set(key, { username, email, display_name: displayName });
        }
    };
    try {
        const rows = await pgDb.all(
            `SELECT agent_username AS username, agent_email AS email, agent_nom AS display_name
             FROM hub_entretiens.entretiens
             WHERE deleted_at IS NULL
               AND (COALESCE(agent_username, '') <> '' OR COALESCE(agent_email, '') <> '')`
        );
        (rows || []).forEach(add);
    } catch (e) { /* ignore */ }
    (await getSelfAgents()).forEach(add);
    return [...byKey.values()].sort((a, b) => {
        const an = norm(a.display_name || a.username || a.email);
        const bn = norm(b.display_name || b.username || b.email);
        return an.localeCompare(bn, 'fr');
    });
}

async function getSelfSettings() {
    const raw = norm(await getSetting('self_enabled'));
    return {
        enabled: raw === 'true' || raw === '1',
        all: ['true', '1'].includes(norm(await getSetting('self_all'))),
        agents: await getSelfAgents(),
        candidates: await listAgentCandidates(),
    };
}

async function getEsignAgents() {
    return parseAiEvaluators(await getSetting('esign_agents'));
}

/** La signature électronique du CREP est-elle ouverte pour cet agent ? */
async function esignAllowedFor(agent = {}) {
    const rawEnabled = norm(await getSetting('esign_enabled'));
    const enabled = rawEnabled === 'true' || rawEnabled === '1';
    if (!enabled) return { enabled: false, allowed: false, reason: 'disabled' };
    const agents = await getEsignAgents();
    if (!agents.length) return { enabled: true, allowed: false, reason: 'no_agents' };
    const usernames = new Set([norm(agent.username), norm(agent.agent_username)].filter(Boolean));
    const emails = new Set([norm(agent.email), norm(agent.agent_email)].filter(Boolean));
    const allowed = agents.some(e => (
        (e.username && usernames.has(norm(e.username)))
        || (e.email && emails.has(norm(e.email)))
    ));
    return { enabled: true, allowed, reason: allowed ? 'ok' : 'not_selected' };
}

async function getEsignSettings() {
    const raw = norm(await getSetting('esign_enabled'));
    return {
        enabled: raw === 'true' || raw === '1',
        all: ['true', '1'].includes(norm(await getSetting('esign_all'))),
        agents: await getEsignAgents(),
        candidates: await listAgentCandidates(),
    };
}

let auditReady = null;
async function ensureAuditSchema() {
    if (!auditReady) {
        auditReady = (async () => {
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.audit_logs (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                actor_username TEXT DEFAULT '',
                actor_email TEXT DEFAULT '',
                actor_name TEXT DEFAULT '',
                action TEXT NOT NULL,
                entretien_id INTEGER,
                agent_nom TEXT DEFAULT '',
                details JSONB
            )`);
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_ep_audit_created ON hub_entretiens.audit_logs(created_at DESC)');
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_ep_audit_action ON hub_entretiens.audit_logs(action)');
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_ep_audit_actor ON hub_entretiens.audit_logs(actor_username)');
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_ep_audit_entretien ON hub_entretiens.audit_logs(entretien_id)');
        })().catch((e) => { auditReady = null; throw e; });
    }
    return auditReady;
}

/** Journal des changements du module (agents, évaluateurs, préparation, compte rendu…). */
async function logAudit({ actor, action, entretien, details } = {}) {
    try {
        await ensureAuditSchema();
        const a = actor || {};
        await pgDb.run(
            `INSERT INTO hub_entretiens.audit_logs
                (actor_username, actor_email, actor_name, action, entretien_id, agent_nom, details)
             VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb))`,
            [
                a.username || '', a.email || '', a.displayName || '',
                String(action || '').slice(0, 80),
                entretien?.id || null,
                entretien ? fullName(entretien.agent_prenom, entretien.agent_nom) : '',
                JSON.stringify(details || {}),
            ]
        );
    } catch (e) {
        console.warn('[ENTRETIENS] journal:', e.message);
    }
}

async function listAuditLogs({ page = 1, pageSize = 50, action = '', dateFrom = '', dateTo = '', user = '', q = '', entretienId = null } = {}) {
    await ensureAuditSchema();
    const where = [];
    const params = [];
    if (action) { where.push('action = ?'); params.push(String(action)); }
    if (dateFrom) { where.push('created_at >= CAST(? AS date)'); params.push(String(dateFrom).slice(0, 10)); }
    if (dateTo) { where.push("created_at < CAST(? AS date) + INTERVAL '1 day'"); params.push(String(dateTo).slice(0, 10)); }
    if (user) {
        const like = `%${String(user).trim()}%`;
        where.push('(actor_name ILIKE ? OR actor_username ILIKE ? OR actor_email ILIKE ?)');
        params.push(like, like, like);
    }
    if (q) {
        const like = `%${String(q).trim()}%`;
        where.push('(agent_nom ILIKE ? OR details::text ILIKE ?)');
        params.push(like, like);
    }
    if (Number.isFinite(Number(entretienId)) && Number(entretienId) > 0) {
        where.push('entretien_id = ?');
        params.push(Number(entretienId));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const size = Math.max(10, Math.min(Number(pageSize) || 50, 200));
    const current = Math.max(1, Number(page) || 1);
    const count = await pgDb.get(`SELECT COUNT(*)::int AS n FROM hub_entretiens.audit_logs ${clause}`, params);
    const total = Number(count?.n) || 0;
    const items = await pgDb.all(
        `SELECT id, created_at, actor_username, actor_email, actor_name, action, entretien_id, agent_nom, details
         FROM hub_entretiens.audit_logs ${clause}
         ORDER BY id DESC LIMIT ${size} OFFSET ${(current - 1) * size}`,
        params
    );
    return { items, total, page: current, pageSize: size };
}

async function resolveOrganizerEmail(actor) {
    if (isEmail(actor.email)) return actor.email.trim();
    if (actor.username) {
        const row = await pgDb.get('SELECT email FROM hub.users WHERE LOWER(username) = LOWER(?)', [actor.username]);
        if (isEmail(row?.email)) return row.email.trim();
    }
    const fallback = await getSetting('calendar_organizer_email');
    return isEmail(fallback) ? fallback.trim() : '';
}

function isGraphNotFound(err) {
    const status = err?.response?.status;
    const code = err?.response?.data?.error?.code || '';
    return status === 404 || /ErrorItemNotFound|itemNotFound/i.test(code);
}

function buildEventBody(entretien, campaign, appUrl) {
    const agent = fullName(entretien.agent_prenom, entretien.agent_nom) || entretien.agent_email || 'Agent';
    const annee = campaign?.annee || '';
    return {
        titre: `Entretien professionnel${annee ? ' ' + annee : ''} — ${agent}`,
        body: `
            <p><strong>Entretien professionnel annuel${annee ? ' ' + annee : ''}</strong></p>
            <p>Agent : <strong>${agent}</strong>${entretien.service ? ' — ' + entretien.service : ''}</p>
            <p>Évaluateur : <strong>${entretien.evaluator_nom || entretien.evaluator_email || 'à définir'}</strong></p>
            <p>Merci de préparer votre entretien dans l'application : <a href="${appUrl}">Mes entretiens professionnels</a></p>
        `,
    };
}

/**
 * Crée ou met à jour l'événement Outlook (invitation dans les calendriers de
 * l'agent et de l'évaluateur). Ne lève jamais : renvoie un statut exploitable.
 */
async function syncOutlook(entretien, actor, campaign, { forceCreate = false } = {}) {
    if (!entretien?.date_entretien) {
        return { ok: false, skipped: true, error: "La date de l'entretien n'est pas renseignée." };
    }
    try {
        const organizerEmail = await resolveOrganizerEmail(actor);
        if (!organizerEmail) {
            throw new Error("Aucune adresse email O365 disponible pour créer l'invitation (email du compte ou paramètre « organisateur calendrier »).");
        }

        const organizerNorm = norm(organizerEmail);
        const attendees = [];
        const push = (email, name) => {
            const e = String(email || '').trim();
            if (!isEmail(e) || norm(e) === organizerNorm) return;
            if (attendees.some(a => norm(a.email) === norm(e))) return;
            attendees.push({ email: e, name: name || e });
        };
        const okAgent = await epBeta.allowedForEntretien(entretien, entretien.agent_email, 'invitation Outlook');
        const okEval = await epBeta.allowedForEntretien(entretien, entretien.evaluator_email, 'invitation Outlook');
        if (okAgent) push(entretien.agent_email, fullName(entretien.agent_prenom, entretien.agent_nom));
        if (okEval) push(entretien.evaluator_email, entretien.evaluator_nom);

        const { titre, body } = buildEventBody(entretien, campaign, await require('./entretiens-email').entretiensUrl('auto'));
        const common = {
            organizerEmail,
            dateReunion: entretien.date_entretien,
            dureeMinutes: Number(entretien.duree_minutes) || 120,
            lieu: entretien.lieu || '',
        };

        let evt = null;
        let updated = false;
        if (entretien.outlook_event_id && !forceCreate) {
            const mailbox = entretien.outlook_organizer || organizerEmail;
            try {
                evt = await updateOutlookEvent({
                    ...common,
                    organizerEmail: mailbox,
                    eventId: entretien.outlook_event_id,
                    titre,
                    ordreDuJour: body,
                    attendees,
                });
                updated = true;
            } catch (e) {
                if (!isGraphNotFound(e)) throw e;
                evt = null; // événement supprimé côté Outlook → on le recrée
            }
        }

        if (!evt) {
            evt = await createOutlookEvent({
                ...common,
                titre,
                ordreDuJour: body,
                attendees,
            });
        }

        await pgDb.run(
            `UPDATE hub_entretiens.entretiens
             SET outlook_event_id = ?, outlook_organizer = ?, outlook_web_link = ?,
                 outlook_status = 'envoye', outlook_error = NULL, updated_at = NOW()
             WHERE id = ?`,
            [evt.id || null, organizerEmail, evt.webLink || null, entretien.id]
        );
        return { ok: true, updated, created: !updated, eventId: evt.id, webLink: evt.webLink || null, organizerEmail };
    } catch (e) {
        const message = e?.response?.data?.error?.message || e.message || 'Erreur Outlook inconnue';
        console.error('[ENTRETIENS] Synchro Outlook échouée:', message);
        try {
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens
                 SET outlook_status = 'erreur', outlook_error = ?, updated_at = NOW()
                 WHERE id = ?`,
                [message, entretien.id]
            );
        } catch (e2) { /* ignore */ }
        return { ok: false, error: message };
    }
}

/** Supprime l'événement Outlook associé, sans jamais faire échouer la suppression métier. */
async function removeOutlook(entretien) {
    if (!entretien?.outlook_event_id) return;
    try {
        await deleteOutlookEvent({
            organizerEmail: entretien.outlook_organizer,
            eventId: entretien.outlook_event_id,
        });
    } catch (e) {
        console.warn('[ENTRETIENS] Suppression Outlook échouée:', e?.response?.data?.error?.message || e.message);
    }
}

module.exports = {
    DUREES_EP, dureeEp, currentCampaignFlags,
    tokenKey,
    findReprise,
    attachReprise,
    sendEvaluatorMail,
    sendPreparationMail,
    forViewer,
    evaluatorIdentity,
    evaluatorClause,
    norm,
    isEmail,
    localNow,
    normalizeDateTime,
    normalizeDate,
    formatDateTimeFr,
    fullName,
    getActor,
    isEpAdmin,
    isEpPilotage,
    resolveRole,
    buildAccess,
    getCurrentCampaign,
    getEntretienById,
    withRelations,
    listEntretiens,
    computeStats,
    getSetting,
    setSetting,
    scanReadingOn,
    offlineFormOn,
    fullscreenOn,
    getAiEvaluators,
    getAiSettings,
    aiAccessFor,
    listAiEvaluatorCandidates,
    logAudit,
    listAuditLogs,
    selfAccessFor,
    getSelfAgents,
    getSelfSettings,
    esignAllowedFor,
    getEsignSettings,
    listAgentCandidates,
    resolveOrganizerEmail,
    syncOutlook,
    removeOutlook,
};
