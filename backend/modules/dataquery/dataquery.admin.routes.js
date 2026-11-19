const express = require('express');
const router = express.Router();
const { pool, getSqlite } = require('../../shared/database');
const { authenticateAdmin } = require('../../shared/middleware');
const { SCHEMA_MODULES } = require('./dataquery.controller');
const rights = require('./dataquery.rights');

/**
 * Administration du serveur MCP (module dataquery) — réservée aux administrateurs.
 *
 *   GET    /api/admin/dataquery/overview               chiffres clés
 *   GET    /api/admin/dataquery/agents                 agents (activité + droits)
 *   GET    /api/admin/dataquery/queries                historique des consultations (filtres)
 *   GET    /api/admin/dataquery/connections            historique des connexions (filtres)
 *   GET    /api/admin/dataquery/sessions               sessions (actives par défaut)
 *   POST   /api/admin/dataquery/sessions/:jti/revoke   révoque une session
 *   POST   /api/admin/dataquery/sessions/revoke-user   { username } révoque toutes ses sessions
 *   GET    /api/admin/dataquery/schemas                modules (schémas) attribuables
 *   GET    /api/admin/dataquery/users                  comptes du DSIHUB (suggestions)
 *   GET    /api/admin/dataquery/rights                 droits (dont défaut '*')
 *   PUT    /api/admin/dataquery/rights/:username       { mode, schemas?, note? }
 *   DELETE /api/admin/dataquery/rights/:username       revient aux droits par défaut
 */
router.use(authenticateAdmin);

const clean = (u) => String(u || '').trim().toLowerCase();
const num = (v, def, max) => Math.min(Math.max(parseInt(v, 10) || def, 1), max);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));

const CONNECTION_ACTIONS = ['login', 'logout', 'login_echec', 'login_bloque', 'session_refusee'];
const QUERY_ACTIONS = ['query', 'query_refusee', 'catalog', 'describe'];

function fail(res, e) {
    console.error('[DATAQUERY admin]', e.message);
    res.status(500).json({ error: e.message });
}

/** Construit un WHERE commun (agent, dates, texte) pour la table d'audit. */
function auditFilters(q, actions) {
    const where = ['a.action = ANY($1)'];
    const params = [actions];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (q.username) add('a.username = ?', clean(q.username));
    if (q.action && actions.includes(String(q.action))) add('a.action = ?', String(q.action));
    if (isDate(q.from)) add('a.created_at >= ?::timestamptz', q.from);
    if (isDate(q.to)) add("a.created_at < (?::date + 1)", String(q.to).slice(0, 10));
    if (q.q) add("a.sql_text ILIKE '%' || ? || '%'", String(q.q).slice(0, 200));
    if (q.errors_only === '1' || q.errors_only === 'true') where.push('a.error IS NOT NULL');
    return { where: where.join(' AND '), params };
}

router.get('/overview', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
              (SELECT count(*) FROM hub.dataquery_sessions WHERE revoked_at IS NULL AND expires_at > NOW())::int AS sessions_actives,
              (SELECT count(*) FROM hub.dataquery_audit WHERE action = 'query' AND created_at > NOW() - interval '24 hours')::int AS requetes_24h,
              (SELECT count(*) FROM hub.dataquery_audit WHERE action = 'query_refusee' AND created_at > NOW() - interval '24 hours')::int AS refus_24h,
              (SELECT count(*) FROM hub.dataquery_audit WHERE action IN ('login_echec','login_bloque') AND created_at > NOW() - interval '24 hours')::int AS echecs_connexion_24h,
              (SELECT count(DISTINCT username) FROM hub.dataquery_audit WHERE created_at > NOW() - interval '30 days' AND username IS NOT NULL)::int AS agents_30j`);
        res.json({ ...rows[0], enabled: process.env.DATAQUERY_ENABLED === 'true' });
    } catch (e) { fail(res, e); }
});

router.get('/agents', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH names AS (
              SELECT username FROM hub.dataquery_audit WHERE username IS NOT NULL
              UNION SELECT username FROM hub.dataquery_sessions
              UNION SELECT username FROM hub.dataquery_rights WHERE username <> '*'
            )
            SELECT n.username,
              (SELECT s.display_name FROM hub.dataquery_sessions s
                 WHERE s.username = n.username AND s.display_name IS NOT NULL ORDER BY s.created_at DESC LIMIT 1) AS display_name,
              (SELECT count(*) FROM hub.dataquery_audit a WHERE a.username = n.username AND a.action = 'query')::int AS nb_requetes,
              (SELECT count(*) FROM hub.dataquery_audit a WHERE a.username = n.username AND a.action = 'query_refusee')::int AS nb_refus,
              (SELECT count(*) FROM hub.dataquery_audit a WHERE a.username = n.username AND a.action = 'login')::int AS nb_connexions,
              (SELECT max(a.created_at) FROM hub.dataquery_audit a WHERE a.username = n.username) AS derniere_activite,
              (SELECT count(*) FROM hub.dataquery_sessions s
                 WHERE s.username = n.username AND s.revoked_at IS NULL AND s.expires_at > NOW())::int AS sessions_actives
            FROM names n ORDER BY derniere_activite DESC NULLS LAST, n.username`);
        const all = await rights.loadAll();
        const def = all.get(rights.DEFAULT_KEY);
        res.json(rows.map(r => {
            const own = all.get(r.username);
            return {
                ...r,
                droits: own
                    ? { mode: own.mode, schemas: own.schemas, note: own.note, source: 'agent', updated_by: own.updated_by, updated_at: own.updated_at }
                    : { mode: def?.mode || 'all', schemas: def?.schemas || [], note: null, source: def ? 'defaut' : 'historique' },
            };
        }));
    } catch (e) { fail(res, e); }
});

