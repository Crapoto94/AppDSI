const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./auto-actions.controller');

router.get('/settings',      authenticateJWT, ctrl.getSettings);
router.post('/settings',     authenticateJWT, ctrl.saveSettings);
router.get('/beneficiaires', authenticateJWT, ctrl.getBeneficiaires);
router.post('/password-sms', authenticateJWT, ctrl.sendPasswordSms);

module.exports = router;
