'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('./deploiements.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Ordre important : routes spécifiques avant paramétré
router.get('/kpis',           authenticateJWT, ctrl.kpis);
router.get('/matches',        authenticateJWT, ctrl.matches);
router.get('/glpi-proposals', authenticateJWT, ctrl.glpiProposals);
router.get('/file',           authenticateJWT, ctrl.serveFile);
router.get('/',               authenticateJWT, ctrl.list);

module.exports = router;
