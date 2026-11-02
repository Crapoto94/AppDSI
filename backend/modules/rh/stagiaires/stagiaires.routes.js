const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('./stagiaires.controller');
const { authenticateJWT, isAdminLike } = require('../../../shared/middleware');
const { getSqlite } = require('../../../shared/database');

// Accès : administrateurs (admin ou superadmin) et utilisateurs auxquels la tuile « Ressources Humaines »
// (/rh) est attribuée. Une tuile publique ne suffit pas : ce sont des données personnelles (stagiaires, CV).
const authenticateRh = (req, res, next) => {
  authenticateJWT(req, res, async () => {
    if (isAdminLike(req.user)) return next();
    try {
      const db = getSqlite();
      if (req.user && req.user.id && db) {
        const authorized = await db.get(
          `SELECT 1 FROM user_tiles ut JOIN tile_links tl ON ut.tile_id = tl.tile_id WHERE ut.user_id = ? AND tl.url = '/rh'`,
          [req.user.id]
        );
        if (authorized) return next();
      }
    } catch (e) {
      console.error('[AUTH RH] contrôle de la tuile /rh :', e.message);
    }
    res.status(403).json({ message: 'Accès refusé : administrateur ou accès à la tuile Ressources Humaines requis' });
  });
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ctrl.DOC_MAX } });
// Erreur multer (fichier trop gros…) renvoyée en JSON lisible plutôt qu'en page d'erreur
const uploadDoc = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (15 Mo maximum).' : 'Fichier illisible.' });
});

router.use(authenticateRh);

// Routes spécifiques avant les routes paramétrées (/:id)
router.post('/import', ctrl.importMany);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/:id/documents/:kind', uploadDoc, ctrl.uploadDocument);
router.get('/:id/documents/:kind', ctrl.downloadDocument);
router.delete('/:id/documents/:kind', ctrl.deleteDocument);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
