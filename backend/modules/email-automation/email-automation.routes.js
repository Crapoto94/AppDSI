const express = require('express');
const router = express.Router();
const controller = require('./email-automation.controller');
const { authenticateAdmin } = require('../../shared/middleware');

// ─── routes fixes (AVANT /:id pour éviter les conflits) ─────────────────────
router.get('/task-alerts',              authenticateAdmin, controller.getTaskAlertUsers);
router.delete('/task-alerts/:username', authenticateAdmin, controller.disableTaskAlert);
router.get('/mail-logs',                authenticateAdmin, controller.getAllMailLogs);
router.post('/search-ad',               authenticateAdmin, controller.searchAD);

// ─── CRUD automations ────────────────────────────────────────────────────────
router.get('/',    authenticateAdmin, controller.getAutomations);
router.post('/',   authenticateAdmin, controller.createAutomation);
router.get('/:id', authenticateAdmin, controller.getAutomation);
router.put('/:id', authenticateAdmin, controller.updateAutomation);
router.delete('/:id', authenticateAdmin, controller.deleteAutomation);

router.post('/:id/recipients',              authenticateAdmin, controller.addRecipient);
router.delete('/:id/recipients/:recipientId', authenticateAdmin, controller.removeRecipient);

router.post('/:id/execute', authenticateAdmin, controller.executeAutomation);
router.get('/:id/logs',     authenticateAdmin, controller.getLogs);

module.exports = router;
