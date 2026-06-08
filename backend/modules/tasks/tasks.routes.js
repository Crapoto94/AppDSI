const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const jwt     = require('jsonwebtoken');

/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags: [Tâches]
 *     summary: Liste les tâches personnelles de l'utilisateur connecté
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tableau de tâches
 * /api/tasks/by-context:
 *   get:
 *     tags: [Tâches]
 *     summary: Récupère les tâches liées à un contexte (ticket, projet...)
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         required: true
 *         schema: { type: string, enum: [ticket, projet] }
 *       - in: query
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Tableau de tâches
 */
const { authenticateJWT, authenticateJWTorApiKey, requireApiScope } = require('../../shared/middleware');
const { requireTicketPermission } = require('../tickets/middleware/ticket-permissions');
// JWT (UI) OU clé API restreinte au module « tasks »
const apiTasks = [authenticateJWTorApiKey, requireApiScope('tasks')];
const { SECRET_KEY } = require('../../shared/config');
const controller = require('./tasks.controller');

// ─── Multer for task-note file uploads ───────────────────────────────────────
const uploadNote = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Accepte token en query OU header (utile pour <a href="...?token=..."> côté front).
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

// ─── Static / non-param routes (MUST come before /:source/:id) ───────────────
router.get('/count',              authenticateJWT, (req, res) => controller.getMyTasksCount(req, res));
router.get('/alert-pref',         authenticateJWT, (req, res) => controller.getAlertPref(req, res));
router.patch('/alert-pref',       authenticateJWT, (req, res) => controller.setAlertPref(req, res));
router.get('/assign-alert-pref',  authenticateJWT, (req, res) => controller.getAssignAlertPref(req, res));
router.patch('/assign-alert-pref',authenticateJWT, (req, res) => controller.setAssignAlertPref(req, res));
router.post('/alert-test',        authenticateJWT, (req, res) => controller.sendTestAlert(req, res));
router.get('/services',           authenticateJWT, (req, res) => controller.getServices(req, res));
router.get('/ticket-groups',      authenticateJWT, (req, res) => controller.getTicketGroups(req, res));
router.get('/by-context',         apiTasks, (req, res) => controller.getTasksByContext(req, res));
router.get('/assigned-by-me',     authenticateJWT, (req, res) => controller.getAssignedByMe(req, res));
router.get('/kpi-history',        authenticateJWT, (req, res) => controller.getKpiHistory(req, res));

// MS Todo sync
router.get('/todo-sync',          authenticateJWT, (req, res) => controller.getTodoSyncPref(req, res));
router.patch('/todo-sync',        authenticateJWT, (req, res) => controller.setTodoSyncPref(req, res));
router.post('/todo-sync/run',     authenticateJWT, (req, res) => controller.runTodoSync(req, res));

// ─── Task CRUD ────────────────────────────────────────────────────────────────
router.get('/',                   authenticateJWT, (req, res) => controller.getMyTasks(req, res));
router.post('/',                  authenticateJWT, requireTicketPermission("ticket:create"), (req, res) => controller.createTask(req, res));
router.patch('/edit/:id',         authenticateJWT, (req, res) => controller.editTask(req, res));
router.patch('/:source/:id/favorite',      authenticateJWT, (req, res) => controller.toggleFavorite(req, res));
router.patch('/:source/:id',      authenticateJWT, (req, res) => controller.updateTaskStatus(req, res));
router.delete('/personal/:id',    authenticateJWT, (req, res) => controller.deleteTask(req, res));

// ─── Notes (MUST come before /:source/:id to avoid param conflict) ────────────
// Note: Express matches /:source/:id first for GET /:source/:id/notes,
// so these specific longer paths resolve correctly.
router.get('/:source/:id/notes',                  authenticateJWT, (req, res) => controller.getTaskNotes(req, res));
router.post('/:source/:id/notes',                 authenticateJWT, (req, res) => controller.addTaskNote(req, res));
router.post('/:source/:id/notes/file',            authenticateJWT, uploadNote.single('file'), (req, res) => controller.addTaskNoteFile(req, res));
router.get('/:source/:id/notes/:noteId/file',     authJwtOrQuery, (req, res) => controller.downloadTaskNoteFile(req, res));
router.delete('/:source/:id/notes/:noteId',       authenticateJWT, (req, res) => controller.deleteTaskNote(req, res));

module.exports = router;
