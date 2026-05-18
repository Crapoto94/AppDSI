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
router.put('/agents/:username', authenticateJWT, agentsController.updateAgent);
router.post('/agents/:username/absences', authenticateJWT, agentsController.addAbsence);
router.delete('/agents/absences/:id', authenticateJWT, agentsController.deleteAbsence);
router.delete('/agents/:username', authenticateJWT, agentsController.deleteAgent);

module.exports = router;
