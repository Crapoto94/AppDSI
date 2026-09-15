/**
 * Module Analyse-mail — relais serveur vers l'API externe du tableau de bord de
 * compromission de boîtes mail. La clé d'API reste côté serveur (jamais exposée
 * au navigateur) : le front appelle /api/analyse-mail/kpis en JWT.
 */
const analyseMail = require('../../shared/analyse_mail');

const ctrl = {
    // GET /api/analyse-mail/kpis
    async kpis(req, res) {
        try {
            const data = await analyseMail.getKpis();
            res.json(data);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },
};

module.exports = ctrl;