router.get('/queries', async (req, res) => {
    try {
        const limit = num(req.query.limit, 50, 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const { where, params } = auditFilters(req.query, QUERY_ACTIONS);
        const total = await pool.query(`SELECT count(*)::int AS n FROM hub.dataquery_audit a WHERE ${where}`, params);
        const { rows } = await pool.query(
            `SELECT a.id, a.created_at, a.username, a.api_key_name, a.ip, a.action, a.sql_text, a.row_count, a.duration_ms, a.error, a.trace_id
             FROM hub.dataquery_audit a WHERE ${where}
             ORDER BY a.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
        res.json({ total: total.rows[0].n, limit, offset, rows });
    } catch (e) { fail(res, e); }
});

router.get('/connections', async (req, res) => {
    try {
        const limit = num(req.query.limit, 50, 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const { where, params } = auditFilters(req.query, CONNECTION_ACTIONS);
        const total = await pool.query(`SELECT count(*)::int AS n FROM hub.dataquery_audit a WHERE ${where}`, params);
        const { rows } = await pool.query(
            `SELECT a.id, a.created_at, a.username, a.api_key_name, a.ip, a.action, a.sql_text AS client, a.error, a.trace_id
             FROM hub.dataquery_audit a WHERE ${where}
             ORDER BY a.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
        res.json({ total: total.rows[0].n, limit, offset, rows });
    } catch (e) { fail(res, e); }
});

router.get('/sessions', async (req, res) => {
    try {
        const params = [];
        const where = [];
        if (req.query.username) { params.push(clean(req.query.username)); where.push(`username = $${params.length}`); }
        if (req.query.active !== '0') where.push('revoked_at IS NULL AND expires_at > NOW()');
        const { rows } = await pool.query(
            `SELECT jti, username, display_name, api_key_id, ip, client, created_at, expires_at, last_used_at, revoked_at, revoked_reason,
                    (revoked_at IS NULL AND expires_at > NOW()) AS active
             FROM hub.dataquery_sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY created_at DESC LIMIT 200`, params);
        res.json(rows);
    } catch (e) { fail(res, e); }
});

router.post('/sessions/:jti/revoke', async (req, res) => {
    try {
        if (!/^[0-9a-f-]{36}$/i.test(req.params.jti)) return res.status(400).json({ error: 'Identifiant de session invalide' });
        const r = await pool.query(
            `UPDATE hub.dataquery_sessions SET revoked_at = NOW(), revoked_reason = $2
             WHERE jti = $1 AND revoked_at IS NULL`,
            [req.params.jti, `révoquée par ${req.user?.username || 'admin'}`]);
        res.json({ revoked: r.rowCount });
    } catch (e) { fail(res, e); }
});

router.post('/sessions/revoke-user', express.json({ limit: '5kb' }), async (req, res) => {
    try {
        const username = clean(req.body?.username);
        if (!username) return res.status(400).json({ error: 'username requis' });
        const r = await pool.query(
            `UPDATE hub.dataquery_sessions SET revoked_at = NOW(), revoked_reason = $2
             WHERE username = $1 AND revoked_at IS NULL`,
            [username, `révoquée par ${req.user?.username || 'admin'}`]);
        res.json({ revoked: r.rowCount });
    } catch (e) { fail(res, e); }
});

router.get('/schemas', (req, res) => {
    res.json(Object.entries(SCHEMA_MODULES).map(([schema, label]) => ({ schema, label })));
});

router.get('/users', async (req, res) => {
    try {
        const db = getSqlite();
        const rows = db ? await db.all('SELECT username, displayName FROM users ORDER BY username') : [];
        res.json(rows.map(r => ({ username: clean(r.username), displayName: r.displayName || null })));
    } catch (e) { fail(res, e); }
});

router.get('/rights', async (req, res) => {
    try {
        res.json([...(await rights.loadAll()).values()]);
    } catch (e) { fail(res, e); }
});

router.put('/rights/:username', express.json({ limit: '20kb' }), async (req, res) => {
    try {
        const username = req.params.username === rights.DEFAULT_KEY ? rights.DEFAULT_KEY : clean(req.params.username);
        if (!username || !/^[a-z0-9._*-]{1,100}$/.test(username)) return res.status(400).json({ error: 'Identifiant invalide' });
        const { mode, schemas, note, write_actions } = req.body || {};
        if (!rights.MODES.includes(mode)) return res.status(400).json({ error: `mode attendu : ${rights.MODES.join(' | ')}` });
        if (mode === 'restricted' && (!Array.isArray(schemas) || schemas.length === 0)) {
            return res.status(400).json({ error: 'Choisissez au moins un module pour des droits restreints' });
        }
        await rights.setRights(username, { mode, schemas, note, write_actions }, req.user?.username);
        // Un agent bloqué perd ses sessions immédiatement.
        if (mode === 'blocked' && username !== rights.DEFAULT_KEY) {
            await pool.query(
                `UPDATE hub.dataquery_sessions SET revoked_at = NOW(), revoked_reason = 'accès bloqué par un administrateur'
                 WHERE username = $1 AND revoked_at IS NULL`, [username]);
        }
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
});

router.delete('/rights/:username', async (req, res) => {
    try {
        await rights.deleteRights(req.params.username === rights.DEFAULT_KEY ? rights.DEFAULT_KEY : clean(req.params.username));
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
});

module.exports = router;
