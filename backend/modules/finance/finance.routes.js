const express = require('express');
const router = express.Router();
const financeController = require('./finance.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Debug routes
router.get('/debug/invoices-count', authenticateJWT, async (req, res) => {
    try {
        const result = await require('../../shared/database').pool.query('SELECT COUNT(*) FROM oracle.gf_oracle_facture');
        res.json({ count: result.rows[0].count, message: 'Factures en base' });
    } catch (e) {
        res.json({ error: e.message, message: 'Erreur vérification factures' });
    }
});

router.get('/debug/orders-count', authenticateJWT, async (req, res) => {
    try {
        const result = await require('../../shared/database').pool.query('SELECT COUNT(*) FROM oracle.gf_oracle_commande');
        res.json({ count: result.rows[0].count, message: 'Commandes en base' });
    } catch (e) {
        res.json({ error: e.message, message: 'Erreur vérification commandes' });
    }
});

router.get('/debug/orders-sample', authenticateJWT, async (req, res) => {
    try {
        const result = await require('../../shared/database').pool.query('SELECT "COMMANDE_COMMANDE", "COMMANDE_CMD_DATECOMMANDE", "COMMANDE_MONTANT_TTC" FROM oracle.gf_oracle_commande LIMIT 5');
        res.json({ rows: result.rows, message: 'Sample de 5 commandes' });
    } catch (e) {
        res.json({ error: e.message, message: 'Erreur lecture sample' });
    }
});

// Operations CRUD
router.get('/operations', authenticateJWT, financeController.getOperations);
router.get('/operations/:id/orders', authenticateJWT, financeController.getOperationOrders);
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
