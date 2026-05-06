const express = require('express');
const router = express.Router();
const tiersController = require('./tiers.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Contacts API
router.put('/:id', authenticateJWT, tiersController.updateContact);
router.delete('/:id', authenticateJWT, tiersController.deleteContact);

module.exports = router;
