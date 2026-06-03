'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('./deploiements.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Ordre important : routes spécifiques avant paramétré
router.get('/kpis',           authenticateJWT, ctrl.kpis);
router.get('/facets',         authenticateJWT, ctrl.facets);
router.get('/matches',        authenticateJWT, ctrl.matches);
router.get('/conflicts',      authenticateJWT, ctrl.conflicts);
router.get('/glpi-proposals', authenticateJWT, ctrl.glpiProposals);
router.get('/ad-match',       authenticateJWT, ctrl.adMatchGet);
router.post('/ad-match/run',  authenticateJWT, ctrl.adMatchRun);
router.post('/installateurs/merge', authenticateJWT, ctrl.mergeInstallateurs);
router.post('/merge',               authenticateJWT, ctrl.mergePair);
router.post('/types/rename',        authenticateJWT, ctrl.renameType);
router.get('/file',           authenticateJWT, ctrl.serveFile);
router.get('/preview',        authenticateJWT, ctrl.previewFile);
router.get('/',               authenticateJWT, ctrl.list);
router.patch('/:id',          authenticateJWT, ctrl.update);

module.exports = router;
