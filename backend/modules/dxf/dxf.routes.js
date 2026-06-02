const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('./dxf.controller');
const { authenticateJWT } = require('../../shared/middleware');

const uploadMemory = multer({ storage: multer.memoryStorage() });

router.use(authenticateJWT);

router.post('/parse', uploadMemory.single('file'), ctrl.parse);
router.post('/georef', ctrl.georef);
router.get('/layers', ctrl.getLayers);
router.delete('/:id', ctrl.remove);

module.exports = router;
