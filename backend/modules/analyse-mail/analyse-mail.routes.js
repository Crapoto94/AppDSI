const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./analyse-mail.controller');

router.use(authenticateJWT);

router.get('/kpis', ctrl.kpis);

module.exports = router;
