const express = require('express');
const router = express.Router();
const { authenticateFastControl } = require('../../shared/middleware');
const ctrl = require('./auto-actions.controller');
const { pgDb } = require('../../shared/database');
const studioIrs = require('../../shared/studio_irs');

router.use(authenticateFastControl);

router.get('/settings',           ctrl.getSettings);
router.post('/settings',          ctrl.saveSettings);
router.get('/beneficiaires',      ctrl.getBeneficiaires);
router.post('/password-sms',      ctrl.sendPasswordSms);
router.get('/ad-search',          ctrl.searchAdUsers);
router.get('/ad-user-status',     ctrl.getAdUserStatus);
router.post('/ad-user-toggle',           ctrl.toggleAdUser);
router.post('/ad-user-unlock',           ctrl.unlockAdUser);
router.post('/ad-user-force-pwd-change', ctrl.forceAdPwdChange);
router.post('/trigger-sync',             ctrl.triggerSync);
router.post('/password-change-ticket',   ctrl.changePasswordTicket);

// Postes Studio IRS pour la prise en main à distance (la session elle-même se fait dans Studio IRS).
router.get('/studio-irs/postes', async (req, res) => {
    try {
        const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['studio_irs']);
        if (!cfg || cfg.enabled === false) return res.status(503).json({ message: 'Studio IRS n’est pas activé (Admin → API externes)' });
        res.json(await studioIrs.listDesktops(cfg));
    } catch (e) {
        console.error('[STUDIO IRS] postes :', e.message);
        res.status(502).json({ message: 'Studio IRS ne répond pas ou refuse la clé' });
    }
});

module.exports = router;
