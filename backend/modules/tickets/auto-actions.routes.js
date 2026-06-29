const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./auto-actions.controller');

router.get('/settings',           authenticateJWT, ctrl.getSettings);
router.post('/settings',          authenticateJWT, ctrl.saveSettings);
router.get('/beneficiaires',      authenticateJWT, ctrl.getBeneficiaires);
router.post('/password-sms',      authenticateJWT, ctrl.sendPasswordSms);
router.get('/ad-search',          authenticateJWT, ctrl.searchAdUsers);
router.get('/ad-user-status',     authenticateJWT, ctrl.getAdUserStatus);
router.post('/ad-user-toggle',           authenticateJWT, ctrl.toggleAdUser);
router.post('/ad-user-unlock',           authenticateJWT, ctrl.unlockAdUser);
router.post('/ad-user-force-pwd-change', authenticateJWT, ctrl.forceAdPwdChange);

module.exports = router;
