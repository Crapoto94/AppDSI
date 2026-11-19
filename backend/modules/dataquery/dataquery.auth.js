/**
 * Identification personnelle du module dataquery (2e facteur, en plus de la clé API).
 *
 * Pourquoi un mécanisme dédié : les jetons du chat (/api/live/*) ne prouvent pas
 * l'identité — `guest-login` est public et signe un JWT avec un nom/email libres,
 * et ces jetons partagent le SECRET_KEY de l'application (valeur par défaut connue
 * puisque le code est publié). On n'accepte donc AUCUN jeton existant ici.
 *
 * Flux :
 *   POST /api/dataquery/auth/login   (X-API-Key + { username, password })
 *     → authentification AD (même annuaire que le chat), contrôle d'autorisation,
 *       création d'une session en base, jeton signé avec DATAQUERY_SESSION_SECRET,
 *       lié à la clé API utilisée, durée limitée (DATAQUERY_SESSION_TTL_HOURS, 8 h).
 *   Requêtes suivantes : X-API-Key + X-DQ-Session (les deux sont exigés).
 *   POST /api/dataquery/auth/logout  révoque la session.
 *
 * Personnes autorisées : tout compte du DSIHUB (table `users` de SQLite, quel que soit son rôle),
 * ou username listé dans DATAQUERY_ALLOWED_USERS (séparés par des virgules).
 * Le vrai verrou reste la clé API `dsk_…` (créée par un admin, avec expiration) et
 * l'authentification AD. Revérifié à chaque requête.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool, getSqlite } = require('../../shared/database');
const adAuth = require('../../shared/ad_auth');

const SESSION_HEADER = 'x-dq-session';
const MIN_SECRET_LENGTH = 32;
const ttlHours = () => Math.min(Math.max(parseFloat(process.env.DATAQUERY_SESSION_TTL_HOURS) || 8, 0.25), 24);

function sessionSecret() {
    const s = process.env.DATAQUERY_SESSION_SECRET || '';
    return s.length >= MIN_SECRET_LENGTH ? s : null;
}

function cleanUsername(u) {
    return String(u || '').trim().replace(/@ivry94\.fr$/i, '').replace(/^.*\\/, '').toLowerCase();
}

// ── Anti brute-force : échecs par username et par IP, fenêtre de 15 min ──────
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX_USER = 5;
const FAIL_MAX_IP = 20;
const failures = new Map();
function failCount(k) {
    const now = Date.now();
    const arr = (failures.get(k) || []).filter(t => now - t < FAIL_WINDOW_MS);
    failures.set(k, arr);
    return arr.length;
}
function addFailure(k) { failures.set(k, [...(failures.get(k) || []), Date.now()]); }

// ── Autorisation (rôle revérifié à chaque requête, cache 60 s) ──────────────
const authzCache = new Map();
async function isAuthorized(username) {
    const allow = (process.env.DATAQUERY_ALLOWED_USERS || '').split(',').map(cleanUsername).filter(Boolean);
    if (allow.includes(username)) return true;
    const c = authzCache.get(username);
    if (c && Date.now() - c.at < 60000) return c.ok;
    // Comptes du DSIHUB = table `users` de SQLite (celle qui porte l'authentification
    // de l'application ; hub.users en PostgreSQL n'en est qu'un miroir incomplet).
    const db = getSqlite();
    if (!db) return false; // SQLite indisponible : on refuse (échec fermé)
    const row = await db.get('SELECT 1 AS ok FROM users WHERE LOWER(username) = ? LIMIT 1', [username]);
    const ok = !!row;
    authzCache.set(username, { at: Date.now(), ok });
    return ok;
}

module.exports = (audit, clientIp) => ({
    SESSION_HEADER,

    // POST /api/dataquery/auth/login  { username, password }
    async login(req, res) {
        const secret = sessionSecret();
        if (!secret) {
            return res.status(503).json({ error: `DATAQUERY_SESSION_SECRET absent ou trop court (min ${MIN_SECRET_LENGTH} caractères)` });
        }
        const username = cleanUsername(req.body?.username);
        const password = req.body?.password;
        const ip = clientIp(req) || 'inconnue';
        req.dqUser = { username };
        if (!username || typeof password !== 'string' || !password) {
            return res.status(400).json({ error: 'Identifiant Windows et mot de passe requis' });
        }
        if (failCount(`u:${username}`) >= FAIL_MAX_USER || failCount(`ip:${ip}`) >= FAIL_MAX_IP) {
            await audit(req, { action: 'login_bloque', error: 'Trop de tentatives' });
            return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes' });
        }
        const fail = async (status, error, detail) => {
            addFailure(`u:${username}`); addFailure(`ip:${ip}`);
            await audit(req, { action: 'login_echec', error: detail || error });
            return res.status(status).json({ error });
        };
        let adUser;
        try {
            const db = getSqlite();
            const adSettings = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
            if (!adSettings || !adSettings.is_enabled) {
                await audit(req, { action: 'login_echec', error: 'AD non configuré' });
                return res.status(503).json({ error: 'Authentification AD non disponible' });
            }
            adUser = await adAuth.authenticateAD(username, password, adSettings);
        } catch (e) {
            return fail(401, 'Identifiants incorrects', `AD : ${e.message}`);
        }
        if (!adUser) return fail(401, 'Identifiants incorrects');
        if (!(await isAuthorized(username))) {
            return fail(403, 'Compte non autorisé à interroger les données (compte absent du DSIHUB)', 'non autorisé');
        }
        failures.delete(`u:${username}`);

        const jti = crypto.randomUUID();
        const hours = ttlHours();
        const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
        const clientLabel = String(req.body?.client || '').slice(0, 200) || null;
        await pool.query(
            `INSERT INTO hub.dataquery_sessions (jti, username, display_name, api_key_id, ip, client, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [jti, username, adUser.displayName || null, req.apiKey.id, ip, clientLabel, expiresAt]
        );
        const token = jwt.sign(
            { typ: 'dq_session', sub: username, name: adUser.displayName || username, kid: req.apiKey.id },
            secret, { jwtid: jti, expiresIn: Math.round(hours * 3600), algorithm: 'HS256' }
        );
        req.dqUser = { username, displayName: adUser.displayName, jti };
        await audit(req, { action: 'login', sql: clientLabel });
        res.json({ session: token, expires_at: expiresAt.toISOString(), user: { username, displayName: adUser.displayName || username } });
    },

    // Middleware : exige une session personnelle valide, liée à la clé API présentée.
    async requireSession(req, res, next) {
        const secret = sessionSecret();
        if (!secret) return res.status(503).json({ error: 'DATAQUERY_SESSION_SECRET non configuré' });
        const token = req.headers[SESSION_HEADER];
        if (!token) {
            return res.status(401).json({ error: 'Identification personnelle requise : POST /api/dataquery/auth/login puis en-tête X-DQ-Session' });
        }
        let claims;
        try {
            claims = jwt.verify(String(token), secret, { algorithms: ['HS256'] });
        } catch (e) {
            return res.status(401).json({ error: `Session invalide : ${e.message}` });
        }
        if (claims.typ !== 'dq_session') return res.status(401).json({ error: 'Session invalide' });
        if (claims.kid !== req.apiKey.id) {
            await audit(req, { action: 'session_refusee', error: `session liée à la clé ${claims.kid}` });
            return res.status(401).json({ error: 'Cette session a été ouverte avec une autre clé API' });
        }
        const { rows } = await pool.query(
            `UPDATE hub.dataquery_sessions SET last_used_at = NOW()
             WHERE jti = $1 AND revoked_at IS NULL AND expires_at > NOW() RETURNING username, display_name`,
            [claims.jti]
        );
        if (rows.length === 0) return res.status(401).json({ error: 'Session révoquée ou expirée' });
        if (!(await isAuthorized(claims.sub))) {
            await pool.query(`UPDATE hub.dataquery_sessions SET revoked_at = NOW(), revoked_reason = 'autorisation retirée' WHERE jti = $1`, [claims.jti]);
            return res.status(403).json({ error: 'Autorisation retirée pour ce compte' });
        }
        req.dqUser = { username: claims.sub, displayName: rows[0].display_name, jti: claims.jti };
        next();
    },

    // POST /api/dataquery/auth/logout
    async logout(req, res) {
        await pool.query(
            `UPDATE hub.dataquery_sessions SET revoked_at = NOW(), revoked_reason = 'déconnexion' WHERE jti = $1 AND revoked_at IS NULL`,
            [req.dqUser.jti]
        );
        await audit(req, { action: 'logout' });
        res.json({ ok: true });
    },
});
