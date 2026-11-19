const express = require('express');
const router = express.Router();
const ctrl = require('./ep-ville.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Chaque route applique sa règle : administrateur de l'application (désignation des valideurs) ou valideur désigné.
router.get('/me', authenticateJWT, ctrl.me);

// Référentiel SEDIT RH
router.get('/rh/agents', authenticateJWT, ctrl.rhSearch);
router.get('/rh/candidats', authenticateJWT, ctrl.rhCandidats);
router.get('/rh/directions', authenticateJWT, ctrl.rhDirections);

// Administration : valideurs
router.get('/valideurs', authenticateJWT, ctrl.listValideurs);
router.post('/valideurs', authenticateJWT, ctrl.addValideur);
router.put('/valideurs/:id', authenticateJWT, ctrl.updateValideur);
router.delete('/valideurs/:id', authenticateJWT, ctrl.removeValideur);
router.get('/valideurs/:id/agents', authenticateJWT, ctrl.valideurAgents);
router.put('/rattachements/:id', authenticateJWT, ctrl.reassign);

// Espace valideur
router.get('/mon-perimetre', authenticateJWT, ctrl.monPerimetre);
router.get('/mes-agents', authenticateJWT, ctrl.mesAgents);
router.post('/mes-agents', authenticateJWT, ctrl.addAgents);
router.delete('/mes-agents/:id', authenticateJWT, ctrl.removeAgent);

module.exports = router;
