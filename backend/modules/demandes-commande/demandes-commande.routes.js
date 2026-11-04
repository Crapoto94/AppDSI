const express = require('express');
const router = express.Router();
const swr = require('../../shared/swr-cache');
// Toute écriture (création, validation, documents, commentaires…) invalide le cache de la liste
router.use((req, res, next) => { if (req.method !== 'GET') res.on('finish', () => swr.clear('demandes-commande')); next(); });
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

router.get('/', authenticateJWT, swr.wrap('demandes-commande', controller.list, { ttlMs: 30 * 1000 }));
router.post('/', authenticateJWT, upload.array('files', 10), controller.create);
router.put('/:id', authenticateJWT, upload.array('files', 10), controller.update);
router.get('/:id/bon-commande', authenticateJWT, controller.bonCommande);
router.post('/:id/envoyee', authenticateJWT, controller.marquerEnvoyee);
router.post('/:id/documents', authenticateJWT, upload.array('files', 10), controller.addDocuments);
router.delete('/:id/documents/:pjId', authenticateJWT, controller.removeDocument);
router.post('/:id/validate', authenticateJWT, controller.validate);
router.get('/:id/commentaires', authenticateJWT, controller.listComments);
router.post('/:id/commentaires', authenticateJWT, controller.addComment);
router.put('/:id/commentaires/:cid', authenticateJWT, controller.editComment);
router.delete('/:id/commentaires/:cid', authenticateJWT, controller.deleteComment);
router.delete('/:id', authenticateJWT, controller.remove);
router.post('/:id/commande', authenticateJWT, controller.associerCommande);

// Préchauffage de la liste (états Sedit : commandes, factures mandatées) toutes les 3 min
if (process.env.BUDGET_WARMUP !== '0') {
    const warmDemandes = () => swr.warm('demandes-commande', controller.list, {}).catch((e) => console.warn('[DEMANDES WARM]', e.message));
    setTimeout(() => { warmDemandes(); setInterval(warmDemandes, 3 * 60 * 1000).unref(); }, 30 * 1000).unref();
}

module.exports = router;
