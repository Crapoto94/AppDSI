const express = require('express');
const router = express.Router();
const villeController = require('./ville.controller');
const { authenticateAdmin, authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');

const upload = multer({ dest: '/tmp' });

// Onglet Général
router.get('/config', authenticateAdmin, villeController.getConfig);
router.put('/config', authenticateAdmin, villeController.updateConfig);

// Onglet Élus
router.get('/elus', authenticateAdmin, villeController.getElus);
router.post('/elus', authenticateAdmin, villeController.createElu);
router.put('/elus/:id', authenticateAdmin, villeController.updateElu);
router.delete('/elus/:id', authenticateAdmin, villeController.deleteElu);
router.post('/elus/import', authenticateAdmin, upload.single('file'), villeController.importElus);

// Onglet Sites
router.get('/sites/list', authenticateJWT, villeController.getSitesList);
router.get('/sites', authenticateAdmin, villeController.getSites);
router.post('/sites/import', authenticateAdmin, upload.single('file'), villeController.importSites);
router.put('/sites/:id', authenticateAdmin, villeController.updateSite);
router.patch('/sites/:id/geocode', authenticateAdmin, villeController.saveGeocode);

// Onglet Écoles
router.get('/ecoles', authenticateAdmin, villeController.getEcoles);
router.post('/ecoles', authenticateAdmin, villeController.createEcole);
router.put('/ecoles/:id', authenticateAdmin, villeController.updateEcole);
router.delete('/ecoles/:id', authenticateAdmin, villeController.deleteEcole);

module.exports = router;
