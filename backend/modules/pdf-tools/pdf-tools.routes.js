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
router.post('/save', upload.single('file'), controller.saveToGed);

module.exports = router;
