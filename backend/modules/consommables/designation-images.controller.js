const { pool } = require('../../shared/pg_db');
const path = require('path');
const fs = require('fs');

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

  // Upload une image pour une désignation (admin)
  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const { designation } = req.body;
      if (!designation) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Designation requise' });
      }

      // Générer le chemin d'accès public
      const filename = `${Date.now()}_${req.file.filename}`;
      const publicPath = `/images/designations/${filename}`;
      const uploadDir = path.join(__dirname, '../../..', 'frontend/public/images/designations');

      // Créer le dossier s'il n'existe pas
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Déplacer le fichier
      const finalPath = path.join(uploadDir, filename);
      fs.renameSync(req.file.path, finalPath);

      // Sauvegarder en BD
      const query = `
        INSERT INTO hub_consommables.designation_images (designation, image_path)
        VALUES ($1, $2)
        ON CONFLICT (designation) DO UPDATE SET
          image_path = $2,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [designation, publicPath]);

      res.status(201).json({
        message: 'Image téléchargée avec succès',
        data: result.rows[0]
      });
    } catch (error) {
      // Nettoyer le fichier en cas d'erreur
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
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

      // Supprimer le fichier physique
      const imagePath = result.rows[0].image_path;
      const filePath = path.join(__dirname, '../../..', `frontend/public${imagePath}`);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({ message: 'Image supprimée avec succès' });
    } catch (error) {
      console.error('[Designation Images] Error:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression', details: error.message });
    }
  }
};

module.exports = controller;
