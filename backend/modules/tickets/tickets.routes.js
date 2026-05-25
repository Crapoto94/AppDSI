const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const { requireTicketPermission } = require('./middleware/ticket-permissions');
const controller = require('./tickets.controller');

// ─── Rôle résolu du ticket module ───────────────────────────────
router.get('/my-role', authenticateJWT, async (req, res) => {
    try {
        const { resolveTicketRole } = require('./middleware/ticket-permissions');
        const role = await resolveTicketRole(req.user);
        res.json({ role });
    } catch (e) { res.status(500).json({ role: 'user' }); }
});

// ─── Dashboard & Stats ───────────────────────────────────────────
router.get('/ticket-stats', authenticateJWT, (req, res) => controller.getTicketCountsBySoftware(req, res));
router.get('/dashboard/stats', authenticateJWT, (req, res) => controller.getDashboardStats(req, res));
router.get('/dashboard/my-stats', authenticateJWT, (req, res) => controller.getMyStats(req, res));
router.get('/dashboard/daily-metrics', authenticateJWT, (req, res) => controller.getDailyMetrics(req, res));
router.get('/dashboard/kpi-history', authenticateJWT, (req, res) => controller.getKpiHistory(req, res));
router.post('/dashboard/kpi-snapshot/run', authenticateAdmin, (req, res) => controller.runKpiSnapshot(req, res));
router.post('/dashboard/kpi-backfill', authenticateAdmin, (req, res) => controller.backfillKpiHistory(req, res));
router.get('/dashboard/sla-breaches', authenticateJWT, (req, res) => controller.getSLABreaches(req, res));
router.post('/dashboard/widgets', authenticateJWT, (req, res) => controller.saveWidgets(req, res));
router.get('/dashboard/widgets', authenticateJWT, (req, res) => controller.getWidgets(req, res));

// ─── Comments ─────────────────────────────────────────────────────
router.get('/:id/comments', authenticateJWT, (req, res) => controller.getComments(req, res));
router.post('/:id/comments', authenticateJWT, (req, res) => controller.addComment(req, res));
router.post('/:id/comments/send', authenticateJWT, (req, res) => controller.sendCommentToRequester(req, res));
router.put('/:id/comments/:cid', authenticateJWT, (req, res) => controller.updateComment(req, res));
router.delete('/:id/comments/:cid', authenticateJWT, (req, res) => controller.deleteComment(req, res));

// ─── Attachments ──────────────────────────────────────────────────
router.get('/:id/attachments', authenticateJWT, (req, res) => controller.getAttachments(req, res));
router.post('/:id/attachments', authenticateJWT, controller.uploadMiddleware, (req, res) => controller.addAttachment(req, res));
router.get('/:id/attachments/:aid', authenticateJWT, (req, res) => controller.downloadAttachment(req, res));
router.delete('/:id/attachments/:aid', authenticateJWT, (req, res) => controller.deleteAttachment(req, res));

// ─── History ──────────────────────────────────────────────────────
router.get('/:id/history', authenticateJWT, (req, res) => controller.getHistory(req, res));
router.post('/:id/log-activity', authenticateJWT, (req, res) => controller.logActivity(req, res));
router.get('/:id/sla', authenticateJWT, (req, res) => controller.getSLA(req, res));

// ─── Actions ──────────────────────────────────────────────────────
router.post('/:id/assign', authenticateJWT, (req, res) => controller.assign(req, res));
router.post('/:id/status', authenticateJWT, (req, res) => controller.changeStatus(req, res));
router.post('/:id/solution', authenticateJWT, (req, res) => controller.setSolution(req, res));
router.post('/:id/reopen', authenticateJWT, (req, res) => controller.reopen(req, res));
router.post('/:id/vip', authenticateJWT, (req, res) => controller.toggleVip(req, res));
router.get('/users/search', authenticateJWT, (req, res) => controller.searchUsers(req, res));
router.get('/users/ad-search', authenticateJWT, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) return res.json([]);
        const { getSqlite } = require('../../shared/database');
        const { searchADUsersByQuery } = require('../../shared/ad_helper');
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) return res.json([]);
        const results = await searchADUsersByQuery(q, adSettings);
        res.json((results || []).map(u => ({ name: u.displayName || u.name || u.username, email: u.email, username: u.username })));
    } catch (e) { res.status(500).json({ message: e.message }); }
});
router.get('/:id/observers', authenticateJWT, (req, res) => controller.getObservers(req, res));
router.post('/:id/observers', authenticateJWT, (req, res) => controller.addObserver(req, res));
router.delete('/:id/observers/:userId', authenticateJWT, (req, res) => controller.removeObserver(req, res));
router.post('/:id/watch', authenticateJWT, (req, res) => controller.addWatcher(req, res));
router.delete('/:id/watch', authenticateJWT, (req, res) => controller.removeWatcher(req, res));
router.post('/:id/favorite', authenticateJWT, (req, res) => controller.addFavorite(req, res));
router.delete('/:id/favorite', authenticateJWT, (req, res) => controller.removeFavorite(req, res));

// ─── AI ───────────────────────────────────────────────────────────
router.post('/ai/reformulate', authenticateJWT, (req, res) => controller.reformulateText(req, res));
router.get('/config/public', authenticateJWT, async (req, res) => {
    try {
        const techRepo = require('./repositories/technician.repository');
        const val = await techRepo.getConfig('ai_reformulation_enabled');
        res.json({ ai_reformulation_enabled: val !== 'false' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── CRUD Tickets (doit être APRÈS les routes spécifiques) ────────
router.get('/requester/:email', authenticateJWT, (req, res) => controller.getByRequester(req, res));
router.delete('/bulk', authenticateJWT, (req, res) => controller.bulkDelete(req, res));
router.get('/', authenticateJWT, (req, res) => controller.getAll(req, res));
router.get('/:id', authenticateJWT, (req, res) => controller.getById(req, res));
router.post('/', authenticateJWT, (req, res) => controller.create(req, res));
router.put('/:id', authenticateJWT, (req, res) => controller.update(req, res));
router.patch('/:id', authenticateJWT, (req, res) => controller.update(req, res));
router.delete('/:id', authenticateJWT, (req, res) => controller.delete(req, res));

module.exports = router;
