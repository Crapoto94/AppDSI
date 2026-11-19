const express = require('express');
const router = express.Router();
const ctrl = require('./ep-ville.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Chaque route applique sa règle : administrateur de l'application (désignation des valideurs) ou valideur désigné.
router.get('/me', authenticateJWT, ctrl.me);

// Référentiel SEDIT RH
router.get('/rh/agents', authenticateJWT, ctrl.rhSearch);
router.get('/rh/candidats', authenticateJWT, ctrl.rhCandidats);
router.get('/rh/recherche', authenticateJWT, ctrl.rhRecherche);
router.get('/ad/search', authenticateJWT, ctrl.adSearch);
router.post('/valideurs/resolve', authenticateJWT, ctrl.resolveRh);
router.get('/rh/directions', authenticateJWT, ctrl.rhDirections);

// Administration : valideurs
router.get('/valideurs', authenticateJWT, ctrl.listValideurs);
router.get('/valideurs/agents', authenticateJWT, ctrl.allAgents);
router.post('/valideurs', authenticateJWT, ctrl.addValideur);
router.put('/valideurs/:id', authenticateJWT, ctrl.updateValideur);
router.delete('/valideurs/:id', authenticateJWT, ctrl.removeValideur);
router.get('/valideurs/:id/agents', authenticateJWT, ctrl.valideurAgents);
router.put('/rattachements/:id', authenticateJWT, ctrl.reassign);
router.post('/dsi/rattacher', authenticateJWT, ctrl.reconcileDsi);

// Espace valideur
router.get('/mon-perimetre', authenticateJWT, ctrl.monPerimetre);
router.get('/mes-agents', authenticateJWT, ctrl.mesAgents);
router.get('/equipe', authenticateJWT, ctrl.equipe);
router.post('/mes-agents/importer-dsi', authenticateJWT, ctrl.importerDsi);
router.post('/mes-agents', authenticateJWT, ctrl.addAgents);
router.post('/mes-agents/:id/valideur', authenticateJWT, ctrl.promote);
router.delete('/mes-agents/:id/valideur', authenticateJWT, ctrl.demote);
router.put('/mes-agents/:id/compte-ad', authenticateJWT, ctrl.linkAd);
router.delete('/mes-agents/:id/compte-ad', authenticateJWT, ctrl.unlinkAd);
router.delete('/mes-agents/:id', authenticateJWT, ctrl.removeAgent);

module.exports = router;
