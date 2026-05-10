const express = require('express');
const router = express.Router();
const transcriptController = require('./transcriptmanager.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Config Multer for transcripts
const uploadDir = path.join(__dirname, '../../file_reunions');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `transcript_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// Routes
router.get('/meetings', authenticateJWT, transcriptController.getMeetings);
router.get('/meeting/:id', authenticateJWT, transcriptController.getMeeting);
router.post('/upload', authenticateJWT, upload.single('file'), transcriptController.uploadTranscript);
router.get('/upload-status/:jobId', authenticateJWT, transcriptController.getImportStatus);
router.post('/meeting/:id/summarize', authenticateJWT, transcriptController.summarizeMeeting);

router.get('/tasks', authenticateJWT, transcriptController.getTasks);
router.post('/tasks', authenticateJWT, transcriptController.createTask);
router.post('/task/:id/toggle', authenticateJWT, transcriptController.toggleTask);
router.put('/meeting/:id', authenticateJWT, transcriptController.updateMeeting);
router.delete('/meeting/:id', authenticateJWT, transcriptController.deleteMeeting);

module.exports = router;
