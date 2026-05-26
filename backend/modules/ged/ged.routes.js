const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateAdmin } = require('../../shared/middleware');
const ctrl = require('./ged.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max
});

router.get('/config', authenticateAdmin, ctrl.getConfig);
router.post('/config', authenticateAdmin, ctrl.saveConfig);
router.post('/test-connection', authenticateAdmin, ctrl.testConnection);

router.get('/nodes/:nodeId', authenticateAdmin, ctrl.getNode);
router.get('/nodes/:nodeId/children', authenticateAdmin, ctrl.listChildren);
router.get('/nodes/:nodeId/content', authenticateAdmin, ctrl.downloadContent);
router.post('/nodes/:nodeId/folder', authenticateAdmin, ctrl.createFolder);
router.post('/nodes/:nodeId/upload', authenticateAdmin, upload.single('file'), ctrl.uploadFile);
router.delete('/nodes/:nodeId', authenticateAdmin, ctrl.deleteNode);

module.exports = router;
