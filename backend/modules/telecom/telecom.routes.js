const express = require('express');
const router = express.Router();
const telecomController = require('./telecom.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');

// Multer config for telecom invoices (memory storage - sauvegarde via storage service)
const upload = multer({ storage: multer.memoryStorage() });

// Operators
router.get('/operators', authenticateJWT, telecomController.getOperators);
router.post('/operators', authenticateAdmin, telecomController.createOperator);
router.put('/operators/:id', authenticateAdmin, telecomController.updateOperator);
router.delete('/operators/:id', authenticateAdmin, telecomController.deleteOperator);

// Billing Accounts
router.get('/billing-accounts', authenticateJWT, telecomController.getBillingAccounts);
router.get('/operators/:operatorId/accounts', authenticateJWT, telecomController.getOperatorAccounts);
router.post('/billing-accounts', authenticateAdmin, telecomController.createBillingAccount);
router.put('/billing-accounts/:id', authenticateAdmin, telecomController.updateBillingAccount);
router.delete('/billing-accounts/:id', authenticateAdmin, telecomController.deleteBillingAccount);
router.get('/billing-accounts/:id/available-invoices', authenticateJWT, telecomController.getAvailableInvoicesForAccount);
router.put('/billing-accounts/:id/monthly-comment', authenticateJWT, telecomController.upsertMonthlyComment);

// Engagements télécom (lecture dynamique depuis le suivi budgétaire, nature 6262)
router.get('/engagements', authenticateJWT, telecomController.getTelecomEngagements);

// Lignes fixes & accès internet (import Excel opérateur, ré-importable)
router.get('/lines', authenticateJWT, telecomController.getLines);
router.get('/lines/stats', authenticateJWT, telecomController.getLinesStats);
router.post('/lines/import', authenticateAdmin, upload.single('file'), telecomController.importLines);
router.delete('/lines/:id', authenticateAdmin, telecomController.deleteLine);

// Facturation par ligne (import ZIP export opérateur SFR)
router.post('/billing/import', authenticateAdmin, upload.single('file'), telecomController.importBilling);
router.get('/billing/periods', authenticateJWT, telecomController.getBillingPeriods);
router.get('/billing/stats', authenticateJWT, telecomController.getBillingStats);
router.get('/billing/trend', authenticateJWT, telecomController.getBillingTrend);
router.get('/billing/lines', authenticateJWT, telecomController.getBillingLines);
router.get('/billing/reconciliation', authenticateJWT, telecomController.getReconciliation);
router.get('/billing/line/:number', authenticateJWT, telecomController.getLineHistory);

// PDF des factures (duplicatas) stockés en GED, indexés par n° de facture
router.post('/billing/invoices/import', authenticateAdmin, upload.single('file'), telecomController.importBillingInvoices);
router.get('/billing/invoice-files', authenticateJWT, telecomController.getInvoiceFiles);

// Invoices
router.get('/invoices', authenticateJWT, telecomController.getInvoices);
router.get('/invoices/monthly-summary', authenticateJWT, telecomController.getMonthlySummary);
router.post('/invoices/import-suivi', authenticateAdmin, upload.single('file'), telecomController.importSuivi);
router.post('/invoices/from-budget', authenticateJWT, telecomController.addInvoiceFromBudget);
router.post('/invoices/reject', authenticateJWT, telecomController.rejectBudgetInvoice);
router.get('/invoices/rejected', authenticateJWT, telecomController.getRejectedInvoices);
router.post('/invoices/upload', authenticateJWT, upload.single('file'), telecomController.uploadInvoice);
router.put('/invoices/:id', authenticateJWT, telecomController.updateInvoice);
router.patch('/invoices/:id', authenticateJWT, telecomController.updateInvoiceMeta);
router.delete('/invoices/:id', authenticateJWT, telecomController.deleteInvoice);

module.exports = router;
