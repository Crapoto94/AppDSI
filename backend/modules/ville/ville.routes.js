const express = require('express');
const router = express.Router();
const villeController = require('./ville.controller');
const { authenticateAdmin, authenticateJWT, authenticateAdminOrApiKey } = require('../../shared/middleware');
const multer = require('multer');

const upload = multer({ dest: '/tmp' });

// Lecture : admin (UI) OU clé API restreinte au module « ville »
const readVille = authenticateAdminOrApiKey('ville');

/**
 * @openapi
 * tags:
 *   - name: Ville
 *     description: Paramétrage ville (organisation, élus, sites, écoles). Lecture accessible par clé API de périmètre `ville`.
 *
 * /api/ville/config:
 *   get:
 *     tags: [Ville]
 *     summary: Configuration générale de la ville (nom, code postal)
 *     security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
 *     responses:
 *       200: { description: Objet de configuration }
 *
 * /api/ville/elus:
 *   get:
 *     tags: [Ville]
 *     summary: Liste des élus (nom, prénom, rôle, délégation, contact)
 *     security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
 *     responses:
 *       200: { description: Tableau d'élus }
 *
 * /api/ville/sites:
 *   get:
 *     tags: [Ville]
 *     summary: Liste des sites de la collectivité (adresse, géolocalisation)
 *     security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
 *     responses:
 *       200: { description: Tableau de sites }
 *
 * /api/ville/ecoles:
 *   get:
 *     tags: [Ville]
 *     summary: Liste des écoles
 *     security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
 *     responses:
 *       200: { description: Tableau d'écoles }
 */

// Onglet Général
router.get('/config', authenticateJWT, villeController.getConfig);   // lecture : tout utilisateur connecté
router.put('/config', authenticateAdmin, villeController.updateConfig);

// Onglet Élus
router.get('/elus', authenticateJWT, villeController.getElus);
router.post('/elus', authenticateAdmin, villeController.createElu);
router.put('/elus/:id', authenticateAdmin, villeController.updateElu);
router.delete('/elus/:id', authenticateAdmin, villeController.deleteElu);
router.post('/elus/import', authenticateAdmin, upload.single('file'), villeController.importElus);

// Onglet Sites
router.get('/sites/list', authenticateJWT, villeController.getSitesList);
router.get('/sites', authenticateJWT, villeController.getSites);
router.post('/sites/import', authenticateAdmin, upload.single('file'), villeController.importSites);
router.put('/sites/:id', authenticateAdmin, villeController.updateSite);
router.patch('/sites/:id/geocode', authenticateAdmin, villeController.saveGeocode);

// Onglet Écoles
router.get('/ecoles', authenticateJWT, villeController.getEcoles);
router.post('/ecoles', authenticateAdmin, villeController.createEcole);
router.put('/ecoles/:id', authenticateAdmin, villeController.updateEcole);
router.delete('/ecoles/:id', authenticateAdmin, villeController.deleteEcole);

module.exports = router;
