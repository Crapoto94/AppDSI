const express = require('express');
const router = express.Router();
const villeController = require('./ville.controller');
const { authenticateAdmin } = require('../../shared/middleware');
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

// Onglet Sites
router.get('/sites', authenticateAdmin, villeController.getSites);
router.post('/sites/import', authenticateAdmin, upload.single('file'), villeController.importSites);
router.put('/sites/:id', authenticateAdmin, villeController.updateSite);

// Onglet Écoles
router.get('/ecoles', authenticateAdmin, villeController.getEcoles);
router.post('/ecoles', authenticateAdmin, villeController.createEcole);
router.put('/ecoles/:id', authenticateAdmin, villeController.updateEcole);
router.delete('/ecoles/:id', authenticateAdmin, villeController.deleteEcole);

module.exports = router;
