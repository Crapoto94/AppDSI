const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { authenticateJWT } = require('../../shared/middleware');
const controller = require('./tasks.controller');

// ─── Multer for task-note file uploads ───────────────────────────────────────
const TASK_NOTES_DIR = path.join(__dirname, '..', '..', 'file_task_notes');
if (!require('fs').existsSync(TASK_NOTES_DIR)) require('fs').mkdirSync(TASK_NOTES_DIR, { recursive: true });
const uploadNote = multer({ dest: TASK_NOTES_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Static / non-param routes (MUST come before /:source/:id) ───────────────
router.get('/count',              authenticateJWT, (req, res) => controller.getMyTasksCount(req, res));
router.get('/alert-pref',         authenticateJWT, (req, res) => controller.getAlertPref(req, res));
router.patch('/alert-pref',       authenticateJWT, (req, res) => controller.setAlertPref(req, res));
router.post('/alert-test',        authenticateJWT, (req, res) => controller.sendTestAlert(req, res));
router.get('/services',           authenticateJWT, (req, res) => controller.getServices(req, res));
router.get('/by-context',         authenticateJWT, (req, res) => controller.getTasksByContext(req, res));

// MS Todo sync
router.get('/todo-sync',          authenticateJWT, (req, res) => controller.getTodoSyncPref(req, res));
router.patch('/todo-sync',        authenticateJWT, (req, res) => controller.setTodoSyncPref(req, res));
router.post('/todo-sync/run',     authenticateJWT, (req, res) => controller.runTodoSync(req, res));

// ─── Task CRUD ────────────────────────────────────────────────────────────────
router.get('/',                   authenticateJWT, (req, res) => controller.getMyTasks(req, res));
router.post('/',                  authenticateJWT, (req, res) => controller.createTask(req, res));
router.patch('/:source/:id',      authenticateJWT, (req, res) => controller.updateTaskStatus(req, res));
router.delete('/personal/:id',    authenticateJWT, (req, res) => controller.deleteTask(req, res));

// ─── Notes (MUST come before /:source/:id to avoid param conflict) ────────────
// Note: Express matches /:source/:id first for GET /:source/:id/notes,
// so these specific longer paths resolve correctly.
router.get('/:source/:id/notes',                  authenticateJWT, (req, res) => controller.getTaskNotes(req, res));
router.post('/:source/:id/notes',                 authenticateJWT, (req, res) => controller.addTaskNote(req, res));
router.post('/:source/:id/notes/file',            authenticateJWT, uploadNote.single('file'), (req, res) => controller.addTaskNoteFile(req, res));
router.get('/:source/:id/notes/:noteId/file',     authenticateJWT, (req, res) => controller.downloadTaskNoteFile(req, res));
router.delete('/:source/:id/notes/:noteId',       authenticateJWT, (req, res) => controller.deleteTaskNote(req, res));

module.exports = router;
