const express = require('express');
const router = express.Router();
const ctrl = require('./prets.controller');
const { authenticateJWT, authenticatePretsAdmin } = require('../../shared/middleware');
const multer = require('multer');

// Images (memoryStorage — écrites via shared/storage.js, cf. skill « ged »).
const uploadImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Type de fichier non autorisé. Utilisez PNG, JPEG ou WebP.'), allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
// Fiche scannée (remise/retour) — même limite que /mobilite.
const uploadFiche = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.use(authenticateJWT);

// ─── Lecture (tout agent connecté — DSI Hub ET MagApp) ───────────────────────
router.get('/categories', ctrl.getCategories);
router.get('/equipment', ctrl.getEquipment);
// Route littérale à déclarer AVANT /equipment/:id (même forme de chemin, cf.
// convention CLAUDE.md sur l'ordre des routes Express).
router.get('/equipment/availability-grid', ctrl.getAvailabilityGrid);
router.get('/equipment/:id', ctrl.getEquipmentById);
router.get('/equipment/:id/availability', ctrl.getDailyAvailability);
router.post('/equipment/:id/check-availability', ctrl.checkAvailability);

// ─── Réservations (auto-acceptées) ────────────────────────────────────────────
router.post('/loans', ctrl.createLoan);
router.get('/loans/mine', ctrl.getMyLoans);
router.post('/loans/:id/cancel', ctrl.cancelLoan);

// ─── Admin : catégories ────────────────────────────────────────────────────────
router.post('/admin/categories', authenticatePretsAdmin, ctrl.addCategory);
router.put('/admin/categories/:id', authenticatePretsAdmin, ctrl.updateCategory);
router.delete('/admin/categories/:id', authenticatePretsAdmin, ctrl.deleteCategory);

// ─── Admin : équipement ────────────────────────────────────────────────────────
router.post('/admin/equipment', authenticatePretsAdmin, ctrl.addEquipment);
router.put('/admin/equipment/:id', authenticatePretsAdmin, ctrl.updateEquipment);
router.delete('/admin/equipment/:id', authenticatePretsAdmin, ctrl.deleteEquipment);
router.post('/admin/equipment/:id/image', authenticatePretsAdmin, uploadImage.single('image'), ctrl.uploadEquipmentImage);

// ─── Admin : lots d'arrivée (dates de disponibilité du stock) ────────────────
router.get('/admin/equipment/:id/arrivals', authenticatePretsAdmin, ctrl.listArrivals);
router.post('/admin/equipment/:id/arrivals', authenticatePretsAdmin, ctrl.addArrival);
router.put('/admin/arrivals/:arrivalId', authenticatePretsAdmin, ctrl.updateArrival);
router.delete('/admin/arrivals/:arrivalId', authenticatePretsAdmin, ctrl.deleteArrival);

// ─── Admin : unités (n° d'inventaire) ─────────────────────────────────────────
router.get('/admin/equipment/:id/units', authenticatePretsAdmin, ctrl.listUnits);
router.post('/admin/equipment/:id/units', authenticatePretsAdmin, ctrl.addUnit);
router.put('/admin/units/:unitId', authenticatePretsAdmin, ctrl.updateUnit);
router.delete('/admin/units/:unitId', authenticatePretsAdmin, ctrl.deleteUnit);

// ─── Admin : réglages (délai de battement) ────────────────────────────────────
router.get('/admin/settings', authenticatePretsAdmin, ctrl.getSettings);
router.put('/admin/settings', authenticatePretsAdmin, ctrl.updateSettings);

// ─── Admin : prêts / remise / retour ──────────────────────────────────────────
router.get('/admin/loans', authenticatePretsAdmin, ctrl.getAllLoans);
router.get('/admin/loans/upcoming-returns', authenticatePretsAdmin, ctrl.getUpcomingReturns);
router.get('/admin/loans/:id', authenticatePretsAdmin, ctrl.getLoanById);
router.post('/admin/loans', authenticatePretsAdmin, ctrl.adminCreateLoan);
router.post('/admin/loans/:id/deliver', authenticatePretsAdmin, uploadFiche.single('fiche'), ctrl.deliverLoan);
router.post('/admin/loans/:id/return', authenticatePretsAdmin, uploadFiche.single('fiche'), ctrl.returnLoan);
// Remise / retour globaux d'une réservation (panier multi-matériel) — une seule
// signature + une seule fiche PDF listant chaque matériel fourni.
router.post('/admin/loans/deliver-batch', authenticatePretsAdmin, uploadFiche.single('fiche'), ctrl.deliverBatch);
router.post('/admin/loans/return-batch', authenticatePretsAdmin, uploadFiche.single('fiche'), ctrl.returnBatch);
router.post('/admin/loans/:id/cancel', authenticatePretsAdmin, (req, res, next) => { req.pretsAdmin = true; next(); }, ctrl.cancelLoan);

router.get('/admin/fiche/:docId', authenticatePretsAdmin, ctrl.downloadFiche);
router.get('/admin/kpis', authenticatePretsAdmin, ctrl.getKpis);

// Compteur simple pour le widget dashboard (même logique d'accès que /pending-count
// côté consommables : pas de restriction admin, juste JWT).
router.get('/kpis', ctrl.getKpis);

module.exports = router;
