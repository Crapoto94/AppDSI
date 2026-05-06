const express = require('express');
const router = express.Router();
const telecomController = require('./telecom.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');

// Multer config for telecom invoices
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', '..', 'file_telecom'));
    },
    filename: (req, file, cb) => {
        const targetId = (req.body.target_id || 'unknown').replace(/[^a-z0-9]/gi, '_');
        cb(null, `${targetId}_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

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

// Commitments
router.get('/commitments', authenticateJWT, telecomController.getCommitments);
router.post('/commitments', authenticateAdmin, telecomController.createCommitment);
router.put('/commitments/:id', authenticateAdmin, telecomController.updateCommitment);
router.delete('/commitments/:id', authenticateAdmin, telecomController.deleteCommitment);

// Invoices
router.get('/invoices', authenticateJWT, telecomController.getInvoices);
router.post('/invoices/upload', authenticateJWT, upload.single('file'), telecomController.uploadInvoice);
router.put('/invoices/:id', authenticateJWT, telecomController.updateInvoice);
router.delete('/invoices/:id', authenticateJWT, telecomController.deleteInvoice);

module.exports = router;
