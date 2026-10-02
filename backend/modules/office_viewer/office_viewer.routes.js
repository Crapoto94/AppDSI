const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./office_viewer.controller');

router.get('/status', authenticateJWT, ctrl.status);
router.post('/prepare', authenticateJWT, express.raw({ type: () => true, limit: '64mb' }), ctrl.prepare);
router.get('/source/:ticket', ctrl.source);

module.exports = router;
