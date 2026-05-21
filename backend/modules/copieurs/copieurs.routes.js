const express = require('express');
const router = express.Router();
const copieursController = require('./copieurs.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadExcel = multer({ dest: 'uploads/' });

router.get('/', authenticateJWT, copieursController.getAll);
router.get('/map', authenticateJWT, copieursController.getMapData);
router.get('/search/address', authenticateJWT, copieursController.searchAddress);
router.get('/boundary', copieursController.getBoundary);
router.get('/interventions/all', authenticateJWT, copieursController.getAllInterventions);
router.get('/interventions/:interventionId/email-link', authenticateJWT, copieursController.getEmailLink);
router.get('/intervention-counts', authenticateJWT, copieursController.getInterventionCounts);
router.get('/:id', authenticateJWT, copieursController.getById);
router.post('/', authenticateJWT, copieursController.create);
router.put('/:id', authenticateJWT, copieursController.update);
router.put('/:id/archive', authenticateJWT, copieursController.archive);
router.delete('/:id', authenticateJWT, copieursController.delete);
router.post('/geocode-all', authenticateJWT, copieursController.geocodeAll);
router.post('/import-excel', authenticateJWT, uploadExcel.single('file'), copieursController.importExcel);
router.post('/import-archives', authenticateJWT, uploadExcel.single('file'), copieursController.importArchives);
router.post('/ping-all', authenticateJWT, copieursController.pingAll);
router.post('/import-papercut', authenticateJWT, uploadExcel.single('file'), copieursController.importPapercut);
router.post('/import-emails', authenticateJWT, copieursController.importEmails);
router.post('/:id/move', authenticateJWT, copieursController.move);
router.get('/:id/moves', authenticateJWT, copieursController.getMoves);
router.get('/:id/interventions', authenticateJWT, copieursController.getInterventions);
router.post('/:id/interventions', authenticateJWT, copieursController.addIntervention);
router.delete('/:id/interventions/:interventionId', authenticateJWT, copieursController.deleteIntervention);

module.exports = router;
