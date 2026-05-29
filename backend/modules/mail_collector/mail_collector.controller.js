const { pgDb, getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const MailCollectorService = require('./mail_collector.service');

module.exports = {
  getAll: async (req, res) => {
    try {
      const collectors = await pgDb.all('SELECT * FROM hub_tickets.mail_collectors ORDER BY created_at DESC');
      res.json(collectors);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération collecteurs', error: error.message });
    }
  },

  getById: async (req, res) => {
    try {
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [req.params.id]);
      if (!collector) return res.status(404).json({ message: 'Collecteur non trouvé' });

      const logs = await pgDb.all(
        'SELECT * FROM hub_tickets.mail_collector_logs WHERE collector_id = ? ORDER BY run_at DESC LIMIT 10',
        [collector.id]
      );

      res.json({ ...collector, recentLogs: logs });
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération collecteur', error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { name, mailbox, domain_filter, frequency, is_enabled, module } = req.body;

      if (!name || !mailbox) {
        return res.status(400).json({ message: 'Champs requis: name, mailbox' });
      }

      const existing = await pgDb.get('SELECT id FROM hub_tickets.mail_collectors WHERE mailbox = ?', [mailbox]);
      if (existing) {
        return res.status(400).json({ message: 'Cette boite mail est déjà configurée' });
      }

      const nextRun = MailCollectorService.getNextRunTime(frequency || 'hourly');

      const result = await pgDb.run(
        'INSERT INTO hub_tickets.mail_collectors (name, mailbox, domain_filter, frequency, module, is_enabled, next_run) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, mailbox, domain_filter || null, frequency || 'hourly', module || 'tickets', is_enabled !== false, nextRun.toISOString()]
      );

      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [result.lastID]);
      logMouchard(`Collecteur mail créé: ${name} (${mailbox})`);
      res.status(201).json(collector);
    } catch (error) {
      res.status(500).json({ message: 'Erreur création collecteur', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const existing = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ message: 'Collecteur non trouvé' });

      const { name, mailbox, domain_filter, frequency, is_enabled, module } = req.body;

      if (mailbox && mailbox !== existing.mailbox) {
        const duplicate = await pgDb.get('SELECT id FROM hub_tickets.mail_collectors WHERE mailbox = ?', [mailbox]);
        if (duplicate) {
          return res.status(400).json({ message: 'Cette boite mail est déjà configurée' });
        }
      }

      const updates = [];
      const values = [];

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (mailbox !== undefined) { updates.push('mailbox = ?'); values.push(mailbox); }
      if (domain_filter !== undefined) { updates.push('domain_filter = ?'); values.push(domain_filter || null); }
      if (frequency !== undefined) { updates.push('frequency = ?'); values.push(frequency); }
      if (is_enabled !== undefined) { updates.push('is_enabled = ?'); values.push(is_enabled); }
      if (module !== undefined) { updates.push('module = ?'); values.push(module); }

      if (frequency) {
        const nextRun = MailCollectorService.getNextRunTime(frequency);
        updates.push('next_run = ?');
        values.push(nextRun.toISOString());
      }

      updates.push('updated_at = NOW()');
      if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });

      values.push(req.params.id);
      await pgDb.run(`UPDATE hub_tickets.mail_collectors SET ${updates.join(', ')} WHERE id = ?`, values);

      const updated = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [req.params.id]);
      logMouchard(`Collecteur mail modifié: ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: 'Erreur mise à jour collecteur', error: error.message });
    }
  },

  delete: async (req, res) => {
    try {
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [req.params.id]);
      if (!collector) return res.status(404).json({ message: 'Collecteur non trouvé' });

      await pgDb.run('DELETE FROM hub_tickets.mail_collectors WHERE id = ?', [req.params.id]);
      logMouchard(`Collecteur mail supprimé: ${collector.name}`);
      res.json({ message: 'Collecteur supprimé' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur suppression collecteur', error: error.message });
    }
  },

  runNow: async (req, res) => {
    try {
      const collectorId = req.params.id;
      const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
      if (!collector) return res.status(404).json({ message: 'Collecteur non trouvé' });
      if (!collector.is_enabled) return res.status(400).json({ message: 'Collecteur désactivé' });

      const module = collector.module || 'tickets';
      const log = await MailCollectorService.performCollection(collectorId);

      if (log && log.status === 'failed') {
        logMouchard(`Collecte manuelle échouée: collecteur ${collectorId} (module ${module})`);
        return res.status(400).json({
          message: 'Erreur lors de la collecte',
          detail: log.errors ? log.errors.join(' | ') : 'Erreur inconnue',
          log: log
        });
      }

      logMouchard(`Collecte manuelle exécutée: collecteur ${collectorId} (module ${module}), ${log.emails_imported || 0}/${log.emails_received || 0} importés`);
      res.json({ message: 'Collecte exécutée', log });
    } catch (error) {
      console.error('[MAIL COLLECTOR] runNow error:', error);
      res.status(400).json({
        message: 'Erreur collecte',
        error: error.message,
        detail: error.response?.data?.message || error.response?.data || ''
      });
    }
  },

  getLogs: async (req, res) => {
    try {
      const logs = await pgDb.all(
        `SELECT l.* FROM hub_tickets.mail_collector_logs l
         JOIN hub_tickets.mail_collectors c ON l.collector_id = c.id
         WHERE c.id = ?
         ORDER BY l.run_at DESC
         LIMIT 50`,
        [req.params.id]
      );

      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération logs', error: error.message });
    }
  },

  getStats: async (req, res) => {
    try {
      const stats = await pgDb.all(`
        SELECT
          c.id,
          c.name,
          c.mailbox,
          COUNT(l.id) as total_runs,
          SUM(l.emails_received) as total_received,
          SUM(l.emails_imported) as total_imported,
          SUM(l.tickets_created) as total_tickets,
          SUM(l.comments_added) as total_comments,
          MAX(l.run_at) as last_run
        FROM hub_tickets.mail_collectors c
        LEFT JOIN hub_tickets.mail_collector_logs l ON c.id = l.collector_id
        GROUP BY c.id, c.name, c.mailbox
        ORDER BY c.created_at DESC
      `);

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération stats', error: error.message });
    }
  },

  purgeInvalidTickets: async (req, res) => {
    try {
      // Supprime tickets sans glpi_id valide (null ou 0)
      const nullResult = await pgDb.run(
        'DELETE FROM hub_tickets.tickets WHERE glpi_id IS NULL OR glpi_id = 0'
      );

      // Supprime les mappings email qui pointent vers des tickets inexistants
      const orphanResult = await pgDb.run(
        `DELETE FROM hub_tickets.ticket_email_mapping
         WHERE ticket_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM hub_tickets.tickets t WHERE t.glpi_id = ticket_email_mapping.ticket_id)`
      );

      const deleted = (nullResult.changes || 0) + (orphanResult.changes || 0);
      res.json({
        message: `${nullResult.changes || 0} ticket(s) sans numéro supprimé(s), ${orphanResult.changes || 0} mapping(s) orphelins supprimés`,
        tickets_deleted: nullResult.changes || 0,
        mappings_deleted: orphanResult.changes || 0
      });
    } catch (error) {
      res.status(500).json({ message: 'Erreur purge', error: error.message });
    }
  },

  testConfig: async (req, res) => {
    try {
      const sqlite = getSqlite();
      const o365Settings = await sqlite.get('SELECT * FROM azure_ad_settings WHERE id = 1');

      if (!o365Settings || !o365Settings.is_enabled) {
        return res.status(400).json({
          message: 'Azure AD non configuré',
          configured: false
        });
      }

      if (!o365Settings.client_id || !o365Settings.client_secret || !o365Settings.tenant_id) {
        return res.status(400).json({
          message: 'Paramètres Azure AD incomplets',
          configured: false,
          missing: [
            !o365Settings.client_id && 'client_id',
            !o365Settings.client_secret && 'client_secret',
            !o365Settings.tenant_id && 'tenant_id'
          ].filter(Boolean)
        });
      }

      res.json({
        message: 'Azure AD configuré',
        configured: true,
        tenant: o365Settings.tenant_id.substring(0, 8) + '...',
        defaultMailbox: o365Settings.mailbox || 'non défini'
      });
    } catch (error) {
      res.status(500).json({ message: 'Erreur vérification config', error: error.message });
    }
  }
};
