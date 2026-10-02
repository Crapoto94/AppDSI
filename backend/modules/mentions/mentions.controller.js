const { pgDb } = require('../../shared/database');
const svc = require('./mentions.service');

exports.searchUsers = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const rows = await pgDb.all(
            `SELECT username, "displayName" AS display_name, service_code FROM hub.users
             WHERE is_approved = 1 AND "displayName" IS NOT NULL AND TRIM("displayName") <> ''
               AND (unaccent(lower("displayName")) LIKE unaccent(lower($1)) OR unaccent(lower("displayName")) LIKE unaccent(lower($2)))
             ORDER BY "displayName" LIMIT 8`,
            [`${q}%`, `% ${q}%`]
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.list = async (req, res) => {
    try {
        const rows = await pgDb.all(
            `SELECT id, type, title, body, link, actor_name, read_at, created_at FROM hub.user_notifications
             WHERE username = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.username]);
        const c = await pgDb.get(`SELECT COUNT(*) AS n FROM hub.user_notifications WHERE username = $1 AND read_at IS NULL`, [req.user.username]);
        res.json({ unread: parseInt(c.n, 10), items: rows });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.unreadCount = async (req, res) => {
    try {
        const c = await pgDb.get(`SELECT COUNT(*) AS n FROM hub.user_notifications WHERE username = $1 AND read_at IS NULL`, [req.user.username]);
        res.json({ unread: parseInt(c.n, 10) });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.markRead = async (req, res) => {
    try {
        await pgDb.run(`UPDATE hub.user_notifications SET read_at = NOW() WHERE id = $1 AND username = $2 AND read_at IS NULL`, [parseInt(req.params.id, 10), req.user.username]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.markAllRead = async (req, res) => {
    try {
        await pgDb.run(`UPDATE hub.user_notifications SET read_at = NOW() WHERE username = $1 AND read_at IS NULL`, [req.user.username]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.runDigest = async (req, res) => {
    try { res.json({ sent: await svc.sendDigest() }); } catch (e) { res.status(500).json({ message: e.message }); }
};
