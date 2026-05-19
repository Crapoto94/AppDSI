const express = require('express');
const router = express.Router();
const controller = require('./email-automation.controller');
const { authenticateAdmin } = require('../../shared/middleware');

router.get('/', authenticateAdmin, controller.getAutomations);
router.get('/:id', authenticateAdmin, controller.getAutomation);
router.post('/', authenticateAdmin, controller.createAutomation);
router.put('/:id', authenticateAdmin, controller.updateAutomation);
router.delete('/:id', authenticateAdmin, controller.deleteAutomation);

router.post('/:id/recipients', authenticateAdmin, controller.addRecipient);
router.delete('/:id/recipients/:recipientId', authenticateAdmin, controller.removeRecipient);

router.post('/search-ad', authenticateAdmin, controller.searchAD);

router.post('/:id/execute', authenticateAdmin, controller.executeAutomation);

router.get('/:id/logs', authenticateAdmin, controller.getLogs);

module.exports = router;
