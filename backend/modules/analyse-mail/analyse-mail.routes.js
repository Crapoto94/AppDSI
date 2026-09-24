const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./analyse-mail.controller');

router.use(authenticateJWT);

router.get('/kpis', ctrl.kpis);
router.get('/signins/failed', ctrl.failedSignins);
router.post('/scan', ctrl.scan);

module.exports = router;
