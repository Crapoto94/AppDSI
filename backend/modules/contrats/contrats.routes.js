const express = require('express');
const multer = require('multer');
const path = require('path');
const { pgDb } = require('../../shared/database');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const controller = require('./contrats.controller');

const router = express.Router();

// Configuration multer pour documents (en memory, sauvegarde via storage service)
const uploadDoc = multer({ storage: multer.memoryStorage() });

const upload = multer({ storage: multer.memoryStorage() });

// Badge dashboard : contrats expirés / bientôt expirés
router.get('/expiry-count', authenticateJWT, async (req, res) => {
    await controller.getExpiryCount(req, res, pgDb);
});

// Import Excel (specific route before generic POST /)
router.post('/upload-excel', upload.single('file'), authenticateAdmin, async (req, res) => {
    await controller.uploadExcel(req, res, pgDb);
});

// Specialized /:id routes (before generic /:id)
router.get('/:id/documents', authenticateJWT, async (req, res) => {
    await controller.getDocuments(req, res, pgDb);
});

router.post('/:id/documents', uploadDoc.single('file'), authenticateAdmin, async (req, res) => {
    await controller.addDocument(req, res, pgDb);
});

router.delete('/:id/documents/:docId', authenticateAdmin, async (req, res) => {
    await controller.deleteDocument(req, res, pgDb);
});

router.put('/:id/renouvellement', authenticateAdmin, async (req, res) => {
    await controller.updateRenewal(req, res, pgDb);
});

router.put('/:id/statut', authenticateAdmin, async (req, res) => {
    await controller.updateStatus(req, res, pgDb);
});

// Generic CRUD routes (after specific routes)
router.get('/', authenticateJWT, async (req, res) => {
    await controller.getAll(req, res, pgDb);
});

router.post('/', authenticateAdmin, async (req, res) => {
    await controller.create(req, res, pgDb);
});

router.put('/:id', authenticateAdmin, async (req, res) => {
    await controller.update(req, res, pgDb);
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
    await controller.delete(req, res, pgDb);
});

module.exports = router;
