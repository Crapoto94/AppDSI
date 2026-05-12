const express = require('express');
const router = express.Router();
const tiersController = require('./tiers.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Tiers API
router.get('/', authenticateJWT, tiersController.getTiers);
router.get('/:id/contacts', authenticateJWT, tiersController.getContacts);
router.get('/:id/history', authenticateJWT, tiersController.getHistory);
router.post('/:tierId/contacts', authenticateJWT, tiersController.addContact);

module.exports = router;
