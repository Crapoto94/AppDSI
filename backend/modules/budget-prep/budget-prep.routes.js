const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const controller = require('./budget-prep.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');

router.get('/facets', authenticateJWT, controller.getFacets);
router.get('/data', authenticateJWT, controller.getData);
router.get('/imports', authenticateJWT, controller.listImports);
router.post('/import', authenticateAdminOrFinances, upload.single('file'), controller.importFile);
router.delete('/imports/:id', authenticateAdminOrFinances, controller.deleteImport);

module.exports = router;
