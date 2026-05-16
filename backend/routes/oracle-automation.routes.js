const express = require('express');
const router = express.Router();
const oracleController = require('../modules/oracle/oracle-automation.controller');
const { verifyToken } = require('../middleware/auth');

// Get automation configuration
router.get('/config', verifyToken, oracleController.getAutomationConfig);

// Update automation configuration
router.put('/config', verifyToken, oracleController.updateAutomationConfig);

// Get sync logs
router.get('/logs', verifyToken, oracleController.getSyncLogs);

// Record sync log (internal use)
router.post('/logs', oracleController.recordSyncLog);

module.exports = router;
