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

// ─── Import Excel annuel compteurs ────────────────────────────────────────────
router.post('/import-compteur-excel',                                     authenticateJWT, uploadExcel.single('file'), copieursController.importCompteurExcel);
router.post('/from-import',                                               authenticateJWT, copieursController.createFromImport);

// ─── Codes compteur par marque (AVANT /:id — sinon Express capture "compteur-codes" comme id) ──
router.get('/kpi',                                                        authenticateJWT, copieursController.getKPI);
router.get('/mainteneurs',                                                authenticateJWT, copieursController.getMainteneurs);
router.get('/compteur-codes',                                             authenticateJWT, copieursController.getCompteurCodes);
router.post('/compteur-codes',                                            authenticateJWT, copieursController.createCompteurCode);
router.put('/compteur-codes/:codeId',                                     authenticateJWT, copieursController.updateCompteurCode);
router.delete('/compteur-codes/:codeId',                                  authenticateJWT, copieursController.deleteCompteurCode);
router.post('/compteur-codes/:codeId/tarifs',                             authenticateJWT, copieursController.createCodeTarif);
router.put('/compteur-codes/:codeId/tarifs/:tarifId',                     authenticateJWT, copieursController.updateCodeTarif);
router.delete('/compteur-codes/:codeId/tarifs/:tarifId',                  authenticateJWT, copieursController.deleteCodeTarif);

// ─── Routes par copieur (/:id en dernier pour les GET génériques) ─────────────
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

// ─── Relevés trimestriels par copieur ─────────────────────────────────────────
router.get('/:id/releves',                                                authenticateJWT, copieursController.getCopieurReleves);
router.post('/:id/releves',                                               authenticateJWT, copieursController.addCopieurReleve);
router.delete('/:id/releves/:releveId',                                   authenticateJWT, copieursController.deleteCopieurReleve);

module.exports = router;
