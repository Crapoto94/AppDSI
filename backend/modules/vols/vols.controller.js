const { pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');
const path = require('path');

const MODULE = 'vols';

module.exports = {
  count: async (req, res) => {
    try {
      const row = await pgDb.get('SELECT COUNT(*) AS count FROM hub_vols.thefts');
      res.json({ count: parseInt(row?.count || row?.['COUNT(*)'] || 0, 10) });
    } catch (e) {
      res.status(500).json({ message: 'Erreur comptage', error: e.message });
    }
  },

  list: async (req, res) => {
    try {
      const rows = await pgDb.all(
        'SELECT * FROM hub_vols.thefts ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: 'Erreur chargement', error: e.message });
    }
  },

  getOne: async (req, res) => {
    try {
      const theft = await pgDb.get('SELECT * FROM hub_vols.thefts WHERE id = ?', [req.params.id]);
      if (!theft) return res.status(404).json({ message: 'Dossier introuvable' });
      const documents = await pgDb.all('SELECT * FROM hub_vols.theft_documents WHERE theft_id = ? ORDER BY uploaded_at', [req.params.id]);
      const comments = await pgDb.all('SELECT * FROM hub_vols.theft_comments WHERE theft_id = ? ORDER BY created_at', [req.params.id]);
      res.json({ ...theft, documents, comments });
    } catch (e) {
      res.status(500).json({ message: 'Erreur chargement dossier', error: e.message });
    }
  },

  create: async (req, res) => {
    try {
      const { type_incident, designation, numero_inventaire, parc_type_key, parc_glpi_id,
        agent_nom, agent_service, beneficiaire_nom, beneficiaire_service,
        valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, statut } = req.body;
      const result = await pgDb.run(
        `INSERT INTO hub_vols.thefts
          (type_incident, designation, numero_inventaire, parc_type_key, parc_glpi_id,
           agent_nom, agent_service, beneficiaire_nom, beneficiaire_service,
           valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, statut, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [type_incident || 'vol', designation, numero_inventaire || '', parc_type_key || '', parc_glpi_id || null,
         agent_nom || '', agent_service || '', beneficiaire_nom || '', beneficiaire_service || '',
         valeur_achat || null, date_achat || null, age_annees || null, date_vol || null, lieu || '', circonstances || '', statut || 'declare', req.user?.username || '']
      );
      res.status(201).json({ id: result.lastID || result.id, message: 'Dossier créé' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur création', error: e.message });
    }
  },

  update: async (req, res) => {
    try {
      const { type_incident, designation, numero_inventaire, parc_type_key, parc_glpi_id,
        agent_nom, agent_service, beneficiaire_nom, beneficiaire_service,
        valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, statut } = req.body;
      await pgDb.run(
        `UPDATE hub_vols.thefts SET
          type_incident = ?, designation = ?, numero_inventaire = ?, parc_type_key = ?, parc_glpi_id = ?,
          agent_nom = ?, agent_service = ?, beneficiaire_nom = ?, beneficiaire_service = ?,
          valeur_achat = ?, date_achat = ?, age_annees = ?, date_vol = ?, lieu = ?, circonstances = ?,
          statut = ?, updated_at = NOW()
         WHERE id = ?`,
        [type_incident || 'vol', designation, numero_inventaire || '', parc_type_key || '', parc_glpi_id || null,
         agent_nom || '', agent_service || '', beneficiaire_nom || '', beneficiaire_service || '',
         valeur_achat || null, date_achat || null, age_annees || null, date_vol || null, lieu || '', circonstances || '',
         statut || 'declare', req.params.id]
      );
      res.json({ message: 'Dossier mis à jour' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur mise à jour', error: e.message });
    }
  },

  remove: async (req, res) => {
    try {
      const docs = await pgDb.all('SELECT * FROM hub_vols.theft_documents WHERE theft_id = ?', [req.params.id]);
      for (const d of docs) {
        if (d.file_path) await storage.deleteFile(d.file_path).catch(() => {});
      }
      await pgDb.run('DELETE FROM hub_vols.theft_comments WHERE theft_id = ?', [req.params.id]);
      await pgDb.run('DELETE FROM hub_vols.theft_documents WHERE theft_id = ?', [req.params.id]);
      await pgDb.run('DELETE FROM hub_vols.thefts WHERE id = ?', [req.params.id]);
      res.json({ message: 'Dossier supprimé' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur suppression', error: e.message });
    }
  },

  uploadDoc: async (req, res) => {
    try {
      const theftId = req.params.id;
      const file = req.file;
      if (!file) return res.status(400).json({ message: 'Fichier requis' });
      const nature = req.body.nature || 'Autre';
      const saved = await storage.saveFile(MODULE, String(theftId), file);
      await pgDb.run(
        'INSERT INTO hub_vols.theft_documents (theft_id, file_path, file_name, nature, uploaded_by) VALUES (?, ?, ?, ?, ?)',
        [theftId, saved.filePath, saved.fileName || file.originalname || path.basename(file.path), nature, req.user?.username || '']
      );
      res.status(201).json({ message: 'Document ajouté' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur upload', error: e.message });
    }
  },

  deleteDoc: async (req, res) => {
    try {
      const doc = await pgDb.get('SELECT * FROM hub_vols.theft_documents WHERE id = ? AND theft_id = ?', [req.params.docId, req.params.id]);
      if (doc) {
        if (doc.file_path) await storage.deleteFile(doc.file_path).catch(() => {});
        await pgDb.run('DELETE FROM hub_vols.theft_documents WHERE id = ?', [req.params.docId]);
      }
      res.json({ message: 'Document supprimé' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur suppression document', error: e.message });
    }
  },

  downloadDoc: async (req, res) => {
    try {
      const doc = await pgDb.get('SELECT * FROM hub_vols.theft_documents WHERE id = ? AND theft_id = ?', [req.params.docId, req.params.id]);
      if (!doc) return res.status(404).json({ message: 'Document introuvable' });
      const f = await storage.getFileForServe(doc.file_path);
      if (!f) return res.status(404).json({ message: 'Fichier introuvable sur le disque' });
      if (doc.file_name) res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
      if (f.buffer) {
        res.end(f.buffer);
      } else if (f.absolutePath) {
        res.sendFile(f.absolutePath);
      } else {
        res.status(500).json({ message: 'Type de fichier non supporté' });
      }
    } catch (e) {
      res.status(500).json({ message: 'Erreur téléchargement', error: e.message });
    }
  },

  addComment: async (req, res) => {
    try {
      const { comment } = req.body;
      if (!comment || !comment.trim()) return res.status(400).json({ message: 'Commentaire requis' });
      await pgDb.run(
        'INSERT INTO hub_vols.theft_comments (theft_id, comment, author) VALUES (?, ?, ?)',
        [req.params.id, comment.trim(), req.user?.username || '']
      );
      res.status(201).json({ message: 'Commentaire ajouté' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur ajout commentaire', error: e.message });
    }
  },
};
