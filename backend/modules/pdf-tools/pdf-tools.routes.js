const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('./pdf-tools.controller');
const { authenticateJWT } = require('../../shared/middleware');

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 Mo
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

router.use(authenticateJWT);

router.post('/merge', upload.array('files', 30), controller.merge);
router.post('/thumbnails', upload.single('file'), controller.thumbnails);
router.post('/pages/apply', upload.single('file'), controller.applyPages);
router.post('/compress', upload.single('file'), controller.compress);
router.post('/to-images', upload.single('file'), controller.toImages);
router.post('/watermark', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]), controller.watermark);
router.post('/page-numbers', upload.single('file'), controller.pageNumbers);
router.post('/ocr', upload.single('file'), controller.ocr);
router.post('/compare', upload.fields([{ name: 'fileA', maxCount: 1 }, { name: 'fileB', maxCount: 1 }]), controller.compare);
router.post('/repair', upload.single('file'), controller.repair);
router.post('/protect', upload.single('file'), controller.protect);

// Éditeur PDF (contenu)
router.post('/edit/objects', upload.single('file'), controller.editObjects);
router.post('/edit/apply', upload.single('file'), controller.editApply);

router.post('/save', upload.single('file'), controller.saveToGed);

// Publipostage PDF + Excel
const mailMergeUpload = upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'excel', maxCount: 1 }]);
router.post('/mail-merge/analyze', mailMergeUpload, controller.mailMergeAnalyze);
router.post('/mail-merge/generate', mailMergeUpload, controller.mailMergeGenerate);

// PDFothèque (documents enregistrés par l'agent, rétention 6 mois)
router.get('/library', controller.listLibrary);
router.get('/library/:id/download', controller.downloadLibrary);
router.delete('/library/:id', controller.deleteLibrary);
router.post('/library/:id/send', controller.sendLibraryMail);

module.exports = router;
