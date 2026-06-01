const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdminUI } = require('../../shared/middleware');
const ctrl = require('./dsi-dashboard.controller');

// Accès réservé aux admins (admin OU superadmin). NB : dans ce codebase `authenticateAdmin`
// = superadmin uniquement → on utilise `authenticateAdminUI` (isAdminLike) pour inclure 'admin'.
router.use(authenticateJWT, authenticateAdminUI);

router.get('/',              (req, res) => ctrl.listDashboards(req, res));
router.post('/',             (req, res) => ctrl.createDashboard(req, res));
router.put('/:id',           (req, res) => ctrl.updateDashboard(req, res));
router.delete('/:id',        (req, res) => ctrl.deleteDashboard(req, res));

router.get('/:id/widgets',   (req, res) => ctrl.getWidgets(req, res));
router.put('/:id/widgets',   (req, res) => ctrl.saveWidgets(req, res));

router.get('/:id/subscription',  (req, res) => ctrl.getSubscription(req, res));
router.put('/:id/subscription',  (req, res) => ctrl.saveSubscription(req, res));
router.post('/:id/send-now',     (req, res) => ctrl.sendNow(req, res));

module.exports = router;
