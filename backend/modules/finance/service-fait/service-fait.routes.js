const express = require('express');
const router = express.Router();
const controller = require('./service-fait.controller');
const { authenticateJWT, authenticateAdmin } = require('../../../shared/middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Internal API (requires JWT)
router.post('/', authenticateJWT, controller.createWorkflow);
// Déclaration directe du service fait (sans circuit de validation) — PJ obligatoire
router.post('/self', authenticateJWT, upload.array('files', 10), controller.createSelfWorkflow);
router.post('/statuses', authenticateJWT, controller.getStatuses);
// Écritures Sedit (admin) — AVANT /:id pour ne pas être capturé par la route paramétrée.
router.get('/sedit-writes', authenticateAdmin, controller.listSeditWrites);
router.post('/sedit-writes/:logId/undo', authenticateAdmin, controller.undoSeditWrite);
router.get('/:id', authenticateJWT, controller.getWorkflow);
router.post('/:id/cancel', authenticateJWT, controller.cancelWorkflow);
router.post('/:id/pieces-jointes', authenticateJWT, upload.array('files', 10), controller.addPiecesJointes);
router.delete('/pieces-jointes/:pjId', authenticateJWT, controller.deletePieceJointe);

// Public API (no JWT — token-based)
router.get('/public/:token', controller.getPublicByToken);
router.post('/public/:token/decision', controller.submitDecision);
// Pièces jointes déposées par le vérificateur via son lien public (sans JWT).
router.post('/public/:token/pieces-jointes', upload.array('files', 10), controller.addPublicPiecesJointes);
// Pièces jointes Sedit de la facture, consultables par le vérificateur via son lien
// public (avant décision) — remplace l'ancien upload manuel de la facture.
router.get('/public/:token/documents', controller.getPublicDocuments);
router.get('/public/:token/documents/:docId', controller.getPublicDocumentFile);

module.exports = router;
