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
router.post('/ping-save', authenticateJWT, copieursController.savePingResults);
router.post('/import-papercut', authenticateJWT, uploadExcel.single('file'), copieursController.importPapercut);
router.post('/import-kpax', authenticateJWT, uploadExcel.single('file'), copieursController.importKpax);
router.post('/import-emails', authenticateJWT, copieursController.importEmails);
router.post('/:id/move', authenticateJWT, copieursController.move);
router.get('/:id/moves', authenticateJWT, copieursController.getMoves);
router.get('/:id/interventions', authenticateJWT, copieursController.getInterventions);
router.post('/:id/interventions', authenticateJWT, copieursController.addIntervention);
router.delete('/:id/interventions/:interventionId', authenticateJWT, copieursController.deleteIntervention);

router.get('/:id/visites', authenticateJWT, copieursController.getVisites);
router.post('/:id/visites', authenticateJWT, uploadExcel.array('photos', 10), copieursController.addVisite);
router.delete('/:id/visites/:visiteId', authenticateJWT, copieursController.deleteVisite);

// ─── Compteurs ────────────────────────────────────────────────────────────────
router.get('/:id/compteurs',                                              authenticateJWT, copieursController.getCompteurs);
router.post('/:id/compteurs',                                             authenticateJWT, copieursController.createCompteur);
router.put('/:id/compteurs/:compteurId',                                  authenticateJWT, copieursController.updateCompteur);
router.delete('/:id/compteurs/:compteurId',                               authenticateJWT, copieursController.deleteCompteur);

// ─── Tarifs ───────────────────────────────────────────────────────────────────
router.get('/:id/compteurs/:compteurId/tarifs',                           authenticateJWT, copieursController.getTarifs);
router.post('/:id/compteurs/:compteurId/tarifs',                          authenticateJWT, copieursController.createTarif);
router.put('/:id/compteurs/:compteurId/tarifs/:tarifId',                  authenticateJWT, copieursController.updateTarif);
router.delete('/:id/compteurs/:compteurId/tarifs/:tarifId',               authenticateJWT, copieursController.deleteTarif);

// ─── Relevés ──────────────────────────────────────────────────────────────────
router.get('/:id/compteurs/:compteurId/releves',                          authenticateJWT, copieursController.getReleves);
router.post('/:id/compteurs/:compteurId/releves',                         authenticateJWT, copieursController.createReleve);
router.delete('/:id/compteurs/:compteurId/releves/:releveId',             authenticateJWT, copieursController.deleteReleve);

module.exports = router;
