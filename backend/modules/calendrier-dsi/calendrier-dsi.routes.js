const express = require('express');
const router = express.Router();
const controller = require('./calendrier-dsi.controller');
const agentsController = require('./agents-dsi.controller');
const { authenticateJWT } = require('../../shared/middleware');

router.get('/evenements', authenticateJWT, controller.getEvenements);
router.post('/evenements', authenticateJWT, controller.createEvenement);
router.put('/evenements/:id', authenticateJWT, controller.updateEvenement);
router.delete('/evenements/:id', authenticateJWT, controller.deleteEvenement);

router.post('/send-daily', authenticateJWT, controller.sendDailyCalendar);

router.get('/agents', authenticateJWT, agentsController.getAgents);
router.post('/agents', authenticateJWT, agentsController.createAgent);
router.get('/agents/search-matricule', authenticateJWT, agentsController.searchMatricule);
router.post('/sync-demabs', authenticateJWT, agentsController.syncDemabs);
router.get('/demabs-sync-info', authenticateJWT, agentsController.getDemabsSyncInfo);
router.put('/agents/:username', authenticateJWT, agentsController.updateAgent);
router.put('/agents/:username/matricule', authenticateJWT, agentsController.linkMatricule);
router.post('/agents/:username/absences', authenticateJWT, agentsController.addAbsence);
router.delete('/agents/absences/:id', authenticateJWT, agentsController.deleteAbsence);
router.delete('/agents/:username', authenticateJWT, agentsController.deleteAgent);

router.get('/hotline/agents', authenticateJWT, controller.listHotlineAgents);
router.get('/hotline/defaults/:agent_username', authenticateJWT, controller.getHotlineDefaults);
router.put('/hotline/defaults/:agent_username', authenticateJWT, controller.saveHotlineDefaults);
router.post('/hotline/override', authenticateJWT, controller.toggleHotlineOverride);
router.get('/hotline/overrides/:agent_username', authenticateJWT, controller.getHotlineOverrides);
router.get('/hotline/count/:date/:periode', authenticateJWT, controller.getHotlineCount);

router.get('/vacances', authenticateJWT, controller.getVacances);
router.post('/vacances', authenticateJWT, controller.addVacance);
router.delete('/vacances/:id', authenticateJWT, controller.deleteVacance);

module.exports = router;