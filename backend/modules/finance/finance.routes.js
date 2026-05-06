const express = require('express');
const router = express.Router();
const financeController = require('./finance.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Operations CRUD
router.get('/operations', authenticateJWT, financeController.getOperations);
router.post('/operations', authenticateAdminOrFinances, financeController.createOperation);
router.put('/operations/:id', authenticateAdminOrFinances, financeController.updateOperation);
router.delete('/operations/:id', authenticateAdminOrFinances, financeController.deleteOperation);

// Invoices & Lines
router.get('/invoices', authenticateJWT, financeController.getInvoices);
router.get('/lines', authenticateJWT, financeController.getLines);

// Orders
router.get('/orders', authenticateJWT, financeController.getOrders);
router.get('/orders/years', authenticateJWT, financeController.getOrderYears);
router.post('/orders/bulk-assign', authenticateJWT, financeController.bulkAssign);
router.post('/orders/:id/assign-operation', authenticateJWT, financeController.assignOperation);

// Imports & Scanning
router.post('/scan-exercice', authenticateAdminOrFinances, upload.single('file'), financeController.scanExercice);
router.post('/import-lines', authenticateAdminOrFinances, upload.single('file'), financeController.importLines);
router.post('/import-invoices', authenticateAdminOrFinances, upload.single('file'), financeController.importInvoices);
router.post('/import-orders', authenticateAdminOrFinances, upload.single('file'), financeController.importOrders);

module.exports = router;
