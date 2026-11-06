const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const c = require('./boite-idees.controller');

// Tout agent connecté peut consulter, déposer (éventuellement anonymement) et voter ; la modération est réservée aux administrateurs.
router.get('/categories', authenticateJWT, c.categories);
router.get('/stats', authenticateJWT, c.stats);
router.get('/', authenticateJWT, c.list);
router.post('/', authenticateJWT, c.create);
router.post('/:id/vote', authenticateJWT, c.vote);
router.patch('/:id', authenticateJWT, c.moderate);
router.delete('/:id', authenticateJWT, c.remove);

module.exports = router;
