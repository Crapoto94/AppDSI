const { pool } = require('../../shared/pg_db');
const storage = require('../../shared/storage');
const fs = require('fs');
const path = require('path');

// Module GED (cf. skill « ged ») : les images d'imprimante (une par
// désignation) sont stockées via le service de stockage unifié, sous
// storage/<MODULE>/<designation>/<fichier> — servies ensuite par les mounts
// publics /storage et /api/storage (server.js), donc visibles à la fois
// depuis le DSI Hub (5173) et le MagApp (5174), contrairement à l'ancien
// chemin statique frontend/public/images/designations (propre au build du
// seul frontend 5173).
const MODULE = 'consommables';

const controller = {
  // Récupérer l'image d'une désignation
  async getDesignationImage(req, res) {
    try {
      const { designation } = req.params;

      const query = `
        SELECT id, designation, image_path, image_url
        FROM hub_consommables.designation_images
        WHERE LOWER(designation) = LOWER($1)
      `;

      const result = await pool.query(query, [designation]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Designation Images] Error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération de l\'image', details: error.message });
    }
  },

  // Récupérer toutes les images (admin)
  async getAllImages(req, res) {
    try {
      const query = `
        SELECT id, designation, image_path, image_url, created_at
        FROM hub_consommables.designation_images
        ORDER BY designation
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('[Designation Images] Error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des images', details: error.message });
    }
  },

  // Upload une image pour une désignation (admin) — via le service de
  // stockage unifié (cf. skill « ged »). req.file vient de multer en
  // memoryStorage (buffer en mémoire, pas de fichier temporaire sur disque).
  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const { designation } = req.body;
      if (!designation) {
        return res.status(400).json({ error: 'Designation requise' });
      }

      if (req.file.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);
      const saved = await storage.saveFile(MODULE, designation, req.file);

      // Supprime l'ancienne image physique (nouveau stockage ou legacy) avant
      // d'écraser la ligne — une désignation n'a qu'une seule image active.
      try {
        const previous = await pool.query(
          'SELECT image_path FROM hub_consommables.designation_images WHERE LOWER(designation) = LOWER($1)',
          [designation]
        );
        const prevPath = previous.rows[0]?.image_path;
        if (prevPath && prevPath !== saved.dbPath) {
          if (storage.isStoragePath(prevPath)) {
            await storage.deleteFile(prevPath);
          } else {
            const legacyPath = path.join(__dirname, '../../..', `frontend/public${prevPath}`);
            if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
          }
        }
      } catch (e) { console.warn('[Designation Images] cleanup ancienne image échoué:', e.message); }

      const query = `
        INSERT INTO hub_consommables.designation_images (designation, image_path)
        VALUES ($1, $2)
        ON CONFLICT (designation) DO UPDATE SET
          image_path = $2,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [designation, saved.dbPath]);

      // Dual-write hub_docs (viewer central) — best-effort, cf. skill « ged ».
      try {
        const docsService = require('../../shared/documents.service');
        await docsService.registerExternalUpload({
          module: MODULE,
          entityType: 'designation_image',
          entityId: designation,
          title: req.file.originalname,
          filename: saved.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          storageRef: saved.dbPath,
          uploadedBy: req.user?.username || null,
        });
      } catch (e) { console.warn('[DOCS] register failed:', e.message); }

      res.status(201).json({
        message: 'Image téléchargée avec succès',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('[Designation Images] Error:', error);
      res.status(500).json({ error: 'Erreur lors du téléchargement', details: error.message });
    }
  },

  // Supprimer une image (admin)
  async deleteImage(req, res) {
    try {
      const { imageId } = req.params;

      const query = `
        DELETE FROM hub_consommables.designation_images
        WHERE id = $1
        RETURNING image_path
      `;

      const result = await pool.query(query, [imageId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Image non trouvée' });
      }

      // Supprime le fichier physique — gère le nouveau stockage (storage/…)
      // ET l'ancien chemin statique legacy (/images/designations/…).
      const imagePath = result.rows[0].image_path;
      if (storage.isStoragePath(imagePath)) {
        await storage.deleteFile(imagePath);
      } else {
        const legacyPath = path.join(__dirname, '../../..', `frontend/public${imagePath}`);
        if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
      }

      res.json({ message: 'Image supprimée avec succès' });
    } catch (error) {
      console.error('[Designation Images] Error:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression', details: error.message });
    }
  }
};

module.exports = controller;
