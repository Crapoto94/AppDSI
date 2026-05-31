const express = require('express');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const controller = require('./auto-resolution.controller');

const router = express.Router();

router.get('/settings', authenticateJWT, controller.getSettings);
router.put('/settings', authenticateJWT, authenticateAdmin, controller.updateSettings);
router.post('/process', authenticateJWT, authenticateAdmin, controller.processTickets);
router.post('/test', authenticateJWT, authenticateAdmin, controller.testProcess);
router.get('/logs', authenticateJWT, authenticateAdmin, controller.getLogs);
router.get('/pending', authenticateJWT, authenticateAdmin, controller.getPendingTickets);
router.get('/keep-alive/:token', controller.getTicketInfoPublic);
router.post('/keep-alive/:token', controller.submitKeepAlive);

module.exports = router;
