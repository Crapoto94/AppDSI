const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateFastControl } = require('../../shared/middleware');
const ctrl = require('./analyse-mail.controller');

router.use(authenticateJWT);

router.get('/kpis', ctrl.kpis);
router.get('/signins/failed', ctrl.failedSignins);
router.post('/scan', authenticateFastControl, ctrl.scan);

module.exports = router;
