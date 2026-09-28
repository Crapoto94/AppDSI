const express = require('express');
const router = express.Router();
const { authenticateFastControl } = require('../../shared/middleware');
const ctrl = require('./auto-actions.controller');

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

module.exports = router;
