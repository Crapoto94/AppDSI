const { pgDb, pool } = require('../../shared/database');
const { isAdminLike } = require('../../shared/middleware');

/**
 * Forum de crise du magasin : un fil questions / réponses associé au bandeau d'actualité en cours.
 * Activé et modéré dans /admin/magapp > Paramètres > Bandeau d'actualité.
 * Un « nouveau forum » archive les messages précédents (ils restent en base, mais ne s'affichent plus).
 */

const MAX_BODY = 2000;
const hits = new Map(); // anti-flood : 10 messages / minute / utilisateur

const rateLimited = (username) => {
    const now = Date.now();
    const list = (hits.get(username) || []).filter(t => now - t < 60000);
    if (list.length >= 10) { hits.set(username, list); return true; }
    list.push(now);
    hits.set(username, list);
    return false;
};

const getState = async () => pgDb.get('SELECT enabled, message, forum_enabled, forum_locked, forum_id FROM magapp.news_banner WHERE id = 1');

const clean = (s, max) => String(s || '').replace(/\u0000/g, '').trim().substring(0, max);

module.exports = {
    list: async (req, res) => {
        try {
            const st = await getState();
            if (!st || !st.forum_enabled) return res.json({ enabled: false });
            const admin = isAdminLike(req.user);
            const rows = await pgDb.all(
                `SELECT id, parent_id, author_username, author_name, is_staff, body, resolved, hidden, created_at
                 FROM magapp.forum_posts WHERE forum_id = $1 ORDER BY created_at ASC, id ASC`,
                [st.forum_id]
            );
            const visible = rows.filter(r => admin || !r.hidden);
            const mapPost = (r) => ({
                id: r.id, author: r.author_name || r.author_username, username: r.author_username,
                is_staff: !!r.is_staff, body: r.body, created_at: r.created_at, hidden: !!r.hidden
            });
            const questions = visible.filter(r => !r.parent_id);
            const threads = questions.map(q => ({
                ...mapPost(q),
                resolved: !!q.resolved,
                replies: visible.filter(r => r.parent_id === q.id).map(mapPost)
            })).reverse(); // plus récentes en premier
            res.json({
                enabled: true, locked: !!st.forum_locked, forum_id: st.forum_id,
                title: st.message || '', me: req.user.username, is_admin: !!admin, threads
            });
        } catch (e) {
            console.error('[MAGAPP] forum list:', e.message);
            res.status(500).json({ message: 'Erreur lecture forum' });
        }
    },

    post: async (req, res) => {
        try {
            const st = await getState();
            if (!st || !st.forum_enabled) return res.status(403).json({ message: 'Le forum est fermé' });
            if (st.forum_locked) return res.status(403).json({ message: 'Le forum est en lecture seule' });
            const body = clean(req.body?.body, MAX_BODY);
            if (!body) return res.status(400).json({ message: 'Message vide' });
            const username = req.user.username;
            if (rateLimited(username)) return res.status(429).json({ message: 'Trop de messages, patientez une minute' });

            let parentId = null;
            if (req.body?.parent_id) {
                const parent = await pgDb.get('SELECT id, forum_id, parent_id, hidden FROM magapp.forum_posts WHERE id = $1', [parseInt(req.body.parent_id, 10)]);
                if (!parent || parent.forum_id !== st.forum_id || parent.parent_id || parent.hidden) {
                    return res.status(400).json({ message: 'Question introuvable' });
                }
                parentId = parent.id;
            }
            const name = clean(req.body?.author_name, 80) || username;
            const r = await pool.query(
                `INSERT INTO magapp.forum_posts (forum_id, parent_id, author_username, author_name, is_staff, body)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [st.forum_id, parentId, username, name, !!isAdminLike(req.user), body]
            );
            res.json({ id: r.rows[0].id });
        } catch (e) {
            console.error('[MAGAPP] forum post:', e.message);
            res.status(500).json({ message: 'Erreur envoi message' });
        }
    },

    // Marque une question comme résolue (ou la rouvre) : son auteur ou un administrateur
    resolve: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const q = await pgDb.get('SELECT id, parent_id, author_username, resolved FROM magapp.forum_posts WHERE id = $1', [id]);
            if (!q || q.parent_id) return res.status(404).json({ message: 'Question introuvable' });
            if (q.author_username !== req.user.username && !isAdminLike(req.user)) return res.status(403).json({ message: 'Non autorisé' });
            await pgDb.run('UPDATE magapp.forum_posts SET resolved = $1 WHERE id = $2', [!q.resolved, id]);
            res.json({ resolved: !q.resolved });
        } catch (e) {
            res.status(500).json({ message: 'Erreur' });
        }
    },

    // Modération : masque / ré-affiche un message (soft-delete)
    toggleHidden: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const p = await pgDb.get('SELECT id, hidden FROM magapp.forum_posts WHERE id = $1', [id]);
            if (!p) return res.status(404).json({ message: 'Message introuvable' });
            await pgDb.run('UPDATE magapp.forum_posts SET hidden = $1 WHERE id = $2', [!p.hidden, id]);
            res.json({ hidden: !p.hidden });
        } catch (e) {
            res.status(500).json({ message: 'Erreur' });
        }
    },

    // Démarre un nouveau forum : l'ancien est archivé
    startNew: async (req, res) => {
        try {
            await pgDb.run('UPDATE magapp.news_banner SET forum_id = COALESCE(forum_id, 1) + 1, forum_locked = false WHERE id = 1');
            res.json({ message: 'Nouveau forum démarré' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur', error: e.message });
        }
    },

    // Nombre de questions du forum en cours (affiché sur le bandeau)
    count: async (forumId) => {
        const r = await pgDb.get('SELECT COUNT(*)::int AS n FROM magapp.forum_posts WHERE forum_id = $1 AND parent_id IS NULL AND hidden = false', [forumId]);
        return r ? r.n : 0;
    }
};
