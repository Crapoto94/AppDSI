const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('./stagiaires.controller');
const { authenticateJWT, authenticateAdmin } = require('../../../shared/middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ctrl.DOC_MAX } });
// Erreur multer (fichier trop gros…) renvoyée en JSON lisible plutôt qu'en page d'erreur
const uploadDoc = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (15 Mo maximum).' : 'Fichier illisible.' });
});

router.use(authenticateJWT);

// Routes spécifiques avant les routes paramétrées (/:id)
router.post('/import', authenticateAdmin, ctrl.importMany);
router.get('/', authenticateAdmin, ctrl.list);
router.post('/', authenticateAdmin, ctrl.create);
router.post('/:id/documents/:kind', authenticateAdmin, uploadDoc, ctrl.uploadDocument);
router.get('/:id/documents/:kind', authenticateAdmin, ctrl.downloadDocument);
router.delete('/:id/documents/:kind', authenticateAdmin, ctrl.deleteDocument);
router.put('/:id', authenticateAdmin, ctrl.update);
router.delete('/:id', authenticateAdmin, ctrl.remove);

module.exports = router;
