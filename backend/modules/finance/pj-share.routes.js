const express = require('express');
const router = express.Router();
const financeShareController = require('./finance-share.controller');
const { authenticateAdmin, authenticateJWT } = require('../../shared/middleware');

// Partage de fichiers Sedit Finances (pièces jointes eGF/pjust) — voir skill "sedit-finances"
router.get('/settings', authenticateAdmin, financeShareController.getShareSettings);
router.post('/settings', authenticateAdmin, financeShareController.saveShareSettings);
router.get('/test-file', authenticateAdmin, financeShareController.testDisplayFile);

// Pièces jointes d'une facture (visionneuse multidocuments côté /budget)
router.get('/facture/:numero/documents', authenticateJWT, financeShareController.getFactureDocuments);
router.get('/facture/:numero/documents/:docId', authenticateJWT, financeShareController.getFactureDocumentFile);

module.exports = router;
