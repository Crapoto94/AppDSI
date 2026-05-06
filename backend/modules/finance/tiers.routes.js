const express = require('express');
const router = express.Router();
const tiersController = require('./tiers.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');
const multer = require('multer');
const upload = multer(); // Memory storage for imports if needed, or consistent with monolith

// Tiers API
router.get('/', authenticateJWT, tiersController.getTiers);
router.post('/import', authenticateAdminOrFinances, upload.single('file'), tiersController.importTiers);
router.get('/:id/contacts', authenticateJWT, tiersController.getContacts);
router.get('/:id/history', authenticateJWT, tiersController.getHistory);
router.post('/:tierId/contacts', authenticateJWT, tiersController.addContact);

module.exports = router;
