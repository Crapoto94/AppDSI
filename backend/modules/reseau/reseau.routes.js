const express = require('express');
const router = express.Router();
const ctrl = require('./reseau.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Toutes les routes nécessitent un JWT.
router.use(authenticateJWT);

// Référentiel sites (lecture seule de hub.sites)
router.get('/sites', ctrl.getSites);

// Liens réseau
router.get('/links', ctrl.getLinks);
router.post('/links', ctrl.createLink);
router.put('/links/:id', ctrl.updateLink);
router.delete('/links/:id', ctrl.deleteLink);

// Accès réseau
router.get('/access', ctrl.getAccess);
router.post('/access', ctrl.createAccess);

// Fourreaux
router.get('/ducts', ctrl.getDucts);
router.post('/ducts', ctrl.createDuct);

module.exports = router;
