const cron = require('node-cron');
const { pgDb } = require('../../shared/database');
const MailCollectorService = require('./mail_collector.service');

class MailScheduler {
  static tasks = {};

  static frequencyToCron(frequency) {
    switch (frequency) {
      case 'every_minute':  return '* * * * *';
      case 'every_5_min':   return '*/5 * * * *';
      case 'every_15_min':  return '*/15 * * * *';
      case 'hourly':        return '0 * * * *';
      case '4_hours':       return '0 */4 * * *';
      case 'daily':         return '0 2 * * *';
      case 'manual':        return null;
      default:              return '0 * * * *';
    }
  }

  static async runCollector(collector) {
    const module = collector.module || 'tickets';
    if (module === 'copieurs') {
      const { importEmailsService } = require('../copieurs/copieurs_mail.service');
      return await importEmailsService(collector.mailbox, collector.domain_filter);
    }
    return await MailCollectorService.performCollection(collector.id);
  }

  static async initSchedules() {
    try {
      const collectors = await pgDb.all(
        'SELECT * FROM hub_tickets.mail_collectors WHERE is_enabled = true'
      );

      for (const collector of collectors) {
        const cronExpr = this.frequencyToCron(collector.frequency);
        if (!cronExpr) continue;
        this.scheduleCollector(collector, cronExpr);
      }

      console.log(`✅ Mail Scheduler: ${collectors.length} collecteurs initialisés`);
    } catch (error) {
      console.error('❌ Erreur initialisation Mail Scheduler:', error.message);
    }
  }

  static scheduleCollector(collector, cronExpr) {
    const collectorId = typeof collector === 'object' ? collector.id : collector;
    if (this.tasks[collectorId]) {
      this.tasks[collectorId].stop();
    }

    this.tasks[collectorId] = cron.schedule(cronExpr, async () => {
      try {
        const col = typeof collector === 'object' ? collector : await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
        if (!col || !col.is_enabled) return;
        console.log(`[MailScheduler] Collecte démarrée: collecteur ${collectorId}`);
        const log = await this.runCollector(col);
        if (log) console.log(`[MailScheduler] Collecte terminée: ${log.emails_imported}/${log.emails_received} importés`);
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
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
      this.scheduleCollector(collector, cronExpr);
    } else {
      this.stopCollector(collectorId);
    }
  }

  static async onCollectorCreated(collectorId, frequency) {
    const cronExpr = this.frequencyToCron(frequency);
    if (cronExpr) {
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
      this.scheduleCollector(collector, cronExpr);
    }
  }

  static async onCollectorDeleted(collectorId) {
    this.stopCollector(collectorId);
  }

  static async onCollectorEnabledChanged(collectorId, isEnabled) {
    if (isEnabled) {
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
      const cronExpr = this.frequencyToCron(collector.frequency);
      if (cronExpr) this.scheduleCollector(collector, cronExpr);
    } else {
      this.stopCollector(collectorId);
    }
  }
}

module.exports = MailScheduler;
