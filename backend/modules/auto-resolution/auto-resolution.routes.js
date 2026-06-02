const express = require('express');
const { authenticateJWT } = require('../../shared/middleware');
const { authenticateTicketAdmin } = require('../tickets/middleware/ticket-permissions');
const controller = require('./auto-resolution.controller');

const router = express.Router();

router.get('/settings', authenticateJWT, controller.getSettings);
router.put('/settings', authenticateTicketAdmin, controller.updateSettings);
router.post('/process', authenticateTicketAdmin, controller.processTickets);
router.post('/test', authenticateTicketAdmin, controller.testProcess);
router.get('/logs', authenticateTicketAdmin, controller.getLogs);
router.get('/pending', authenticateTicketAdmin, controller.getPendingTickets);
router.get('/keep-alive/:token', controller.getTicketInfoPublic);
router.post('/keep-alive/:token', controller.submitKeepAlive);

module.exports = router;
