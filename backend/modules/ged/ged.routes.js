const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateAdmin, authenticateAdminUI } = require('../../shared/middleware');
const ctrl = require('./ged.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max
});

router.get('/config', authenticateAdminUI, ctrl.getConfig);
router.post('/config', authenticateAdminUI, ctrl.saveConfig);
router.post('/test-connection', authenticateAdminUI, ctrl.testConnection);
router.post('/test-upload', authenticateAdminUI, upload.single('file'), ctrl.testUpload);
router.get('/root', authenticateAdminUI, ctrl.getRoot);
router.get('/sites', authenticateAdminUI, ctrl.listSites);

// Configuration du stockage de documents (filesystem / ged)
router.get('/storage-config', authenticateAdminUI, ctrl.getStorageConfig);
router.post('/storage-config', authenticateAdminUI, ctrl.saveStorageConfig);
router.post('/storage-test', authenticateAdminUI, ctrl.testStorage);

// Configuration du stockage PAR MODULE (filesystem / alfresco / both)
router.get('/module-storage', authenticateAdminUI, ctrl.listModuleStorage);
router.get('/module-storage/:module', authenticateAdminUI, ctrl.getModuleStorage);
router.put('/module-storage/:module', authenticateAdminUI, ctrl.saveModuleStorage);

// Bascule de stockage FS ↔ GED (avec vérification)
router.post('/migrate', authenticateAdminUI, ctrl.runMigration);
router.get('/migrate/status', authenticateAdminUI, ctrl.migrationStatus);

// Explorateur du stockage filesystem (admin)
router.get('/storage/browse', authenticateAdminUI, ctrl.browseStorage);
router.get('/storage/file', authenticateAdminUI, ctrl.downloadStorage);
router.post('/storage/folder', authenticateAdminUI, ctrl.createStorageFolder);
router.post('/storage/upload', authenticateAdminUI, upload.single('file'), ctrl.uploadStorage);
router.delete('/storage/node', authenticateAdminUI, ctrl.deleteStorageNode);
router.post('/storage/migrate', authenticateAdminUI, ctrl.migrateStorage);
router.post('/storage/recover', authenticateAdminUI, ctrl.recoverStorage);

router.get('/nodes/:nodeId', authenticateAdminUI, ctrl.getNode);
router.get('/nodes/:nodeId/children', authenticateAdminUI, ctrl.listChildren);
router.get('/nodes/:nodeId/content', authenticateAdminUI, ctrl.downloadContent);
router.post('/nodes/:nodeId/folder', authenticateAdminUI, ctrl.createFolder);
router.post('/nodes/:nodeId/upload', authenticateAdminUI, upload.single('file'), ctrl.uploadFile);
router.delete('/nodes/:nodeId', authenticateAdminUI, ctrl.deleteNode);

module.exports = router;
