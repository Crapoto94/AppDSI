const express = require('express');
const router = express.Router();
const oracleController = require('../modules/oracle/oracle-automation.controller');
const { authenticateAdmin } = require('../shared/middleware');

// Importer le module d'exécution de synchro (sera utilisé par exec-sync)
let db, pool, getOracleConnection;

// Initialiser les dépendances (appelé de server.js)
router.setDependencies = function(dbInstance, poolInstance, getOracleConnectionFunc) {
  db = dbInstance;
  pool = poolInstance;
  getOracleConnection = getOracleConnectionFunc;
};

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

// Execute sync internally (called by testSync and scheduler)
router.post('/exec-sync/:syncType', async (req, res) => {
  const { syncType } = req.params;

  if (!syncType || !['RH', 'FINANCES'].includes(syncType)) {
    return res.status(400).json({ error: 'Invalid sync type' });
  }

  try {
    const { executeOracleImport } = require('../modules/oracle/oracle-import-executor');
    const result = await executeOracleImport(syncType, db, pool, getOracleConnection);
    res.json(result);
  } catch (err) {
    console.error(`[exec-sync] Error:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
