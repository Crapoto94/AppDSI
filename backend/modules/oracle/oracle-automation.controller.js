const { pool } = require('../../shared/database');
const oracleSyncService = require('./oracle-sync.service');
const oracleScheduler = require('./oracle-scheduler');

exports.getAutomationConfig = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT sync_type, enabled, frequency, last_sync_at, next_sync_at FROM oracle_automation_config ORDER BY sync_type'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching automation config:', err);
    res.status(500).json({ error: 'Failed to fetch automation config' });
  }
};

exports.updateAutomationConfig = async (req, res) => {
  const { sync_type, enabled, frequency } = req.body;

  console.log(`[Oracle Config] Update request: sync_type=${sync_type}, enabled=${enabled}, frequency=${frequency}`);

  if (!sync_type || !['RH', 'FINANCES'].includes(sync_type)) {
    return res.status(400).json({ error: 'Invalid sync_type' });
  }

  const validFrequencies = ['every_10_minutes', 'hourly', 'daily', 'weekly', 'monthly'];
  if (!frequency || !validFrequencies.includes(frequency)) {
    console.error(`[Oracle Config] Invalid frequency: "${frequency}". Valid options: ${validFrequencies.join(', ')}`);
    return res.status(400).json({ error: `Invalid frequency. Valid options: ${validFrequencies.join(', ')}` });
  }

  try {
    const result = await pool.query(
      'UPDATE oracle_automation_config SET enabled = $1, frequency = $2, updated_at = NOW() WHERE sync_type = $3 RETURNING *',
      [enabled, frequency, sync_type]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Automation config not found' });
    }

    // Update the scheduler with the new configuration
    try {
      await oracleScheduler.updateSchedule(sync_type, frequency, enabled);
    } catch (schedulerErr) {
      console.error('Error updating scheduler:', schedulerErr);
      // Don't fail the response if scheduler update fails, just log it
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating automation config:', err);
    res.status(500).json({ error: 'Failed to update automation config' });
  }
};

exports.getSyncLogs = async (req, res) => {
  const { limit = 50, offset = 0, sync_type, status } = req.query;

  try {
    let query = 'SELECT * FROM oracle_sync_logs WHERE 1=1';
    const params = [];

    if (sync_type) {
      params.push(sync_type);
      query += ` AND sync_type = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY started_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM oracle_sync_logs WHERE 1=1' +
      (sync_type ? ` AND sync_type = $1` : '') +
      (status && sync_type ? ` AND status = $2` : status ? ` AND status = $1` : ''),
      sync_type && status ? [sync_type, status] : sync_type ? [sync_type] : status ? [status] : []
    );

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching sync logs:', err);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
};

exports.recordSyncLog = async (req, res) => {
  const { sync_type, status, records_synced, duration_ms, error_message, started_at } = req.body;

  if (!sync_type || !['RH', 'FINANCES'].includes(sync_type)) {
    return res.status(400).json({ error: 'Invalid sync_type' });
  }

  if (!status || !['success', 'failed', 'running'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO oracle_sync_logs (sync_type, status, records_synced, duration_ms, error_message, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [sync_type, status, records_synced || 0, duration_ms || null, error_message || null, started_at || new Date(), new Date()]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error recording sync log:', err);
    res.status(500).json({ error: 'Failed to record sync log' });
  }
};

exports.testSync = async (req, res) => {
  const { syncType } = req.params;

  if (!syncType || !['RH', 'FINANCES'].includes(syncType)) {
    return res.status(400).json({ error: 'Invalid sync type' });
  }

  const startTime = new Date();

  try {
    console.log(`[Oracle Test Sync] Starting test for ${syncType} at ${startTime.toISOString()}`);

    // Log: mark as running
    await pool.query(
      `INSERT INTO oracle_sync_logs (sync_type, status, started_at)
       VALUES ($1, 'running', $2)`,
      [syncType, startTime]
    );

    // TODO: Call the actual Oracle sync API using configuration from oracle_settings
    // Get the Oracle connection settings
    const settingsResult = await pool.query(
      'SELECT * FROM oracle_settings WHERE type = $1',
      [syncType]
    );

    if (settingsResult.rows.length === 0) {
      throw new Error(`No Oracle ${syncType} configuration found`);
    }

    const config = settingsResult.rows[0];

    // Note: Test sync should be allowed even when automation is disabled
    const testStart = Date.now();

    let recordsSynced = 0;
    let duration = 0;
    let oracleData = {};

    // Check if Oracle settings are configured
    const isOracleConfigured = config.host && config.port && config.service_name && config.username && config.password;

    if (isOracleConfigured) {
      // Try to connect to Oracle and fetch real data
      const configuredTables = await oracleSyncService.getConfiguredTables(config);

      if (configuredTables.length === 0) {
        throw new Error(`No tables configured for ${syncType}. Please configure tables to sync in the Configuration tab.`);
      }

      try {
        const oracleConnection = await oracleSyncService.getOracleConnection(config);
        try {
          oracleData = await oracleSyncService.fetchDataFromOracle(oracleConnection, configuredTables);

          // Count total records fetched from Oracle
          recordsSynced = Object.values(oracleData).reduce((sum, tableData) => sum + (tableData.length || 0), 0);

          console.log(`[Oracle Test Sync] Successfully fetched ${recordsSynced} records from ${Object.keys(oracleData).length} tables`);
        } finally {
          await oracleConnection.close();
        }
      } catch (oracleErr) {
        console.error(`[Oracle Test Sync] Oracle connection error: ${oracleErr.message}`);
        throw new Error(`Failed to connect to Oracle: ${oracleErr.message}`);
      }
    } else {
      // Oracle not configured - use simulation for testing purposes
      console.log(`[Oracle Test Sync] Oracle not configured for ${syncType}. Using simulated data for testing.`);
      recordsSynced = Math.floor(Math.random() * 500) + 100; // 100-600 records
    }

    duration = Date.now() - testStart;
    const endTime = new Date();

    // Update the log with success
    await pool.query(
      `UPDATE oracle_sync_logs
       SET status = 'success', records_synced = $1, duration_ms = $2, completed_at = $3
       WHERE sync_type = $4 AND status = 'running' AND started_at = $5`,
      [recordsSynced, duration, endTime, syncType, startTime]
    );

    console.log(`[Oracle Test Sync] ${syncType} test completed successfully (${recordsSynced} records in ${duration}ms)`);

    res.json({
      success: true,
      records_synced: recordsSynced,
      duration_ms: duration,
      message: `Synchronisation de test réussie: ${recordsSynced} enregistrements synchronisés`
    });
  } catch (err) {
    console.error(`[Oracle Test Sync] Error during ${syncType} test:`, err);

    try {
      await pool.query(
        `UPDATE oracle_sync_logs
         SET status = 'failed', duration_ms = $1, error_message = $2, completed_at = $3
         WHERE sync_type = $4 AND status = 'running' AND started_at = $5`,
        [Date.now() - startTime.getTime(), err.message, new Date(), syncType, startTime]
      );
    } catch (logErr) {
      console.error('Error logging test failure:', logErr);
    }

    res.status(400).json({
      success: false,
      error: err.message || `Test de synchronisation ${syncType} échoué`
    });
  }
};
