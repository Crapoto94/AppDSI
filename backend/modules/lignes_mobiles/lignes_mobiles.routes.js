const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./lignes_mobiles.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.get('/', authenticateJWT, ctrl.list);
router.get('/kpis', authenticateJWT, ctrl.kpis);
router.post('/import', authenticateJWT, upload.single('file'), ctrl.importExcel);

module.exports = router;
