const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const controller = require('./live.controller');

// ── Multer for live attachments ────────────────────────────────────────
const liveUploadDir = path.join(__dirname, '../../uploads/live');
if (!fs.existsSync(liveUploadDir)) fs.mkdirSync(liveUploadDir, { recursive: true });

const liveStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, liveUploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safe = path.basename(file.originalname, ext).replace(/[^a-z0-9_\-]/gi, '_');
        cb(null, `${Date.now()}_${safe}${ext}`);
    }
});
const uploadLive = multer({
    storage: liveStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Routes ─────────────────────────────────────────────────────────────
router.get('/config',              authenticateJWT, (req, res) => controller.getConfig(req, res));
router.put('/config',              authenticateJWT, (req, res) => controller.setConfig(req, res));
router.get('/calendars',           authenticateJWT, (req, res) => controller.getCalendars(req, res));
router.get('/count',               authenticateJWT, (req, res) => controller.getWaitingCount(req, res));
router.get('/stats',               authenticateJWT, (req, res) => controller.getStats(req, res));
router.get('/sessions',            authenticateJWT, (req, res) => controller.getSessions(req, res));
router.post('/sessions',           authenticateJWT, (req, res) => controller.createSession(req, res));
router.get('/sessions/:id',        authenticateJWT, (req, res) => controller.getSession(req, res));
router.get('/sessions/:id/messages', authenticateJWT, (req, res) => controller.getMessages(req, res));
router.post('/sessions/:id/claim', authenticateJWT, (req, res) => controller.claimSession(req, res));
router.post('/sessions/:id/close', authenticateJWT, (req, res) => controller.closeSession(req, res));
router.post('/sessions/:id/upload', authenticateJWT, uploadLive.single('file'), (req, res) => controller.uploadAttachment(req, res));

module.exports = router;
