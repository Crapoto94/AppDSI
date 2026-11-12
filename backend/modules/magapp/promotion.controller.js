const { pgDb } = require('../../shared/database');

/** Application mise en avant dans le magasin (bannière en tête). Configurée dans /admin/magapp > Paramètres. */

const toPublic = (r, admin) => {
    if (!r) return { enabled: false };
    const until = r.until_date ? String(r.until_date).slice(0, 10) : '';
    const expired = !!until && new Date().toISOString().slice(0, 10) > until;
    const out = {
        enabled: !!r.enabled && !expired,
        url: r.url || '',
        badge: r.badge || '',
        title: r.title || '',
        text: r.text || '',
        cta: r.cta || 'Découvrir',
        until,
        logo_url: r.logo_mime ? `/api/magapp/promotion/logo?v=${r.logo_version || 0}` : ''
    };
    if (admin) out.enabled = !!r.enabled; // l'admin voit la valeur brute (même expirée)
    return out;
};

module.exports = {
    get: async (req, res) => {
        try {
            const r = await pgDb.get('SELECT id, enabled, url, badge, title, text, cta, until_date::text AS until_date, logo_mime, logo_version FROM magapp.promotion WHERE id = 1');
            res.json(toPublic(r, req.query.admin === 'true'));
        } catch (e) {
            console.error('[MAGAPP] promotion get:', e.message);
            res.json({ enabled: false });
        }
    },

    logo: async (req, res) => {
        try {
            const r = await pgDb.get('SELECT logo_b64, logo_mime FROM magapp.promotion WHERE id = 1');
            if (!r || !r.logo_b64) return res.status(404).end();
            res.set('Content-Type', r.logo_mime || 'image/png');
            res.set('Cache-Control', 'public, max-age=86400');
            res.send(Buffer.from(r.logo_b64, 'base64'));
        } catch (e) {
            res.status(500).end();
        }
    },

    save: async (req, res) => {
        try {
            const b = req.body || {};
            const until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.until || '')) ? b.until : null;
            await pgDb.run(
                'UPDATE magapp.promotion SET enabled = ?, url = ?, badge = ?, title = ?, text = ?, cta = ?, until_date = ? WHERE id = 1',
                [b.enabled === true || b.enabled === 'true', String(b.url || '').trim(), String(b.badge || '').trim(), String(b.title || '').trim(), String(b.text || '').trim(), String(b.cta || '').trim() || 'Découvrir', until]
            );
            if (req.file) {
                if (!/^image\//.test(req.file.mimetype)) return res.status(400).json({ message: 'Le logo doit être une image' });
                await pgDb.run(
                    'UPDATE magapp.promotion SET logo_b64 = ?, logo_mime = ?, logo_version = ? WHERE id = 1',
                    [req.file.buffer.toString('base64'), req.file.mimetype, Date.now()]
                );
            } else if (b.remove_logo === 'true') {
                await pgDb.run('UPDATE magapp.promotion SET logo_b64 = NULL, logo_mime = NULL, logo_version = ? WHERE id = 1', [Date.now()]);
            }
            res.json({ message: 'Promotion enregistrée' });
        } catch (e) {
            console.error('[MAGAPP] promotion save:', e.message);
            res.status(500).json({ message: 'Erreur enregistrement promotion', error: e.message });
        }
    }
};
