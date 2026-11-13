const { pgDb } = require('../../shared/database');
const ForumController = require('./forum.controller');

/** Bandeau d'actualité permanent du magasin. Configuré dans /admin/magapp > Paramètres. */

const LEVELS = ['info', 'success', 'warning', 'alert'];

const clampHeight = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(150, Math.max(28, n)) : 56;
};

const toPublic = (r, admin) => {
    if (!r) return { enabled: false };
    const until = r.until_date ? String(r.until_date).slice(0, 10) : '';
    const expired = !!until && new Date().toISOString().slice(0, 10) > until;
    return {
        enabled: admin ? !!r.enabled : (!!r.enabled && !expired && !!String(r.message || '').trim()),
        message: r.message || '',
        link_url: r.link_url || '',
        link_label: r.link_label || '',
        level: LEVELS.includes(r.level) ? r.level : 'info',
        scrolling: !!r.scrolling,
        height: clampHeight(r.height),
        forum_enabled: !!r.forum_enabled,
        forum_locked: !!r.forum_locked,
        until
    };
};

module.exports = {
    get: async (req, res) => {
        try {
            const r = await pgDb.get('SELECT enabled, message, link_url, link_label, level, scrolling, height, forum_enabled, forum_locked, forum_id, until_date::text AS until_date FROM magapp.news_banner WHERE id = 1');
            const out = toPublic(r, req.query.admin === 'true');
            if (r && r.forum_enabled && out.enabled) out.forum_count = await ForumController.count(r.forum_id);
            res.json(out);
        } catch (e) {
            console.error('[MAGAPP] news_banner get:', e.message);
            res.json({ enabled: false });
        }
    },

    save: async (req, res) => {
        try {
            const b = req.body || {};
            const until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.until || '')) ? b.until : null;
            const level = LEVELS.includes(b.level) ? b.level : 'info';
            await pgDb.run(
                'UPDATE magapp.news_banner SET enabled = ?, message = ?, link_url = ?, link_label = ?, level = ?, scrolling = ?, height = ?, forum_enabled = ?, forum_locked = ?, until_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
                [b.enabled === true || b.enabled === 'true', String(b.message || '').trim(), String(b.link_url || '').trim(), String(b.link_label || '').trim(), level, b.scrolling === true || b.scrolling === 'true', clampHeight(b.height), b.forum_enabled === true || b.forum_enabled === 'true', b.forum_locked === true || b.forum_locked === 'true', until]
            );
            res.json({ message: 'Bandeau enregistré' });
        } catch (e) {
            console.error('[MAGAPP] news_banner save:', e.message);
            res.status(500).json({ message: 'Erreur enregistrement bandeau', error: e.message });
        }
    }
};
