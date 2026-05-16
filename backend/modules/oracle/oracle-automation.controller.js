const { pool } = require('../../shared/database');
const { PORT } = require('../../shared/config');
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
    // Calculate next_sync_at immediately based on new frequency
    let nextSyncAt = null;
    if (enabled) {
      const now = new Date();
      const next = new Date(now);

      switch (frequency) {
        case 'every_10_minutes':
          // Add 10 minutes + 30 seconds to ensure it's not immediately in the past
          next.setMinutes(next.getMinutes() + 10);
          next.setSeconds(next.getSeconds() + 30);
          break;
        case 'hourly':
          next.setHours(next.getHours() + 1);
          break;
        case 'daily':
          next.setDate(next.getDate() + 1);
          next.setHours(2, 0, 0, 0);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          next.setHours(2, 0, 0, 0);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          next.setDate(1);
          next.setHours(2, 0, 0, 0);
          break;
      }
      nextSyncAt = next;
    }

    const result = await pool.query(
      'UPDATE oracle_automation_config SET enabled = $1, frequency = $2, next_sync_at = $3, updated_at = NOW() WHERE sync_type = $4 RETURNING *',
      [enabled, frequency, nextSyncAt, sync_type]
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

    console.log(`[Oracle Config] Updated ${sync_type}: enabled=${enabled}, frequency=${frequency}, next_sync_at=${nextSyncAt?.toISOString()}`);

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

  try {
    console.log(`[Oracle Test Sync] Starting test for ${syncType} at ${new Date().toISOString()}`);

    // Récupérer la config depuis SQLite pour vérifier qu'elle existe
    const http = require('http');

    console.log(`[Oracle Test Sync] Retrieving config for ${syncType} from SQLite`);

    // Lancer la synchro en tâche de fond avec un petit délai
    setTimeout(() => {
      console.log(`[Oracle Test Sync] Launching background sync at ${new Date().toISOString()}`);

      // Créer une requête HTTP interne vers le nouvel endpoint
      const data = JSON.stringify({});
      const options = {
        hostname: 'localhost',
        port: PORT,
        path: `/api/oracle-automation/exec-sync/${syncType}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'Authorization': req.headers.authorization || 'Bearer internal'
        }
      };

      const httpReq = http.request(options, (httpRes) => {
        let body = '';
        httpRes.on('data', chunk => body += chunk);
        httpRes.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (httpRes.statusCode === 200) {
              const reportCount = result.report?.length || 0;
              const successCount = result.report?.filter(r => r.status === 'SUCCESS').length || 0;
              console.log(`[Oracle Test Sync] Success: ${successCount}/${reportCount} tables synced`);
            } else {
              console.error(`[Oracle Test Sync] Failed:`, result.message);
            }
          } catch (e) {
            console.error(`[Oracle Test Sync] Parse error:`, e.message);
          }
        });
      });

      httpReq.on('error', (err) => {
        console.error(`[Oracle Test Sync] Request error:`, err.code, err.message, err.toString());
      });

      httpReq.write(data);
      httpReq.end();
    }, 100);

    // Répondre immédiatement au client
    res.json({
      success: true,
      message: `Synchronisation lancée pour ${syncType}. Vérifiez les logs du serveur pour les détails.`
    });

  } catch (err) {
    console.error(`[Oracle Test Sync] Error during ${syncType} test:`, err);
    res.status(400).json({
      success: false,
      error: err.message || `Test de synchronisation ${syncType} échoué`
    });
  }
};
