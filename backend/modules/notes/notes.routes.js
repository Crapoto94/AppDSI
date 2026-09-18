const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const ctrl = require('./notes.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Routes spécifiques (AVANT /:id) ────────────────────────────────────────
router.get('/tree', authenticateJWT, ctrl.getTree);
router.get('/stats', authenticateJWT, ctrl.getStats);
router.get('/settings', authenticateJWT, ctrl.getPublicSettings);
router.get('/tags', authenticateJWT, ctrl.listTags);
router.get('/wordcloud', authenticateJWT, ctrl.wordCloud);
router.get('/search', authenticateJWT, ctrl.searchNotes);
router.get('/agents', authenticateJWT, ctrl.searchAgents);
router.get('/shared', authenticateJWT, ctrl.listSharedWithMe);

router.post('/analyze-all', authenticateJWT, ctrl.analyzeAll);
router.post('/classify', authenticateJWT, ctrl.classify);
router.post('/reorganize', authenticateJWT, ctrl.reorganize);
router.post('/apply-classification', authenticateJWT, ctrl.applyClassification);

// Réglages IA (admin)
router.get('/ai-settings', authenticateAdmin, ctrl.getAiSettings);
router.post('/ai-settings', authenticateAdmin, ctrl.saveAiSettings);
router.get('/ai-defaults', authenticateAdmin, ctrl.getAiDefaults);
router.get('/models', authenticateAdmin, ctrl.listModels);

// ── Carnets ────────────────────────────────────────────────────────────────
router.get('/notebooks', authenticateJWT, ctrl.getTree);
router.post('/notebooks', authenticateJWT, ctrl.createNotebook);
router.put('/notebooks/:id', authenticateJWT, ctrl.updateNotebook);
router.delete('/notebooks/:id', authenticateJWT, ctrl.deleteNotebook);

// ── Sections ───────────────────────────────────────────────────────────────
router.post('/sections', authenticateJWT, ctrl.createSection);
router.put('/sections/:id', authenticateJWT, ctrl.updateSection);
router.delete('/sections/:id', authenticateJWT, ctrl.deleteSection);

// ── Notes ──────────────────────────────────────────────────────────────────
router.get('/', authenticateJWT, ctrl.listNotes);
router.post('/', authenticateJWT, ctrl.createNote);

router.get('/:id/ai-status', authenticateJWT, ctrl.aiStatus);
router.post('/:id/analyze', authenticateJWT, ctrl.analyzeNote);
router.post('/:id/apply-suggestion', authenticateJWT, ctrl.applySuggestion);
router.get('/:id/task-suggestions', authenticateJWT, ctrl.listTaskSuggestions);
router.post('/:id/propose-tasks', authenticateJWT, ctrl.proposeTasks);
router.patch('/:id/task-suggestions/:sid', authenticateJWT, ctrl.updateTaskSuggestion);
router.post('/:id/send-mail', authenticateJWT, ctrl.sendNoteMail);

// Partage interne
router.get('/:id/shares', authenticateJWT, ctrl.listShares);
router.post('/:id/share', authenticateJWT, ctrl.shareNote);
router.delete('/:id/shares/:shareId', authenticateJWT, ctrl.deleteShare);

// Pièces jointes
router.get('/:id/attachments', authenticateJWT, ctrl.listAttachments);
router.post('/:id/attachments', authenticateJWT, upload.single('file'), ctrl.uploadAttachment);
router.get('/:id/attachments/:attId/download', authenticateJWT, ctrl.downloadAttachment);
router.delete('/:id/attachments/:attId', authenticateJWT, ctrl.deleteAttachment);
router.get('/:id/versions', authenticateJWT, ctrl.listVersions);
router.post('/:id/versions/:versionId/restore', authenticateJWT, ctrl.restoreVersion);

router.get('/:id', authenticateJWT, ctrl.getNote);
router.put('/:id', authenticateJWT, ctrl.updateNote);
router.delete('/:id', authenticateJWT, ctrl.deleteNote);

module.exports = router;
