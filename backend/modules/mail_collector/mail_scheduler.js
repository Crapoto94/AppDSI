const cron = require('node-cron');
const { pgDb, getSqlite } = require('../../shared/database');
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
    return await MailCollectorService.performCollection(collector.id);
  }
  static async initSchedules() {
    try {
      const sqlite = getSqlite();
      console.log(`[MAIL-DEBUG] initSchedules called.`);
      
      // Ensure table exists
      await sqlite.run('CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY, value TEXT)');

      const collectors = await pgDb.all('SELECT * FROM hub_tickets.mail_collectors');
      console.log(`[MailScheduler] Initialisation de ${collectors.length} collecteurs...`);

      for (const collector of collectors) {
        console.log(`[MAIL-DEBUG] Traitement du collecteur ID: ${collector.id}`);
        // VÃ©rification de l'activation LOCALE (SQLite) - EXCLUSIVE
        const localSetting = await sqlite.get('SELECT value FROM local_settings WHERE key = ?', [`mail_collector_${collector.id}_enabled`]);
        console.log(`[MAIL-DEBUG] localSetting pour ${collector.id}:`, localSetting);

        // Si le réglage n'existe pas encore, on initialise par défaut à 'true' (donc enabled)
        // dans SQLite pour éviter qu'ils soient tous désactivés lors de la migration.
        if (!localSetting) {
            console.log(`[MAIL-DEBUG] Pas de réglage local pour ${collector.id}, création par défaut.`);
            await sqlite.run('INSERT INTO local_settings (key, value) VALUES (?, ?)', [`mail_collector_${collector.id}_enabled`, 'true']);
        }

        const isEnabledLocally = localSetting ? localSetting.value === 'true' : true;

        console.log(`[MailScheduler] Collecteur ${collector.id} (${collector.name}): enabled=${isEnabledLocally}, freq=${collector.frequency}`);

        if (!isEnabledLocally) {
          console.log(`[MailScheduler] Collecteur ${collector.id} (${collector.name}) ignorÃ© (dÃ©sactivÃ© localement)`);
          continue;
        }

        const cronExpr = this.frequencyToCron(collector.frequency);
        if (!cronExpr) {
           console.log(`[MailScheduler] Collecteur ${collector.id} (${collector.name}) ignorÃ© (pas de cron valide)`);
           continue;
        }

        this.scheduleCollector(collector, cronExpr, sqlite);
      }

      console.log(`✅ Mail Scheduler: ${Object.keys(this.tasks).length} collecteurs initialisÃ©s`);
    } catch (error) {
      console.error('❌ Erreur initialisation Mail Scheduler:', error.message);
    }
  }

  static scheduleCollector(collector, cronExpr, sqlite) {
    const collectorId = typeof collector === 'object' ? collector.id : collector;
    if (this.tasks[collectorId]) {
      this.tasks[collectorId].stop();
    }

    this.tasks[collectorId] = cron.schedule(cronExpr, async () => {
      try {
        const col = typeof collector === 'object' ? collector : await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
        if (!col) return;

        // VÃ©rification de l'activation LOCALE (SQLite)
        const localSetting = await sqlite.get('SELECT value FROM local_settings WHERE key = ?', [`mail_collector_${col.id}_enabled`]);
        const isEnabledLocally = localSetting ? localSetting.value === 'true' : col.is_enabled;

        if (!isEnabledLocally) return;

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
