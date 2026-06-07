const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateAdmin, authenticateJWT } = require('../../shared/middleware');
const controller = require('./backup.controller');

const router = express.Router();

// État synthétique de la sauvegarde (non sensible) — accessible à tout utilisateur
// authentifié pour le widget du tableau de bord. Déclaré AVANT le garde superadmin.
router.get('/health-summary', authenticateJWT, controller.getHealthSummary);

// Disk storage: backups can be very large (hundreds of MB). Streaming the
// upload to disk avoids buffering the whole file in memory.
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `upload_${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

// authenticateAdmin n'autorise déjà que les superadmins (role='superadmin'
// ou usernames legacy 'admin'/'adminhub').
router.use(authenticateAdmin);

// Export routes
router.get('/export/sqlite', controller.exportSqlite);
router.get('/export/postgres', controller.exportPostgres);
router.get('/export/files', controller.exportFiles);
router.get('/export/global', controller.globalBackup);

// Import routes
router.post('/import/sqlite', upload.single('file'), controller.importSqlite);
router.post('/import/postgres', upload.single('file'), controller.importPostgres);
router.post('/import/files', upload.single('file'), controller.importFiles);

// Status
router.get('/status', controller.getBackupStatus);

// Backup manifest/log (lists schemas, tables, files, sizes — without generating the dump)
router.get('/log/:type', controller.getBackupLog);

// PostgreSQL schema selection (which schemas get backed up)
router.get('/schemas', controller.getSchemasRoute);
router.post('/schemas', controller.saveSchemasRoute);

// Automatic backup configuration + manual trigger
router.get('/auto-config', controller.getAutoConfigRoute);
router.post('/auto-config', controller.saveAutoConfigRoute);
router.post('/auto/run-now', controller.runAutoNow);

module.exports = router;
