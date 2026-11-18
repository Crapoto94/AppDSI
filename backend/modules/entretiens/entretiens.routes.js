const express = require('express');
const router = express.Router();
const ctrl = require('./entretiens.controller');
const { authenticateJWT } = require('../../shared/middleware');

// Toutes les routes exigent un utilisateur connecté. Le module est « public »
// (visible par tous les agents via sa tuile), mais chaque route applique
// ensuite sa propre règle : agent / évaluateur / administrateur du module.

// Espace personnel et rôle
router.get('/me', authenticateJWT, ctrl.me);

// Tableaux de bord
router.get('/stats', authenticateJWT, ctrl.stats);
router.get('/evaluateur', authenticateJWT, ctrl.evaluatorList);

// Campagnes
router.get('/campaigns', authenticateJWT, ctrl.listCampaigns);
router.post('/campaigns', authenticateJWT, ctrl.createCampaign);
router.put('/campaigns/:id', authenticateJWT, ctrl.updateCampaign);

// Administrateurs délégués & paramètres
router.get('/admins', authenticateJWT, ctrl.listAdmins);
router.post('/admins', authenticateJWT, ctrl.addAdmin);
router.delete('/admins/:id', authenticateJWT, ctrl.removeAdmin);
router.get('/settings', authenticateJWT, ctrl.getSettings);
router.put('/settings', authenticateJWT, ctrl.updateSettings);

// Recherche d'agents (comptes AppDSI)
router.get('/users-search', authenticateJWT, ctrl.usersSearch);
// Agents du calendrier DSI + encadrants (/param/ville) avec évaluateur par défaut
router.get('/directory', authenticateJWT, ctrl.directory);
// Prochains créneaux libres (agent + évaluateur)
router.post('/free-slots', authenticateJWT, ctrl.freeSlots);

// Liste générale (admin : tout ; évaluateur : ses entretiens)
router.get('/', authenticateJWT, ctrl.list);
router.post('/', authenticateJWT, ctrl.create);

// Routes paramétrées — déclarées après les chemins spécifiques
router.get('/:id', authenticateJWT, ctrl.getOne);
router.put('/:id', authenticateJWT, ctrl.update);
router.delete('/:id', authenticateJWT, ctrl.remove);
router.put('/:id/preparation', authenticateJWT, ctrl.savePreparation);
router.post('/:id/submit', authenticateJWT, ctrl.submitPreparation);
router.put('/:id/evaluation', authenticateJWT, ctrl.saveEvaluation);
router.put('/:id/crep', authenticateJWT, ctrl.saveCrep);
router.put('/:id/planning', authenticateJWT, ctrl.planning);
router.get('/:id/crep.pdf', authenticateJWT, ctrl.crepPdf);
router.post('/:id/crep/check', authenticateJWT, ctrl.crepCheck);
router.post('/:id/crep/send-to-agent', authenticateJWT, ctrl.crepSendToAgent);
router.post('/:id/crep/agent-validate', authenticateJWT, ctrl.crepAgentValidate);
router.post('/:id/ai-draft', authenticateJWT, ctrl.aiDraft);
router.post('/:id/outlook', authenticateJWT, ctrl.resyncOutlook);

module.exports = router;
