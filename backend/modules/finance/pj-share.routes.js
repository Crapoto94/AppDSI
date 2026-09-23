const express = require('express');
const router = express.Router();
const financeShareController = require('./finance-share.controller');
const { authenticateAdmin } = require('../../shared/middleware');

// Partage de fichiers Sedit Finances (pièces jointes eGF/pjust) — voir skill "sedit-finances"
router.get('/settings', authenticateAdmin, financeShareController.getShareSettings);
router.post('/settings', authenticateAdmin, financeShareController.saveShareSettings);
router.get('/test-file', authenticateAdmin, financeShareController.testDisplayFile);

module.exports = router;
