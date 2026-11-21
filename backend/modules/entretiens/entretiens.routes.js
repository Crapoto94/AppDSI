const express = require('express');
const router = express.Router();
const ctrl = require('./entretiens.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const uploadPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Toutes les routes exigent un utilisateur connecté. Le module est « public »
// (visible par tous les agents via sa tuile), mais chaque route applique
// ensuite sa propre règle : agent / évaluateur / administrateur du module.

// Espace personnel et rôle
router.get('/me', authenticateJWT, ctrl.me);
router.get('/magapp-url', authenticateJWT, ctrl.magappUrl);

// Tableaux de bord
router.get('/stats', authenticateJWT, ctrl.stats);
router.get('/evaluateur', authenticateJWT, ctrl.evaluatorList);
router.get('/evaluateur/sans-evaluateur', authenticateJWT, ctrl.listUnassigned);
router.post('/evaluateur/agents/:id/claim', authenticateJWT, ctrl.claimAgent);
router.post('/print/crep', authenticateJWT, ctrl.printCrep);
router.get('/audit-logs', authenticateJWT, ctrl.auditLogs);

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

router.get('/export.xlsx', authenticateJWT, ctrl.exportXlsx);

// Relances automatiques (déclenchement manuel, administrateurs)
router.post('/relances/run', authenticateJWT, ctrl.runRelances);

// Liste générale (admin : tout ; évaluateur : ses entretiens)
router.get('/', authenticateJWT, ctrl.list);
router.post('/', authenticateJWT, ctrl.create);

// Routes paramétrées — déclarées après les chemins spécifiques
router.get('/:id/evaluator-candidates', authenticateJWT, ctrl.evaluatorCandidates);
router.post('/:id/reassign-evaluator', authenticateJWT, ctrl.reassignEvaluator);
router.post('/:id/link-ad', authenticateJWT, ctrl.linkAgentAd);
router.get('/:id', authenticateJWT, ctrl.getOne);
router.put('/:id', authenticateJWT, ctrl.update);
router.delete('/:id', authenticateJWT, ctrl.remove);
router.put('/:id/preparation', authenticateJWT, ctrl.savePreparation);
router.post('/:id/submit', authenticateJWT, ctrl.submitPreparation);
router.put('/:id/evaluation', authenticateJWT, ctrl.saveEvaluation);
router.put('/:id/crep', authenticateJWT, ctrl.saveCrep);
router.put('/:id/planning', authenticateJWT, ctrl.planning);
router.get('/:id/crep.pdf', authenticateJWT, ctrl.crepPdf);
router.get('/:id/crep-signe.pdf', authenticateJWT, ctrl.crepSignedPdf);
router.post('/:id/crep/scan', authenticateJWT, uploadPdf.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 8 }]), ctrl.crepScan);
router.get('/:id/crep/scan/latest', authenticateJWT, ctrl.crepScanLatest);
router.post('/:id/crep/scan/:jobId/ack', authenticateJWT, ctrl.crepScanAck);
router.post('/:id/crep/signed-upload', authenticateJWT, uploadPdf.single('file'), ctrl.crepSignedUpload);
router.post('/:id/crep/manuscript', authenticateJWT, uploadPdf.array('files', 8), ctrl.crepManuscriptUpload);
router.post('/:id/reset', authenticateJWT, ctrl.resetEntretien);
router.post('/:id/crep/check', authenticateJWT, ctrl.crepCheck);
router.post('/:id/crep/send-to-agent', authenticateJWT, ctrl.crepSendToAgent);
router.put('/:id/crep/agent-draft', authenticateJWT, ctrl.crepAgentDraft);
router.post('/:id/crep/recall', authenticateJWT, ctrl.crepRecall);
router.post('/:id/crep/agent-validate', authenticateJWT, ctrl.crepAgentValidate);
router.post('/:id/ai-draft', authenticateJWT, ctrl.aiDraft);
router.post('/:id/outlook', authenticateJWT, ctrl.resyncOutlook);

module.exports = router;
