const cron = require('node-cron');
const { pgDb } = require('../../shared/database');
const MailCollectorService = require('./mail_collector.service');

class MailScheduler {
  static tasks = {};

  static frequencyToCron(frequency) {
    switch (frequency) {
      case 'every_15_min': return '*/15 * * * *';
      case 'hourly': return '0 * * * *';
      case '4_hours': return '0 */4 * * *';
      case 'daily': return '0 2 * * *';
      case 'manual': return null;
      default: return '0 * * * *';
    }
  }

  static async initSchedules() {
    try {
      const collectors = await pgDb.all(
        'SELECT * FROM hub_tickets.mail_collectors WHERE is_enabled = true'
      );

      for (const collector of collectors) {
        const cronExpr = this.frequencyToCron(collector.frequency);
        if (!cronExpr) continue;

        this.scheduleCollector(collector.id, cronExpr);
      }

      console.log(`✅ Mail Scheduler: ${collectors.length} collecteurs initialisés`);
    } catch (error) {
      console.error('❌ Erreur initialisation Mail Scheduler:', error.message);
    }
  }

  static scheduleCollector(collectorId, cronExpr) {
    if (this.tasks[collectorId]) {
      this.tasks[collectorId].stop();
    }

    this.tasks[collectorId] = cron.schedule(cronExpr, async () => {
      try {
        console.log(`[MailScheduler] Collecte démarrée: collecteur ${collectorId}`);
        const log = await MailCollectorService.performCollection(collectorId);
        console.log(`[MailScheduler] Collecte terminée: ${log.emails_imported}/${log.emails_received} importés`);
      } catch (error) {
        console.error(`[MailScheduler] Erreur collecte ${collectorId}:`, error.message);
      }
    });

    console.log(`Cron scheduled for collector ${collectorId}: ${cronExpr}`);
  }

  static stopCollector(collectorId) {
    if (this.tasks[collectorId]) {
      this.tasks[collectorId].stop();
      delete this.tasks[collectorId];
    }
  }

  static async updateCollectorSchedule(collectorId, newFrequency) {
    const cronExpr = this.frequencyToCron(newFrequency);
    if (cronExpr) {
      this.scheduleCollector(collectorId, cronExpr);
    } else {
      this.stopCollector(collectorId);
    }
  }

  static async onCollectorCreated(collectorId, frequency) {
    const cronExpr = this.frequencyToCron(frequency);
    if (cronExpr) {
      this.scheduleCollector(collectorId, cronExpr);
    }
  }

  static async onCollectorDeleted(collectorId) {
    this.stopCollector(collectorId);
  }

  static async onCollectorEnabledChanged(collectorId, isEnabled) {
    if (isEnabled) {
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
      const cronExpr = this.frequencyToCron(collector.frequency);
      if (cronExpr) {
        this.scheduleCollector(collectorId, cronExpr);
      }
    } else {
      this.stopCollector(collectorId);
    }
  }
}

module.exports = MailScheduler;
