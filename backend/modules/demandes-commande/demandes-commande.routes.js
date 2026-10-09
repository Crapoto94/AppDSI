const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const controller = require('./demandes-commande.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');

// Routes spécifiques avant les routes paramétrées.
router.get('/me', authenticateJWT, controller.me);
router.get('/validateurs', authenticateJWT, controller.listValidateurs);
router.post('/validateurs', authenticateAdminOrFinances, controller.addValidateur);
router.delete('/validateurs/:username', authenticateAdminOrFinances, controller.removeValidateur);

router.get('/sedit-commandes', authenticateJWT, controller.listSeditCommandes);

router.get('/', authenticateJWT, controller.list);
router.post('/', authenticateJWT, upload.array('files', 10), controller.create);
router.put('/:id', authenticateJWT, upload.array('files', 10), controller.update);
router.post('/:id/validate', authenticateJWT, controller.validate);
router.get('/:id/commentaires', authenticateJWT, controller.listComments);
router.post('/:id/commentaires', authenticateJWT, controller.addComment);
router.put('/:id/commentaires/:cid', authenticateJWT, controller.editComment);
router.delete('/:id/commentaires/:cid', authenticateJWT, controller.deleteComment);
router.delete('/:id', authenticateJWT, controller.remove);
router.post('/:id/commande', authenticateJWT, controller.associerCommande);

module.exports = router;
