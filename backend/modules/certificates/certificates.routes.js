const express = require('express');
const router = express.Router();
const certificatesController = require('./certificates.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage config consistent with source
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'file_certif';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage });
const uploadExcel = multer({ dest: 'uploads/' });

// Routes
router.get('/', authenticateJWT, certificatesController.getCertificates);
router.post('/', authenticateJWT, certificatesController.createCertificate);
router.delete('/:id', authenticateJWT, certificatesController.deleteCertificate);
router.put('/:id', authenticateJWT, certificatesController.updateCertificate);
router.put('/:id/renewal', authenticateJWT, certificatesController.updateRenewal);
router.put('/:id/expiry', authenticateJWT, certificatesController.updateExpiry);

// File handling
router.post('/:id/file', authenticateJWT, upload.single('file'), certificatesController.attachFile);
router.post('/upload', authenticateJWT, upload.single('file'), certificatesController.uploadPDF);
router.post('/upload-multiple', authenticateJWT, upload.array('files', 20), certificatesController.uploadMultiple);
router.post('/upload-excel', authenticateJWT, uploadExcel.single('file'), certificatesController.uploadExcel);

module.exports = router;
