const { pgDb } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const MailRulesService = require('./mail_rules.service');

module.exports = {
  getAll: async (req, res) => {
    try {
      const rules = await MailRulesService.getAllRules();
      res.json(rules);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération règles', error: error.message });
    }
  },

  getById: async (req, res) => {
    try {
      const rule = await pgDb.get('SELECT * FROM hub_tickets.mail_rules WHERE id = ?', [req.params.id]);
      if (!rule) return res.status(404).json({ message: 'Règle non trouvée' });
      res.json(rule);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération règle', error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { name, type, keywords, priority, is_active, category_id, software_id } = req.body;
      if (!name || !type || !keywords) {
        return res.status(400).json({ message: 'Champs requis: name, type, keywords' });
      }
      if (!['demande', 'incident'].includes(type)) {
        return res.status(400).json({ message: 'Type doit être demande ou incident' });
      }

      const result = await pgDb.run(
        'INSERT INTO hub_tickets.mail_rules (name, type, keywords, priority, is_active, category_id, software_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, type, keywords, priority || 100, is_active !== false, category_id || null, software_id || null]
      );

      const rule = await pgDb.get('SELECT * FROM hub_tickets.mail_rules WHERE id = ?', [result.lastID]);
      logMouchard(`Règle mail créée: ${name} (${type})`);
      res.status(201).json(rule);
    } catch (error) {
      res.status(500).json({ message: 'Erreur création règle', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const existing = await pgDb.get('SELECT * FROM hub_tickets.mail_rules WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ message: 'Règle non trouvée' });

      const { name, type, keywords, priority, is_active, category_id, software_id } = req.body;
      if (type && !['demande', 'incident'].includes(type)) {
        return res.status(400).json({ message: 'Type doit être demande ou incident' });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (type !== undefined) { updates.push('type = ?'); values.push(type); }
      if (keywords !== undefined) { updates.push('keywords = ?'); values.push(keywords); }
      if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
      if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
      if (category_id !== undefined) { updates.push('category_id = ?'); values.push(category_id || null); }
      if (software_id !== undefined) { updates.push('software_id = ?'); values.push(software_id || null); }

      if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });

      values.push(req.params.id);
      await pgDb.run(`UPDATE hub_tickets.mail_rules SET ${updates.join(', ')} WHERE id = ?`, values);

      const updated = await pgDb.get('SELECT * FROM hub_tickets.mail_rules WHERE id = ?', [req.params.id]);
      logMouchard(`Règle mail modifiée: ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: 'Erreur mise à jour règle', error: error.message });
    }
  },

  delete: async (req, res) => {
    try {
      const rule = await pgDb.get('SELECT * FROM hub_tickets.mail_rules WHERE id = ?', [req.params.id]);
      if (!rule) return res.status(404).json({ message: 'Règle non trouvée' });

      await pgDb.run('DELETE FROM hub_tickets.mail_rules WHERE id = ?', [req.params.id]);
      logMouchard(`Règle mail supprimée: ${rule.name}`);
      res.json({ message: 'Règle supprimée' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur suppression règle', error: error.message });
    }
  },

  testClassification: async (req, res) => {
    try {
      const { title, content } = req.body;
      if (!title) return res.status(400).json({ message: 'Title requis' });

      const result = await MailRulesService.classifyTicket(title, content);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: 'Erreur classification', error: error.message });
    }
  },

  initializeDefaults: async (req, res) => {
    try {
      await MailRulesService.createDefaultRules();
      const rules = await MailRulesService.getAllRules();
      logMouchard('Règles mail par défaut initialisées');
      res.json({ message: 'Règles initialisées', rules });
    } catch (error) {
      res.status(500).json({ message: 'Erreur initialisation', error: error.message });
    }
  }
};
