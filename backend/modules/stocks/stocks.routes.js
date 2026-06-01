const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const { requireStoreRole } = require('./middleware/store-permissions');
const ctrl = require('./stocks.controller');

const uploadPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// Toutes les routes nécessitent un JWT
router.use(authenticateJWT);

// ─── Rôle / magasins accessibles ─────────────────────────────
router.get('/my-role', ctrl.getMyRole);

// ─── Gabarits de BL ──────────────────────────────────────────
router.get('/bl-templates', ctrl.listBlTemplates);
router.get('/bl-templates/:id', ctrl.getBlTemplate);
router.post('/bl-templates', ctrl.createBlTemplate);
router.put('/bl-templates/:id', ctrl.updateBlTemplate);
router.delete('/bl-templates/:id', ctrl.deleteBlTemplate);
router.post('/bl-templates/:id/base', uploadPdf.single('file'), ctrl.uploadBlTemplateBase);

// ─── Catalogue articles (partagé) ────────────────────────────
// Déclaré avant /stores pour éviter toute ambiguïté de routage
router.get('/items', ctrl.listItems);
router.get('/items/:id', ctrl.getItem);
router.post('/items', ctrl.createItem);
router.put('/items/:id', ctrl.updateItem);
router.delete('/items/:id', ctrl.deleteItem);

// ─── Magasins ────────────────────────────────────────────────
router.get('/stores', ctrl.listStores);
router.post('/stores', authenticateAdmin, ctrl.createStore);
router.put('/stores/:id', authenticateAdmin, ctrl.updateStore);
router.delete('/stores/:id', authenticateAdmin, ctrl.deleteStore);

// ─── Membres / droits (manager) ──────────────────────────────
router.get('/stores/:storeId/members', requireStoreRole('manager'), ctrl.listMembers);
router.post('/stores/:storeId/members', requireStoreRole('manager'), ctrl.upsertMember);
router.delete('/stores/:storeId/members/:memberId', requireStoreRole('manager'), ctrl.removeMember);

// ─── Lieux de stockage ───────────────────────────────────────
router.get('/stores/:storeId/locations', requireStoreRole('viewer'), ctrl.listLocations);
router.post('/stores/:storeId/locations', requireStoreRole('manager'), ctrl.createLocation);
router.put('/stores/:storeId/locations/:id', requireStoreRole('manager'), ctrl.updateLocation);
router.delete('/stores/:storeId/locations/:id', requireStoreRole('manager'), ctrl.deleteLocation);

// ─── Niveaux de stock ────────────────────────────────────────
router.get('/stores/:storeId/stock-levels', requireStoreRole('viewer'), ctrl.getStockLevels);
router.put('/stores/:storeId/stock-levels/:id/threshold', requireStoreRole('manager'), ctrl.updateThreshold);

// ─── Mouvements ──────────────────────────────────────────────
router.get('/stores/:storeId/movements', requireStoreRole('viewer'), ctrl.listMovements);
router.post('/stores/:storeId/movements', requireStoreRole('operator'), ctrl.createMovement);

// ─── Lookup EAN / code-barres (Phase 2) ──────────────────────
router.get('/ean/:code', ctrl.eanLookup);

// ─── Commandes budgétaires (proxy lecture) ───────────────────
router.get('/stores/:storeId/orders', requireStoreRole('viewer'), ctrl.listOrders);

// ─── Réceptions (Phase 2) ────────────────────────────────────
router.get('/stores/:storeId/receptions', requireStoreRole('viewer'), ctrl.listReceptions);
router.post('/stores/:storeId/receptions', requireStoreRole('operator'), ctrl.createReception);
router.get('/stores/:storeId/receptions/:id', requireStoreRole('viewer'), ctrl.getReception);
router.post('/stores/:storeId/receptions/:id/lines', requireStoreRole('operator'), ctrl.addReceptionLine);
router.delete('/stores/:storeId/receptions/:id/lines/:lineId', requireStoreRole('operator'), ctrl.deleteReceptionLine);
router.post('/stores/:storeId/receptions/:id/validate', requireStoreRole('operator'), ctrl.validateReception);

// ─── Articles sérialisés (saisie différée des n° de série) ───
router.get('/stores/:storeId/serial-items', requireStoreRole('viewer'), ctrl.listSerialItems);
router.patch('/stores/:storeId/serial-items/:id', requireStoreRole('operator'), ctrl.setSerialNumber);

// ─── Sorties / livraisons — BL en 2 phases ───────────────────
router.get('/stores/:storeId/deliveries', requireStoreRole('viewer'), ctrl.listDeliveries);
router.post('/stores/:storeId/deliveries/prepare', requireStoreRole('operator'), ctrl.prepareDelivery);
router.post('/stores/:storeId/deliveries/:id/deliver', requireStoreRole('operator'), ctrl.deliverDelivery);
router.get('/stores/:storeId/deliveries/:id/bl.pdf', requireStoreRole('viewer'), ctrl.downloadBl);
router.get('/stores/:storeId/deliveries/:id', requireStoreRole('viewer'), ctrl.getDelivery);

// ─── Prêts (Phase 3) ─────────────────────────────────────────
router.get('/stores/:storeId/loans', requireStoreRole('viewer'), ctrl.listLoans);
router.post('/stores/:storeId/loans', requireStoreRole('operator'), ctrl.createLoan);
router.post('/stores/:storeId/loans/:id/return', requireStoreRole('operator'), ctrl.returnLoan);

// ─── Prévision / ruptures (Phase 3) ──────────────────────────
router.get('/stores/:storeId/forecast', requireStoreRole('viewer'), ctrl.getForecast);

module.exports = router;
