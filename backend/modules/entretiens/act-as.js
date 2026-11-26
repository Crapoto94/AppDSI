/**
 * « Afficher en tant que » (module Entretiens seulement), sur le modèle de Délib : le navigateur envoie l'en-tête
 * `X-Act-As: <identifiant>` et la requête a EXACTEMENT les droits de cette personne. Rien n'est cru côté client : le droit
 * (administrateur des entretiens) est revérifié à chaque requête, et le journal garde le vrai auteur.
 */
const { pgDb, getSqlite } = require('../../shared/database');
const { authenticateJWT } = require('../../shared/middleware');
const adHelper = require('../../shared/ad_helper');
const svc = require('./entretiens.service');

const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const lower = (v) => text(v).toLowerCase();
const GLOBAL_ADMIN = ['admin', 'superadmin'];
/** La signature de l'agent l'engage personnellement : jamais faite à sa place. */
const FORBIDDEN = [/\/crep\/agent-validate\/?$/];
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Identité complète (identifiant, e-mail, nom, rôle) d'une personne désignée par son identifiant AD ou son adresse. */
async function loadTarget(login) {
    const key = lower(login);
    if (!key) throw fail(400, 'Choisissez une personne.');
    const quiet = (p) => p.catch(() => null);
    const base = await quiet(pgDb.get('SELECT nom, prenom, nom_prenom, email, ad_username FROM hub_entretiens.base_agents WHERE LOWER(ad_username) = ? OR LOWER(email) = ? LIMIT 1', [key, key]));
    const hub = await quiet(pgDb.get('SELECT username, email, role, displayName AS "displayName" FROM hub.users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1', [key, key]));
    const ent = (!base && !hub) ? await quiet(pgDb.get(
        `SELECT evaluator_nom AS nom FROM hub_entretiens.entretiens WHERE deleted_at IS NULL AND (LOWER(evaluator_username) = ? OR LOWER(evaluator_email) = ?)
         UNION ALL SELECT TRIM(CONCAT(agent_prenom, ' ', agent_nom)) FROM hub_entretiens.entretiens WHERE deleted_at IS NULL AND (LOWER(agent_username) = ? OR LOWER(agent_email) = ?) LIMIT 1`,
        [key, key, key, key])) : null;
    if (!base && !hub && !ent) throw fail(404, 'Personne inconnue du module Entretiens.');
    const isMail = key.includes('@');
    const username = text(base?.ad_username) || text(hub?.username) || (isMail ? '' : key);
    const email = text(base?.email) || text(hub?.email) || (isMail ? key : `${key}@${adHelper.EMAIL_DOMAIN}`);
    const sqlite = getSqlite();
    const local = username && sqlite ? await quiet(sqlite.get('SELECT id, role FROM users WHERE LOWER(username) = LOWER(?)', [username])) : null;
    const roles = [hub?.role, local?.role].map(lower);
    return {
        id: local?.id || 0,
        username, email,
        displayName: text(hub?.displayName) || `${text(base?.prenom)} ${text(base?.nom)}`.trim() || text(base?.nom_prenom) || text(ent?.nom) || username || email,
        role: roles.find(r => GLOBAL_ADMIN.includes(r)) || roles.find(Boolean) || 'user',
    };
}

/** Vérifie que `real` (l'utilisateur connecté) peut agir en tant que `login` et renvoie l'identité visée. */
async function actAsTarget(real, login) {
    if (!(await svc.isEpAdmin(real))) throw fail(403, '« Afficher en tant que » est réservé aux administrateurs des entretiens.');
    const target = await loadTarget(login);
    if (GLOBAL_ADMIN.includes(target.role) && !GLOBAL_ADMIN.includes(lower(real.role))) throw fail(403, 'Vous ne pouvez pas agir en tant qu’administrateur de l’application.');
    return target;
}

