const express = require('express');
const router = express.Router();
const certificatesController = require('./certificates.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');

// PDF de certificats : stockés en mémoire puis écrits via le service de stockage
// configurable (filesystem local/UNC) sous "<root>/certificats/<id>/<fichier>".
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
// Import Excel : fichier temporaire sur disque (lu puis supprimé).
const uploadExcel = multer({ dest: 'uploads/' });

// Routes
router.get('/renewal-count', authenticateJWT, certificatesController.getRenewalCount);
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
