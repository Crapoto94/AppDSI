const express = require('express');
const router = express.Router();
const ctrl = require('./parc.controller');
const { authenticateJWT, authenticateGLPIControl } = require('../../shared/middleware');

// Synchronisation depuis GLPI 10 (réservée au contrôle GLPI/admin)
router.post('/sync', authenticateGLPIControl, ctrl.syncParc);
router.get('/sync-progress', authenticateGLPIControl, ctrl.getParcSyncProgress);

// Consultation
router.get('/stats', authenticateJWT, ctrl.getStats);
router.get('/:type', authenticateJWT, ctrl.getItems);

module.exports = router;
