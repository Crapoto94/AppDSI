const express = require('express');
const router = express.Router();
const controller = require('./commande-envoi.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');

// Routes spécifiques avant les routes paramétrées.
router.get('/settings', authenticateJWT, controller.getSettings);
router.put('/settings', authenticateAdminOrFinances, controller.saveSettings);

router.post('/statuses', authenticateJWT, controller.statuses);
router.post('/recipients', authenticateJWT, controller.recipients);

router.get('/:roo/prepare', authenticateJWT, controller.prepare);
router.post('/:roo/send', authenticateJWT, controller.send);

module.exports = router;
