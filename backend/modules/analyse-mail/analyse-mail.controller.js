/**
 * Module Analyse-mail — relais serveur vers l'API externe du tableau de bord de
 * compromission de boîtes mail. La clé d'API reste côté serveur (jamais exposée
 * au navigateur) : le front appelle /api/analyse-mail/kpis en JWT.
 */
const analyseMail = require('../../shared/analyse_mail');

const ctrl = {
    // GET /api/analyse-mail/kpis?minutes=60
    // minutes : fenêtre glissante des connexions (1, 10, 60, 240, 480, 1440, 2880, 10080).
    async kpis(req, res) {
        try {
            const data = await analyseMail.getKpis({ minutes: req.query.minutes });
            res.json(data);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    // GET /api/analyse-mail/signins/failed?minutes=60&limit=50
    // Dernières connexions en échec du tenant (utilisateur, IP, motif...).
    async failedSignins(req, res) {
        try {
            const data = await analyseMail.getFailedSignins({
                minutes: req.query.minutes,
                limit: req.query.limit,
            });
            res.json(data);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    // POST /api/analyse-mail/scan  { email, days }
    // Scan à la demande d'une boîte mail (actions rapides) : déclenche l'analyse
    // éphémère côté Analyse-mail et renvoie le score de risque + les signaux détectés.
    async scan(req, res) {
        try {
            const { email, days } = req.body || {};
            if (!email || !String(email).includes('@')) {
                return res.status(400).json({ message: 'Adresse email invalide' });
            }
            const data = await analyseMail.scanMailbox({ email, days });
            res.json(data);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },
};

module.exports = ctrl;
