const express = require('express');
const router = express.Router();
const oracleController = require('../modules/oracle/oracle-automation.controller');
const { authenticateAdmin } = require('../shared/middleware');

// Get automation configuration
router.get('/config', authenticateAdmin, oracleController.getAutomationConfig);

// Update automation configuration
router.put('/config', authenticateAdmin, oracleController.updateAutomationConfig);

// Get sync logs
router.get('/logs', authenticateAdmin, oracleController.getSyncLogs);

// Record sync log (internal use)
router.post('/logs', oracleController.recordSyncLog);

// Test sync for a specific type
router.post('/test/:syncType', authenticateAdmin, oracleController.testSync);

module.exports = router;
