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

// Engagements télécom (lecture dynamique depuis le suivi budgétaire, nature 6262)
router.get('/engagements', authenticateJWT, telecomController.getTelecomEngagements);

// Invoices
router.get('/invoices', authenticateJWT, telecomController.getInvoices);
router.post('/invoices/upload', authenticateJWT, upload.single('file'), telecomController.uploadInvoice);
router.put('/invoices/:id', authenticateJWT, telecomController.updateInvoice);
router.delete('/invoices/:id', authenticateJWT, telecomController.deleteInvoice);

module.exports = router;
