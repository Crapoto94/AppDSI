const express = require('express');
const router = express.Router();
const ctrl = require('./infra.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');

router.use(authenticateJWT);

// ── Définitions d'API externes ─────────────────────────────────────
router.get('/apis',                authenticateAdmin, ctrl.listApis);
router.put('/apis/:key',           authenticateAdmin, ctrl.updateApi);
router.post('/apis/:key/test',     authenticateAdmin, ctrl.testApi);

// ── Synchronisations ───────────────────────────────────────────────
router.post('/sync/reseau',        authenticateAdmin, ctrl.syncReseau);

module.exports = router;
