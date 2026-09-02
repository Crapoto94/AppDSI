const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('./infra.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');

// Fichier Excel de vérification RH Studio : lu en mémoire (pas de business
// logic serveur, juste parsing + renvoi des en-têtes/lignes au frontend).
const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateJWT);

// ── Définitions d'API externes ─────────────────────────────────────
router.get('/apis',                authenticateAdmin, ctrl.listApis);
router.put('/apis/:key',           authenticateAdmin, ctrl.updateApi);
router.post('/apis/:key/test',     authenticateAdmin, ctrl.testApi);

// ── Synchronisations ───────────────────────────────────────────────
router.post('/sync/reseau',        authenticateAdmin, ctrl.syncReseau);

// ── Présence agents (RH Studio) ────────────────────────────────────
router.get('/agents/presence',     ctrl.agentPresence);
router.post('/agents/presence/parse-excel', uploadExcel.single('file'), ctrl.parseAgentsExcel);
router.post('/agents/presence/batch',       ctrl.verifyAgentsBatch);

module.exports = router;
