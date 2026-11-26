const express = require('express');
const router = express.Router();
const ctrl = require('./entretiens.controller');
const backlog = require('./backlog');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const uploadBatch = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });
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
const uploadBacklog = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });
router.post('/backlog', authenticateJWT, uploadBacklog.array('files', 5), backlog.create);
router.get('/backlog/pieces/:id', authenticateJWT, backlog.piece);
router.get('/backlog/mine', authenticateJWT, backlog.mine);
router.get('/backlog/all', authenticateJWT, backlog.all);
router.get('/backlog/:id/comments', authenticateJWT, backlog.comments);
router.post('/backlog/:id/comments', authenticateJWT, uploadBacklog.array('files', 3), backlog.comment);
router.get('/backlog', authenticateJWT, backlog.list);
router.post('/backlog/:id/decide', authenticateJWT, backlog.decide);
router.delete('/backlog/:id', authenticateJWT, backlog.remove);
router.get('/reopen-requests', authenticateJWT, ctrl.reopenRequestList);
router.post('/reopen-requests/:id/decide', authenticateJWT, ctrl.reopenRequestDecide);
router.post('/:id/reopen-request', authenticateJWT, ctrl.reopenRequestCreate);
router.post('/campaigns/:id/close', authenticateJWT, ctrl.closeCampaign);
router.post('/:id/crep/unvalidate', authenticateJWT, ctrl.crepUnvalidate);
router.post('/drh-reception', authenticateJWT, ctrl.drhReception);
// Suivi de CREP + numérisation en lot (administrateurs) — avant les routes /:id
router.get('/returns/summary', authenticateJWT, ctrl.returnsSummary);
router.get('/returns/pending', authenticateJWT, ctrl.returnsPending);
router.get('/returns/batches', authenticateJWT, ctrl.returnsList);
router.post('/returns/batches', authenticateJWT, uploadBatch.single('file'), ctrl.returnsCreate);
router.get('/returns/batches/:id', authenticateJWT, ctrl.returnsGet);
router.delete('/returns/batches/:id', authenticateJWT, ctrl.returnsDelete);
router.get('/returns/batches/:id/pages/:idx', authenticateJWT, ctrl.returnsPage);
router.put('/returns/batches/:id/pages/:idx', authenticateJWT, ctrl.returnsAssign);
router.post('/returns/batches/:id/confirm', authenticateJWT, ctrl.returnsConfirm);
router.post('/returns/batches/:id/reanalyse', authenticateJWT, ctrl.returnsReanalyse);
router.put('/returns/batches/:id/group', authenticateJWT, ctrl.returnsAssignGroup);
router.delete('/returns/entretien/:id', authenticateJWT, ctrl.returnsDeleteReturn);
router.get('/returns/reading/:entretienId', authenticateJWT, ctrl.returnsReading);

// Administrateurs délégués & paramètres
router.get('/admins', authenticateJWT, ctrl.listAdmins);
router.post('/admins', authenticateJWT, ctrl.addAdmin);
router.delete('/admins/:id', authenticateJWT, ctrl.removeAdmin);
router.get('/pilotage-users', authenticateJWT, ctrl.listPilotage);
router.post('/pilotage-users', authenticateJWT, ctrl.addPilotage);
router.delete('/pilotage-users/:id', authenticateJWT, ctrl.removePilotage);
router.get('/settings', authenticateJWT, ctrl.getSettings);
router.put('/settings', authenticateJWT, ctrl.updateSettings);
router.get('/help-contents', authenticateJWT, ctrl.listHelpContents);
router.put('/help-contents/:key', authenticateJWT, ctrl.saveHelpContent);
router.delete('/help-contents/:key', authenticateJWT, ctrl.deleteHelpContent);

// Recherche d'agents (comptes AppDSI)
router.get('/users-search', authenticateJWT, ctrl.usersSearch);
// Agents du calendrier DSI + encadrants (/param/ville) avec évaluateur par défaut
router.get('/directory', authenticateJWT, ctrl.directory);
// Prochains créneaux libres (agent + évaluateur)
router.post('/free-slots', authenticateJWT, ctrl.freeSlots);

router.get('/formations', authenticateJWT, ctrl.formationsGlobales);
router.get('/version', authenticateJWT, ctrl.moduleVersion);
router.get('/mail-templates', authenticateJWT, ctrl.listMailTemplates);
router.put('/mail-templates/:id', authenticateJWT, ctrl.saveMailTemplate);
router.post('/mail-templates/:id/preview', authenticateJWT, ctrl.previewMailTemplate);
router.get('/prompts', authenticateJWT, ctrl.listPrompts);
router.put('/prompts/:id', authenticateJWT, ctrl.savePrompt);
router.put('/simulation', authenticateJWT, ctrl.setSimulation);
router.put('/:id/crep/mode', authenticateJWT, ctrl.crepMode);
router.post('/:id/crep/close', authenticateJWT, ctrl.crepClose);
router.post('/simulation/reset', authenticateJWT, ctrl.resetSimulation);
router.post('/formations/analyse', authenticateJWT, ctrl.formationsAnalyse);
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
router.get('/:id/crep/form.pdf', authenticateJWT, ctrl.crepFormPdf);
router.post('/:id/crep/form-import', authenticateJWT, uploadPdf.single('file'), ctrl.crepFormImport);
router.get('/:id/crep/digital.pdf', authenticateJWT, ctrl.crepDigitalPdf);
router.get('/:id/crep-signe.pdf', authenticateJWT, ctrl.crepSignedPdf);
router.post('/:id/crep/scan', authenticateJWT, uploadPdf.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 8 }]), ctrl.crepScan);
router.get('/:id/crep/scan/latest', authenticateJWT, ctrl.crepScanLatest);
router.post('/:id/crep/scan/:jobId/ack', authenticateJWT, ctrl.crepScanAck);
router.get('/:id/crep/scans/:idx.pdf', authenticateJWT, ctrl.crepScanFile);
router.get('/:id/crep/scan/:jobId/file.pdf', authenticateJWT, ctrl.crepScanJobFile);
router.post('/:id/crep/simple-sent', authenticateJWT, ctrl.crepSimpleSent);
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
