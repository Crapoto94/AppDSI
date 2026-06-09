const express = require('express');
const router = express.Router();
const mailCollectorController = require('./mail_collector.controller');
const mailRulesController = require('./mail_rules.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');

// Routes de base
router.get('/test-config', authenticateJWT, mailCollectorController.testConfig);

// Mail Rules routes (utiliser /rules avant /:id pour éviter conflits)
router.get('/rules', authenticateJWT, mailRulesController.getAll);
router.post('/rules', authenticateAdmin, mailRulesController.create);
router.post('/rules/init-defaults', authenticateAdmin, mailRulesController.initializeDefaults);
router.post('/rules/recreate', authenticateAdmin, mailRulesController.recreateDefaults);
router.post('/rules/test-classification', authenticateJWT, mailRulesController.testClassification);
router.put('/rules/toggle-all', authenticateAdmin, mailRulesController.toggleAll);
router.get('/rules/:id', authenticateJWT, mailRulesController.getById);
router.put('/rules/:id', authenticateAdmin, mailRulesController.update);
router.delete('/rules/:id', authenticateAdmin, mailRulesController.delete);

// Mail Collectors - routes publiques (authentifiées)
router.get('/', authenticateJWT, mailCollectorController.getAll);
router.get('/stats', authenticateJWT, mailCollectorController.getStats);
router.post('/purge-invalid-tickets', authenticateAdmin, mailCollectorController.purgeInvalidTickets);

// Mail Collectors - admin only
router.post('/', authenticateAdmin, mailCollectorController.create);
router.put('/:id', authenticateAdmin, mailCollectorController.update);
router.delete('/:id', authenticateAdmin, mailCollectorController.delete);

// Mail Collectors - by ID routes
router.get('/:id', authenticateJWT, mailCollectorController.getById);
router.post('/:id/run', authenticateJWT, mailCollectorController.runNow);
router.get('/:id/logs', authenticateJWT, mailCollectorController.getLogs);
router.delete('/:id/logs', authenticateAdmin, mailCollectorController.clearLogs);

module.exports = router;
