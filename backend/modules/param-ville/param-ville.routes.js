const express = require('express');
const router = express.Router();
const paramVilleCtrl = require('./param-ville.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Paramètres ville - accès authentifié
router.get('/', authenticateJWT, paramVilleCtrl.list);
router.get('/:id', authenticateJWT, paramVilleCtrl.getById);
router.post('/', authenticateJWT, paramVilleCtrl.create);
router.put('/:id', authenticateJWT, paramVilleCtrl.update);
router.delete('/:id', authenticateJWT, paramVilleCtrl.remove);

module.exports = router;