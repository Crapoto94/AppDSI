const express = require('express');
const router = express.Router();
const transcriptController = require('./transcriptmanager.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('../../shared/config');

// Multer: disque pour les fichiers transcript (.vtt/.txt) — parse et consommés, pas stockés via GED
const uploadDir = path.join(__dirname, '../../file_reunions');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `transcript_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: diskStorage });

// Multer: mémoire pour les pièces jointes des réunions (écrites via shared/storage.js → GED)
const uploadAttachment = multer({ storage: multer.memoryStorage() });

// Accepte token en query OU header (utile pour les <a href="...?token=..."> côté front — images, PDFs, etc.)
const authJwtOrQuery = (req, res, next) => {
    const headerToken = (req.headers.authorization || '').split(' ')[1];
    const token = req.query.token || headerToken;
    if (!token) return res.status(401).json({ message: 'Token manquant' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token invalide' });
        req.user = user;
        next();
    });
};

// Routes
router.get('/meetings', authenticateJWT, transcriptController.getMeetings);
router.get('/search', authenticateJWT, transcriptController.searchTranscripts);
router.get('/meeting/:id', authenticateJWT, transcriptController.getMeeting);
router.post('/upload', authenticateJWT, upload.single('file'), transcriptController.uploadTranscript);
router.get('/upload-status/:jobId', authenticateJWT, transcriptController.getImportStatus);
router.post('/meeting/:id/summarize', authenticateJWT, transcriptController.summarizeMeeting);
router.get('/ai/models', authenticateJWT, transcriptController.getAiModels);

router.get('/tasks', authenticateJWT, transcriptController.getTasks);
router.post('/tasks', authenticateJWT, transcriptController.createTask);
router.post('/task/:id/toggle', authenticateJWT, transcriptController.toggleTask);
router.put('/task/:id', authenticateJWT, transcriptController.updateTask);
router.patch('/task/:id/link-app-task', authenticateJWT, transcriptController.linkAppTask);
router.delete('/task/:id', authenticateJWT, transcriptController.deleteTask);
router.put('/meeting/:id', authenticateJWT, transcriptController.updateMeeting);
router.delete('/meeting/:id', authenticateJWT, transcriptController.deleteMeeting);

// Statut du job de génération IA asynchrone (POST /summarize renvoie un jobId, le
// front poll ce endpoint pour le suivi).
router.get('/summarize-status/:jobId', authenticateJWT, transcriptController.getSummarizeStatus);

// Pièces jointes des réunions — fichiers stockés via shared/storage.js → /GED
// (double-écriture hub_docs). Les routes /attachments/* sont placées avant toute
// route catch-all paramétrique pour éviter les conflits d'ordre Express.
router.post('/meeting/:id/attachments', authenticateJWT, uploadAttachment.array('files', 10), transcriptController.uploadAttachments);
router.get('/meeting/:id/attachments', authenticateJWT, transcriptController.getAttachments);
router.get('/attachments/:id/file', authJwtOrQuery, transcriptController.downloadAttachment);
router.delete('/attachments/:id', authenticateJWT, transcriptController.deleteAttachment);

module.exports = router;
