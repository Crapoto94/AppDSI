const express = require('express');
const router = express.Router();
const ctrl = require('./parc.controller');
const live = require('./parc.live.controller');
const hub = require('./parc.hub.controller');
const ad = require('./parc.ad.controller');
const { authenticateJWT, authenticateGLPIControl } = require('../../shared/middleware');

// ── Synchronisation depuis GLPI 10 (réservée au contrôle GLPI/admin) ──────────
router.post('/sync', authenticateGLPIControl, ctrl.syncParc);
router.post('/sync-infocoms', authenticateGLPIControl, ctrl.syncInfocomsOnly);
router.get('/sync-progress', authenticateGLPIControl, ctrl.getParcSyncProgress);
router.post('/sync-usagers', authenticateGLPIControl, ctrl.syncUsagers);
router.get('/sync-usagers-progress', authenticateGLPIControl, ctrl.getUsagerSyncProgress);
router.get('/usagers', authenticateJWT, ctrl.getUsagers);

// ── Proxy de téléchargement de document (images de modèles + pièces jointes) ──
router.get('/file/document/:id', authenticateJWT, ctrl.downloadDocument);

// ── LIVE (API GLPI 10 directe, sans synchro) ──────────────────────────────────
// Ordre : routes spécifiques avant les routes paramétrées.
router.get('/live/health', authenticateJWT, live.health);
router.get('/live/kpis', authenticateJWT, live.kpis);
router.get('/live/usagers-equip', authenticateJWT, live.usagersEquip);
router.get('/live/:type/filters', authenticateJWT, live.filters);
router.get('/live/:type/:id', authenticateJWT, live.item);
router.get('/live/:type', authenticateJWT, live.list);

// ── HUB (lecture des données synchronisées, même format que LIVE) ─────────────
router.get('/hub/health', authenticateJWT, hub.health);
router.get('/hub/kpis', authenticateJWT, hub.kpis);
router.get('/hub/stock-summary', authenticateJWT, hub.stockSummary);
router.get('/hub/usagers-equip', authenticateJWT, hub.usagersEquip);
router.get('/hub/by-email',      authenticateJWT, hub.byEmail);
router.get('/hub/:type/filters', authenticateJWT, hub.filters);
router.patch('/hub/:type/:id', authenticateJWT, hub.updateContactNum);
router.post('/hub/:type/:id/swap-contact', authenticateJWT, hub.swapContact);
router.post('/hub/:type/:id/ad-lookup', authenticateJWT, hub.adLookup);
router.patch('/hub/:type/:id/contact', authenticateJWT, hub.updateContact);
router.get('/hub/:type/:id', authenticateJWT, hub.item);
router.get('/hub/:type', authenticateJWT, hub.list);

// ── AD Computers (import depuis l'Active Directory) ───────────────────────────
router.get('/ad/computers', authenticateJWT, ad.getComputers);
router.post('/ad/import', authenticateJWT, ad.importComputers);
router.get('/ad/import-progress', authenticateJWT, ad.getImportProgress);

// ── Consultation des tables synchronisées (hub_parc) ──────────────────────────
router.get('/stats', authenticateJWT, ctrl.getStats);
router.get('/:type', authenticateJWT, ctrl.getItems);

module.exports = router;
