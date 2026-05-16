const cron = require('node-cron');
const { pool } = require('../../shared/database');
const axios = require('axios');
const oracleSyncService = require('./oracle-sync.service');

const scheduledTasks = {};

async function getAutomationConfig() {
  try {
    const result = await pool.query('SELECT * FROM oracle_automation_config');
    return result.rows;
  } catch (err) {
    console.error('Error fetching automation config:', err);
    return [];
  }
}

async function executeSyncTask(syncType) {
  const startTime = new Date();
  console.log(`\n========== [Oracle Sync] Starting ${syncType} sync at ${startTime.toISOString()} ==========`);

  try {
    // Appeler l'endpoint /api/oracle/import-tables sans config
    // Le backend récupérera automatiquement la config de SQLite
    const axios = require('axios');
    const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

    console.log(`[Oracle Sync] Calling ${baseUrl}/api/oracle-automation/exec-sync/${syncType}`);

    const syncResult = await axios.post(
      `${baseUrl}/api/oracle-automation/exec-sync/${syncType}`,
      {},
      {
        headers: {
          'Content-Type': 'application/json'
        },
        validateStatus: () => true,
        timeout: 300000 // 5 minutes timeout
      }
    );

    console.log(`[Oracle Sync] Response status: ${syncResult.status}`);

    if (syncResult.status === 200 && syncResult.data.success !== false) {
      const reportCount = syncResult.data.report?.length || 0;
      const successCount = syncResult.data.report?.filter(r => r.status === 'SUCCESS').length || 0;
      let totalRecords = 0;
      syncResult.data.report?.forEach(r => {
        if (r.count) totalRecords += r.count;
      });

      // Log success
      await pool.query(
        `INSERT INTO oracle_sync_logs (sync_type, status, records_synced, duration_ms, completed_at, started_at)
         VALUES ($1, 'success', $2, $3, NOW(), $4)`,
        [syncType, totalRecords, Date.now() - startTime.getTime(), startTime]
      );

      console.log(`[Oracle Sync] ${syncType} sync completed successfully: ${successCount}/${reportCount} tables (${totalRecords} records)\n========================================\n`);

    } else {
      throw new Error(syncResult.data?.message || 'Erreur lors de la synchronisation');
    }

    // Update the next sync time
    const config = await pool.query('SELECT * FROM oracle_automation_config WHERE sync_type = $1', [syncType]);
    if (config.rows.length > 0) {
      const nextTime = calculateNextSyncTime(config.rows[0].frequency);
      await pool.query(
        'UPDATE oracle_automation_config SET last_sync_at = NOW(), next_sync_at = $1 WHERE sync_type = $2',
        [nextTime, syncType]
      );
      console.log(`[Oracle Sync] Updated next_sync_at for ${syncType}: ${nextTime.toISOString()}`);
    }
  } catch (err) {
    console.error(`[Oracle Sync] Error during ${syncType} sync:`, err);

    // Log the failure
    await pool.query(
      `INSERT INTO oracle_sync_logs (sync_type, status, error_message, duration_ms, completed_at, started_at)
       VALUES ($1, 'failed', $2, $3, NOW(), $4)`,
      [syncType, err.message, Date.now() - startTime.getTime(), startTime]
    );
  }
}

function calculateNextSyncTime(frequency) {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'every_10_minutes':
      next.setMinutes(next.getMinutes() + 10);
      break;
    case 'hourly':
      next.setHours(next.getHours() + 1);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      next.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      break;
  }

  return next;
}

function getCronExpression(frequency) {
  // Return cron expression for the given frequency
  // Format: minute hour day_of_month month day_of_week

  switch (frequency) {
    case 'every_10_minutes':
      return '*/10 * * * *'; // Every 10 minutes
    case 'hourly':
      return '0 * * * *'; // Every hour at minute 0
    case 'daily':
      return '0 2 * * *'; // Every day at 2:00 AM
    case 'weekly':
      return '0 2 * * 0'; // Every Sunday at 2:00 AM
    case 'monthly':
      return '0 2 1 * *'; // Every 1st of the month at 2:00 AM
    default:
      return '0 2 * * *'; // Default: daily
  }
}

async function scheduleTask(syncType, frequency, enabled) {
  // Cancel existing task if any
  if (scheduledTasks[syncType]) {
    scheduledTasks[syncType].stop();
    delete scheduledTasks[syncType];
    console.log(`[Oracle Scheduler] Stopped existing task for ${syncType}`);
  }

  if (!enabled) {
    console.log(`[Oracle Scheduler] Task for ${syncType} is disabled`);
    return;
  }

  const cronExpr = getCronExpression(frequency);

  try {
    const task = cron.schedule(cronExpr, () => {
      console.log(`[Oracle Scheduler] Triggering ${syncType} sync (cron: ${cronExpr})`);
      executeSyncTask(syncType);
    });

    scheduledTasks[syncType] = task;
    console.log(`[Oracle Scheduler] Scheduled ${syncType} with frequency: ${frequency} (cron: ${cronExpr})`);
  } catch (err) {
    console.error(`[Oracle Scheduler] Error scheduling task for ${syncType}:`, err);
  }
}

async function initializeScheduler() {
  console.log('[Oracle Scheduler] Initializing scheduler...');

  try {
    const configs = await getAutomationConfig();

    for (const config of configs) {
      // Initialize next_sync_at if not already set
      if (config.enabled && !config.next_sync_at) {
        const nextTime = calculateNextSyncTime(config.frequency);
        try {
          await pool.query(
            'UPDATE oracle_automation_config SET next_sync_at = $1 WHERE sync_type = $2',
            [nextTime, config.sync_type]
          );
          console.log(`[Oracle Scheduler] Initialized next_sync_at for ${config.sync_type}: ${nextTime.toISOString()}`);
        } catch (updateErr) {
          console.error(`[Oracle Scheduler] Error initializing next_sync_at for ${config.sync_type}:`, updateErr);
        }
      }

      await scheduleTask(config.sync_type, config.frequency, config.enabled);
    }

    console.log('[Oracle Scheduler] Scheduler initialized successfully');
  } catch (err) {
    console.error('[Oracle Scheduler] Error initializing scheduler:', err);
  }
}

async function updateSchedule(syncType, frequency, enabled) {
  await scheduleTask(syncType, frequency, enabled);

  // Update next_sync_at in the database
  try {
    const nextTime = enabled ? calculateNextSyncTime(frequency) : null;
    console.log(`[Oracle Scheduler] Updating ${syncType}: next_sync_at = ${nextTime?.toISOString()}`);
    await pool.query(
      'UPDATE oracle_automation_config SET next_sync_at = $1 WHERE sync_type = $2',
      [nextTime, syncType]
    );
  } catch (err) {
    console.error('[Oracle Scheduler] Error updating next_sync_at:', err);
  }
}

module.exports = {
  initializeScheduler,
  updateSchedule,
  executeSyncTask,
  getAutomationConfig
};
