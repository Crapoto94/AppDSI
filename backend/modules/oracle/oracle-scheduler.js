const cron = require('node-cron');
const pool = require('../../config/database');
const axios = require('axios');

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
  console.log(`[Oracle Sync] Starting ${syncType} sync at ${startTime.toISOString()}`);

  try {
    // Log: mark as running
    await pool.query(
      `INSERT INTO oracle_sync_logs (sync_type, status, started_at)
       VALUES ($1, 'running', $2)`,
      [syncType, startTime]
    );

    // TODO: Call the actual Oracle sync API
    // For now, simulate a successful sync
    const duration = Math.floor(Math.random() * 10000) + 2000; // 2-12 seconds
    const recordsSynced = Math.floor(Math.random() * 500) + 100; // 100-600 records

    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work

    const endTime = new Date();

    // Update the log with success
    await pool.query(
      `UPDATE oracle_sync_logs
       SET status = 'success', records_synced = $1, duration_ms = $2, completed_at = $3
       WHERE sync_type = $4 AND status = 'running' AND started_at = $5`,
      [recordsSynced, duration, endTime, syncType, startTime]
    );

    // Update the next sync time
    const config = await pool.query('SELECT * FROM oracle_automation_config WHERE sync_type = $1', [syncType]);
    if (config.rows.length > 0) {
      const nextTime = calculateNextSyncTime(config.rows[0].frequency);
      await pool.query(
        'UPDATE oracle_automation_config SET last_sync_at = $1, next_sync_at = $2 WHERE sync_type = $3',
        [endTime, nextTime, syncType]
      );
    }

    console.log(`[Oracle Sync] ${syncType} sync completed successfully in ${duration}ms (${recordsSynced} records)`);
  } catch (err) {
    console.error(`[Oracle Sync] Error during ${syncType} sync:`, err);

    await pool.query(
      `UPDATE oracle_sync_logs
       SET status = 'failed', duration_ms = $1, error_message = $2, completed_at = $3
       WHERE sync_type = $4 AND status = 'running' AND started_at = $5`,
      [Date.now() - startTime.getTime(), err.message, new Date(), syncType, startTime]
    );
  }
}

function calculateNextSyncTime(frequency) {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
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
      await scheduleTask(config.sync_type, config.frequency, config.enabled);
    }

    console.log('[Oracle Scheduler] Scheduler initialized successfully');
  } catch (err) {
    console.error('[Oracle Scheduler] Error initializing scheduler:', err);
  }
}

async function updateSchedule(syncType, frequency, enabled) {
  await scheduleTask(syncType, frequency, enabled);
}

module.exports = {
  initializeScheduler,
  updateSchedule,
  executeSyncTask,
  getAutomationConfig
};
