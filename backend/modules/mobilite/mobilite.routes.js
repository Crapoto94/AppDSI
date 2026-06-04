const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('./mobilite.controller');
const { authenticateJWT } = require('../../shared/middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.use(authenticateJWT);

// ─── Lecture (liste, historique, KPIs) ───────────────────────
router.get('/kpis', ctrl.kpis);
router.get('/filters', ctrl.filters);
router.get('/organisation', ctrl.organisation);

// ─── Cycle de vie via le module /stocks ──────────────────────
router.get('/store', ctrl.store);
router.get('/models', ctrl.listModels);
router.get('/stock', ctrl.listStock);
router.get('/attributions', ctrl.listAttributions);
router.post('/stock/entry', ctrl.stockEntry);
router.patch('/stock/serial/:id', ctrl.setSerial);
router.post('/import', upload.single('file'), ctrl.importExcel);

// Attribution en 2 phases
router.post('/attribute', ctrl.attribute);                                  // phase 1 (préparation)
router.post('/attributions/:key/deliver', upload.single('fiche'), ctrl.deliver); // phase 2 (remise)
router.post('/attributions/:key/cancel', ctrl.cancelAttribution);

// Retour
router.post('/return', ctrl.returnDevice);                                  // retour riche (fiche signée)
router.post('/devices/:key/return', ctrl.quickReturn);                      // retour 1-clic

router.get('/fiche/:id', ctrl.downloadFiche);

// ─── Routes paramétrées (en dernier) ─────────────────────────
router.get('/devices', ctrl.devices);
router.patch('/devices/:key', ctrl.updateDevice);
router.get('/devices/:key/events', ctrl.deviceEvents);

module.exports = router;
