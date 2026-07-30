const { pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');

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
        `SELECT t.*,
                (SELECT COUNT(*) FROM hub_vols.theft_documents d WHERE d.theft_id = t.id) AS doc_count
         FROM hub_vols.thefts t
         ORDER BY t.created_at DESC`
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
        valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, numero_ticket, dpd_informe, statut } = req.body;
      const result = await pgDb.run(
        `INSERT INTO hub_vols.thefts
          (type_incident, designation, numero_inventaire, parc_type_key, parc_glpi_id,
           agent_nom, agent_service, beneficiaire_nom, beneficiaire_service,
           valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, numero_ticket, dpd_informe, statut, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [type_incident || 'vol', designation, numero_inventaire || '', parc_type_key || '', parc_glpi_id || null,
         agent_nom || '', agent_service || '', beneficiaire_nom || '', beneficiaire_service || '',
         valeur_achat || null, date_achat || null, age_annees || null, date_vol || null, lieu || '', circonstances || '', numero_ticket || '', !!dpd_informe, statut || 'declare', req.user?.username || '']
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
        valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, numero_ticket, dpd_informe, statut } = req.body;
      await pgDb.run(
        `UPDATE hub_vols.thefts SET
          type_incident = ?, designation = ?, numero_inventaire = ?, parc_type_key = ?, parc_glpi_id = ?,
          agent_nom = ?, agent_service = ?, beneficiaire_nom = ?, beneficiaire_service = ?,
          valeur_achat = ?, date_achat = ?, age_annees = ?, date_vol = ?, lieu = ?, circonstances = ?, numero_ticket = ?, dpd_informe = ?,
          statut = ?, updated_at = NOW()
         WHERE id = ?`,
        [type_incident || 'vol', designation, numero_inventaire || '', parc_type_key || '', parc_glpi_id || null,
         agent_nom || '', agent_service || '', beneficiaire_nom || '', beneficiaire_service || '',
         valeur_achat || null, date_achat || null, age_annees || null, date_vol || null, lieu || '', circonstances || '', numero_ticket || '', !!dpd_informe,
         statut || 'declare', req.params.id]
      );
      res.json({ message: 'Dossier mis à jour' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur mise à jour', error: e.message });
    }
  },

  toggleDpd: async (req, res) => {
    try {
      const { dpd_informe } = req.body;
      await pgDb.run('UPDATE hub_vols.thefts SET dpd_informe = ?, updated_at = NOW() WHERE id = ?', [!!dpd_informe, req.params.id]);
      res.json({ message: 'Mis à jour', dpd_informe: !!dpd_informe });
    } catch (e) {
      res.status(500).json({ message: 'Erreur mise à jour DPD', error: e.message });
    }
  },

  remove: async (req, res) => {
    try {
      const docs = await pgDb.all('SELECT * FROM hub_vols.theft_documents WHERE theft_id = ?', [req.params.id]);
      for (const d of docs) {
        if (d.file_path) await storage.deleteFile(d.file_path).catch(() => {});
        if (d.hub_doc_id) {
          await pgDb.run('DELETE FROM hub_docs.document_versions WHERE document_id = ?', [d.hub_doc_id]).catch(() => {});
          await pgDb.run('DELETE FROM hub_docs.documents WHERE id = ?', [d.hub_doc_id]).catch(() => {});
        }
      }
      await pgDb.run('DELETE FROM hub_vols.theft_comments WHERE theft_id = ?', [req.params.id]);
      await pgDb.run('DELETE FROM hub_vols.theft_documents WHERE theft_id = ?', [req.params.id]);
      await pgDb.run('DELETE FROM hub_vols.thefts WHERE id = ?', [req.params.id]);
      res.json({ message: 'Dossier supprimé' });
    } catch (e) {
      res.status(500).json({ message: 'Erreur suppression', error: e.message });
    }
  },

  getDocuments: async (req, res) => {
    try {
      const docs = await pgDb.all('SELECT * FROM hub_vols.theft_documents WHERE theft_id = ? ORDER BY uploaded_at DESC', [req.params.id]);
      res.json(docs);
    } catch (e) {
      res.status(500).json({ message: 'Erreur chargement documents', error: e.message });
    }
  },

  uploadDoc: async (req, res) => {
    try {
      const theftId = req.params.id;
      const file = req.file;
      if (!file) return res.status(400).json({ message: 'Fichier requis' });
      const nature = req.body.nature || 'Autre';
      if (file.originalname) file.originalname = storage.fixUploadName(file.originalname);
      const saved = await storage.saveFile(MODULE, String(theftId), file);

      let hubDocId = null;
      try {
        const docsService = require('../../shared/documents.service');
        const registered = await docsService.registerExternalUpload({
          module: MODULE,
          entityType: 'attachment',
          entityId: theftId,
          title: file.originalname || nature,
          filename: saved.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          storageRef: saved.dbPath,
          metadata: { nature },
          uploadedBy: req.user?.username || null,
        });
        hubDocId = registered?.document?.id || null;
      } catch (e) { console.warn('[DOCS] register failed:', e.message); }

      const result = await pgDb.run(
        'INSERT INTO hub_vols.theft_documents (theft_id, file_path, file_name, nature, hub_doc_id, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
        [theftId, saved.dbPath, file.originalname || saved.filename, nature, hubDocId, req.user?.username || '']
      );
      res.status(201).json({ message: 'Document ajouté', id: result.lastID || result.id, hub_doc_id: hubDocId });
    } catch (e) {
      res.status(500).json({ message: 'Erreur upload', error: e.message });
    }
  },

  deleteDoc: async (req, res) => {
    try {
      const doc = await pgDb.get('SELECT * FROM hub_vols.theft_documents WHERE id = ? AND theft_id = ?', [req.params.docId, req.params.id]);
      if (doc) {
        if (doc.file_path) await storage.deleteFile(doc.file_path).catch(() => {});
        if (doc.hub_doc_id) {
          await pgDb.run('DELETE FROM hub_docs.document_versions WHERE document_id = ?', [doc.hub_doc_id]).catch(() => {});
          await pgDb.run('DELETE FROM hub_docs.documents WHERE id = ?', [doc.hub_doc_id]).catch(() => {});
        }
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
