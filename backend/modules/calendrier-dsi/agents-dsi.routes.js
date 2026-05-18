const express = require('express');
const router = express.Router();
const controller = require('./agents-dsi.controller');
const { authenticateJWT } = require('../../shared/middleware');

router.get('/agents', authenticateJWT, controller.getAgents);
router.post('/agents', authenticateJWT, controller.createAgent);
router.put('/agents/:username', authenticateJWT, controller.updateAgent);
router.post('/agents/:username/absences', authenticateJWT, controller.addAbsence);
router.delete('/agents/absences/:id', authenticateJWT, controller.deleteAbsence);
router.delete('/agents/:username', authenticateJWT, controller.deleteAgent);

module.exports = router;