async function applyActAs(req, res, next) {
    let login = '';
    try { login = decodeURIComponent(text(req.headers['x-act-as'])); } catch { /* en-tête illisible : ignoré */ }
    if (!login || req.apiKey || /^\/act-as(\/|$)/.test(req.path)) return next();
    try {
        const real = await svc.getActor(req);
        if ([lower(real.username), lower(real.email)].includes(lower(login))) return next();
        const target = await actAsTarget(real, login);
        if (req.method !== 'GET' && FORBIDDEN.some(r => r.test(req.path))) {
            return res.status(403).json({ message: 'La signature de l’agent ne peut pas être faite « en tant que » : revenez à votre compte.' });
        }
        req.user = { ...target, is_approved: 1, impersonatedBy: real.username, impersonatorName: real.displayName || real.username };
        if (req.method !== 'GET') {
            await svc.logAudit({ actor: await svc.getActor(req), action: 'en_tant_que_action', details: { methode: req.method, chemin: req.baseUrl + req.path } });
        }
        next();
    } catch (e) {
        if (!e.status) console.error('[ENTRETIENS] en tant que :', e);
        res.status(e.status || 500).json({ message: e.message });
    }
}

/** À utiliser à la place d'`authenticateJWT` sur les routes du module Entretiens. */
const authenticateEp = (req, res, next) => authenticateJWT(req, res, () => applyActAs(req, res, next));

// ─── Routes « en tant que » (toujours sous l'identité réelle) ───────────────

const wrap = (fn) => async (req, res) => {
    try { await fn(req, res, await svc.getActor(req)); }
    catch (e) { if (!e.status) console.error('[ENTRETIENS] en tant que :', e); res.status(e.status || 500).json({ message: e.message }); }
};

/** Personnes proposées : agents et évaluateurs de la base qui ont un compte ou une adresse, puis comptes de l'application. */
const search = wrap(async (req, res, actor) => {
    if (!(await svc.isEpAdmin(actor))) throw fail(403, 'Réservé aux administrateurs des entretiens.');
    const q = lower(req.query.q);
    if (q.length < 2) return res.json({ users: [] });
    const like = `%${q}%`;
    const rows = await pgDb.all(
        `SELECT b.nom_prenom, b.email, b.ad_username, b.service,
                (SELECT COUNT(*)::int FROM hub_entretiens.base_agents a WHERE a.a_conserver AND a.valideur_matricule = b.matricule) AS evalues
         FROM hub_entretiens.base_agents b
         WHERE (COALESCE(b.ad_username, '') <> '' OR COALESCE(b.email, '') <> '')
           AND (LOWER(b.nom_prenom) LIKE ? OR LOWER(b.email) LIKE ? OR LOWER(b.ad_username) LIKE ?)
         ORDER BY b.nom_prenom LIMIT 20`, [like, like, like]).catch(() => []);
    const users = new Map();
    for (const r of rows) {
        const login = text(r.ad_username) || lower(r.email);
        users.set(lower(login), { login, nom: r.nom_prenom, detail: [r.service, r.evalues ? `évalue ${r.evalues} agent·e·s` : ''].filter(Boolean).join(' · ') });
    }
    const hubs = await pgDb.all('SELECT username, email, displayName AS "displayName" FROM hub.users WHERE LOWER(username) LIKE ? OR LOWER(displayName) LIKE ? OR LOWER(email) LIKE ? LIMIT 20', [like, like, like]).catch(() => []);
    for (const u of hubs) {
        if (users.size >= 30) break;
        if (u.username && !users.has(lower(u.username))) users.set(lower(u.username), { login: u.username, nom: u.displayName || u.username, detail: u.email || '' });
    }
    users.delete(lower(actor.username));
    res.json({ users: [...users.values()] });
});

const start = wrap(async (req, res, actor) => {
    const target = await actAsTarget(actor, req.body?.login);
    await svc.logAudit({ actor, action: 'en_tant_que_debut', details: { personne: target.displayName, identifiant: target.username || target.email } });
    res.json({ login: target.username || target.email, nom: target.displayName });
});

const stop = wrap(async (req, res, actor) => {
    await svc.logAudit({ actor, action: 'en_tant_que_fin', details: { identifiant: text(req.query.login) } });
    res.json({ ok: true });
});

module.exports = { authenticateEp, actAsTarget, search, start, stop };
