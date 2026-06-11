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
      const limit  = Math.min(Math.max(parseInt(req.query.limit)  || 50, 1), 500);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const hideZeros = req.query.hide_zeros === '1';
      const zeroFilter = hideZeros ? ' AND l.emails_received > 0' : '';

      const [logs, countRow] = await Promise.all([
        pgDb.all(
          `SELECT l.* FROM hub_tickets.mail_collector_logs l
           WHERE l.collector_id = ?${zeroFilter}
           ORDER BY l.run_at DESC
           LIMIT ? OFFSET ?`,
          [req.params.id, limit, offset]
        ),
        pgDb.get(
          `SELECT COUNT(*) as total FROM hub_tickets.mail_collector_logs l
           WHERE l.collector_id = ?${zeroFilter}`,
          [req.params.id]
        )
      ]);

      res.json({ data: logs, total: parseInt(countRow?.total || 0), limit, offset });
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération logs', error: error.message });
    }
  },

  // DELETE /:id/logs — efface l'historique d'import d'un collecteur.
  // ?only_invalid=1 ne supprime que les entrées sans date valide (affichées 01/01/1970).
  clearLogs: async (req, res) => {
    try {
      const onlyInvalid = req.query.only_invalid === '1' || req.query.only_invalid === 'true';
      const where = onlyInvalid
        ? "collector_id = ? AND (run_at IS NULL OR run_at < '2000-01-01')"
        : 'collector_id = ?';
      const result = await pgDb.run(
        `DELETE FROM hub_tickets.mail_collector_logs WHERE ${where}`,
        [req.params.id]
      );
      res.json({ success: true, deleted: result.changes ?? 0 });
    } catch (error) {
      res.status(500).json({ message: 'Erreur effacement historique', error: error.message });
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
      const o365Settings = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');

      if (!o365Settings || !o365Settings.is_enabled) {
        return res.status(400).json({
          message: 'O365 mail non configuré',
          configured: false
        });
      }

      if (!o365Settings.client_id || !o365Settings.client_secret || !o365Settings.tenant_id) {
        return res.status(400).json({
          message: 'Paramètres O365 mail incomplets',
          configured: false,
          missing: [
            !o365Settings.client_id && 'client_id',
            !o365Settings.client_secret && 'client_secret',
            !o365Settings.tenant_id && 'tenant_id'
          ].filter(Boolean)
        });
      }

      res.json({
        message: 'O365 mail configuré',
        configured: true,
        tenant: o365Settings.tenant_id.substring(0, 8) + '...',
        defaultMailbox: o365Settings.mailbox || 'non défini'
      });
    } catch (error) {
      res.status(500).json({ message: 'Erreur vérification config', error: error.message });
    }
  },

  // POST /api/mail-collector/reprocess-ticket/:ticket_id
  // Ré-importe les pièces jointes d'un email déjà collecté (images cid: manquantes).
  reprocessTicket: async (req, res) => {
    const ticketId = parseInt(req.params.ticket_id, 10);
    if (!ticketId) return res.status(400).json({ message: 'ticket_id invalide' });
    try {
      const https = require('https');
      const { HttpsProxyAgent } = require('https-proxy-agent');
      const axios = require('axios');

      // 1. Mapping email ↔ ticket
      const mapping = await pgDb.get(
        'SELECT * FROM hub_tickets.ticket_email_mapping WHERE ticket_id = $1 AND is_initial_email = true LIMIT 1',
        [ticketId]
      );
      if (!mapping || !mapping.email_message_id) {
        return res.status(404).json({ message: 'Aucun mapping email trouvé pour ce ticket' });
      }
      const internetMsgId = mapping.email_message_id;

      // 2. Collecteur actif (premier trouvé)
      const collector = await pgDb.get(
        "SELECT * FROM hub_tickets.mail_collectors WHERE is_enabled = true AND module != 'copieurs' ORDER BY id LIMIT 1"
      );
      if (!collector) return res.status(400).json({ message: 'Aucun collecteur mail actif' });

      // 3. Token O365
      const sqlite = getSqlite();
      const o365 = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');
      if (!o365 || !o365.client_id) return res.status(400).json({ message: 'O365 non configuré' });

      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
      const axiosOpts = proxyUrl
        ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
        : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

      const token = await MailCollectorService.getGraphToken(o365);

      // 4. Retrouve le message dans Graph par internetMessageId
      const mailbox = collector.mailbox;
      const filter = `internetMessageId eq '${internetMsgId.replace(/'/g, "''")}'`;
      const searchRes = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${mailbox}/messages`,
        {
          ...axiosOpts,
          headers: { Authorization: `Bearer ${token}` },
          params: { $filter: filter, $top: 1, $select: 'id,internetMessageId,hasAttachments,subject' }
        }
      );
      const messages = searchRes.data.value || [];
      if (!messages.length) {
        // Chercher aussi dans tous les dossiers (incluant success folder)
        const searchAll = await axios.get(
          `https://graph.microsoft.com/v1.0/users/${mailbox}/messages`,
          {
            ...axiosOpts,
            headers: { Authorization: `Bearer ${token}` },
            params: { $search: `"internetMessageId:${internetMsgId}"`, $top: 1, $select: 'id,internetMessageId,hasAttachments,subject' }
          }
        ).catch(() => ({ data: { value: [] } }));
        const found = searchAll.data.value || [];
        if (!found.length) {
          return res.status(404).json({ message: `Email introuvable dans la boîte ${mailbox} (peut avoir été supprimé)` });
        }
        messages.push(...found);
      }

      const graphMsgId = messages[0].id;
      console.log(`[REPROCESS] ticket ${ticketId} — graph message ${graphMsgId}`);

      // 5. Télécharge les pièces jointes (incluant les inline)
      const attachments = await MailCollectorService.downloadAttachments(token, mailbox, graphMsgId, axiosOpts);
      if (!attachments.length) {
        return res.json({ message: 'Aucune pièce jointe trouvée dans cet email', attachments: 0 });
      }

      // 6. Sauvegarde et réécriture cid:
      const createdAtt = await MailCollectorService.addAttachments(ticketId, attachments, req.user?.username || 'system');
      await MailCollectorService.rewriteInlineImages(ticketId, createdAtt);

      console.log(`[REPROCESS] ticket ${ticketId} — ${createdAtt.length} PJ sauvegardées, cid: réécrits`);
      res.json({
        message: `Réintégration terminée : ${createdAtt.length} pièce(s) jointe(s) importée(s)`,
        attachments: createdAtt.length,
        ticket_id: ticketId
      });
    } catch (error) {
      console.error('[REPROCESS] error:', error.message);
      res.status(500).json({ message: 'Erreur réintégration', error: error.message });
    }
  }
};
