const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateJWTorApiKey, requireApiScope, authenticateAdmin } = require('../../shared/middleware');
const { pgDb } = require('../../shared/database');
// JWT (UI) OU clé API restreinte au module « tickets »
const apiTickets = [authenticateJWTorApiKey, requireApiScope('tickets')];
const { requireTicketPermission } = require('./middleware/ticket-permissions');
const controller = require('./tickets.controller');

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     tags: [Tickets]
 *     summary: Liste paginée des tickets
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tableau de tickets
 *   post:
 *     tags: [Tickets]
 *     summary: Crée un nouveau ticket
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:       { type: string }
 *               description: { type: string }
 *               requester_email: { type: string }
 *               category_id: { type: integer }
 *               urgent:      { type: boolean }
 *     responses:
 *       201:
 *         description: Ticket créé
 * /api/tickets/{id}:
 *   get:
 *     tags: [Tickets]
 *     summary: Détail d'un ticket
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Objet ticket
 *   patch:
 *     tags: [Tickets]
 *     summary: Met à jour un ticket
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 */

// ─── Rôle résolu du ticket module ───────────────────────────────
router.get('/my-role', authenticateJWT, async (req, res) => {
    try {
        const { resolveTicketRole } = require('./middleware/ticket-permissions');
        const role = await resolveTicketRole(req.user);
        res.json({ role });
    } catch (e) { res.status(500).json({ role: 'user' }); }
});

// ─── Permission check ────────────────────────────────────────────
router.get('/has-permission/:action', authenticateJWT, async (req, res) => {
    try {
        const { hasPermission } = require('./middleware/ticket-permissions');
        const allowed = await hasPermission(req.user, req.params.action);
        res.json({ allowed });
    } catch (e) { res.status(500).json({ allowed: false }); }
});

// ─── Escalade targets ───────────────────────────────────────────
router.get('/escalade/targets', authenticateJWT, async (req, res) => {
    try {
        const [agents, supervisors, groups] = await Promise.all([
            pgDb.all(`SELECT * FROM hub_tickets.escalade_config WHERE type = 'escalade_target' AND target_type = 'agent' ORDER BY display_name`),
            pgDb.all(`SELECT * FROM hub_tickets.escalade_config WHERE type = 'escalade_target' AND target_type = 'supervisor' ORDER BY display_name`),
            pgDb.all(`
                SELECT g.id, g.name, g.description, g.is_default,
                       COALESCE(json_agg(json_build_object('user_id', m.user_id, 'displayName', u.displayName, 'username', u.username))
                           FILTER (WHERE m.id IS NOT NULL), '[]') as members
                FROM hub_tickets.technician_groups g
                LEFT JOIN hub_tickets.technician_group_members m ON g.id = m.group_id
                LEFT JOIN hub.users u ON m.user_id = u.id
                WHERE g.is_active = true AND g.is_default = false AND g.id IS NOT NULL
                GROUP BY g.id, g.name, g.description, g.is_default
                ORDER BY g.name
            `),
        ]);
        res.json({ agents, supervisors, groups });
    } catch (e) { res.status(500).json({ agents: [], supervisors: [], groups: [] }); }
});

// ─── Dashboard & Stats ───────────────────────────────────────────
router.get('/ticket-stats', authenticateJWT, (req, res) => controller.getTicketCountsBySoftware(req, res));
router.get('/stats', authenticateJWT, (req, res) => controller.getTicketsStats(req, res));
router.get('/dashboard/stats', authenticateJWT, (req, res) => controller.getDashboardStats(req, res));
router.get('/dashboard/my-stats', authenticateJWT, (req, res) => controller.getMyStats(req, res));
router.get('/dashboard/daily-metrics', authenticateJWT, (req, res) => controller.getDailyMetrics(req, res));
router.get('/dashboard/kpi-history', authenticateJWT, (req, res) => controller.getKpiHistory(req, res));
router.post('/dashboard/kpi-snapshot/run', authenticateAdmin, (req, res) => controller.runKpiSnapshot(req, res));
router.post('/dashboard/kpi-backfill', authenticateAdmin, (req, res) => controller.backfillKpiHistory(req, res));
router.get('/dashboard/sla-breaches', authenticateJWT, (req, res) => controller.getSLABreaches(req, res));
router.get('/dashboard/live-stats', authenticateJWT, (req, res) => controller.getLiveStats(req, res));
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
router.post('/:id/attach-doc', authenticateJWT, (req, res) => controller.attachDoc(req, res));
router.get('/:id/attachments/:aid', authenticateJWT, (req, res) => controller.downloadAttachment(req, res));
router.delete('/:id/attachments/:aid', authenticateJWT, (req, res) => controller.deleteAttachment(req, res));

// ─── History ──────────────────────────────────────────────────────
router.get('/:id/history', authenticateJWT, (req, res) => controller.getHistory(req, res));
router.post('/:id/log-activity', authenticateJWT, (req, res) => controller.logActivity(req, res));
router.get('/:id/sla', authenticateJWT, (req, res) => controller.getSLA(req, res));

// ─── Problem Associations ───────────────────────────────────────
router.get('/problem/:problemId/tickets', authenticateJWT, async (req, res) => {
    try {
        const problemId = parseInt(req.params.problemId);
        const rows = await pgDb.all(`
            SELECT t.glpi_id as id, t.title, t.requester_name
            FROM hub_tickets.tickets t
            JOIN hub_tickets.ticket_group_members tgm ON t.glpi_id = tgm.ticket_id
            JOIN hub_tickets.ticket_groups tg ON tgm.group_id = tg.id
            WHERE tg.problem_ticket_id = $1 AND t.glpi_id != $1
        `, [problemId]);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/:id/resolve', authenticateJWT, async (req, res) => {
    try {
        const ticketId = parseInt(req.params.id);
        const { solution, auto_resolve_linked } = req.body;
        await require('./services/ticket.service').resolveProblem(ticketId, !!auto_resolve_linked, solution, req.user);
        res.json({ message: 'Ticket résolu' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/:id/link-to-problem', authenticateJWT, async (req, res) => {
    try {
        const ticketId = parseInt(req.params.id);
        const { problem_ticket_id } = req.body;
        // Find group for ticket
        const group = await require('./repositories/ticket-group.repository').findByTicket(ticketId);
        if (!group) return res.status(404).json({ message: 'Ticket non associé à un groupe' });

        await require('./repositories/ticket-group.repository').setProblemTicket(group.id, problem_ticket_id);
        res.json({ message: 'Ticket associé au problème' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get('/search', authenticateJWT, requireTicketPermission("ticket:search"), async (req, res) => {
    try {
        const q = req.query.q || '';
        const type = req.query.type;
        const filters = { search: q };
        if (type) filters.type = type;
        const result = await require('./services/ticket.service').findAll(filters, { page: 1, limit: 20, sort: 'date_creation', order: 'desc' }, req.user);
        res.json(result.data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Actions ──────────────────────────────────────────────────────
router.post('/:id/assign', authenticateJWT, (req, res) => controller.assign(req, res));
router.post('/:id/assign-to-group', authenticateJWT, (req, res) => controller.assignToGroup(req, res));
router.get('/:id/assignees', authenticateJWT, async (req, res) => {
    try {
        const rows = await pgDb.all(`
            SELECT ta.id, ta.technician_id, ta.group_id, ta.is_primary, ta.assigned_at,
                   u.displayName as technician_name, u.username, u.email,
                   g.name as group_name,
                   (SELECT COUNT(*) FROM hub_tickets.technician_group_members m WHERE m.group_id = ta.group_id) as group_member_count
            FROM hub_tickets.ticket_assignments ta
            LEFT JOIN hub.users u ON ta.technician_id = u.id
            LEFT JOIN hub_tickets.technician_groups g ON ta.group_id = g.id
            WHERE ta.ticket_id = $1
            ORDER BY ta.is_primary DESC NULLS LAST, u.displayName
        `, [parseInt(req.params.id)]);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/:id/status', authenticateJWT, (req, res) => controller.changeStatus(req, res));
router.post('/:id/solution', authenticateJWT, (req, res) => controller.setSolution(req, res));
router.post('/:id/reopen', authenticateJWT, (req, res) => controller.reopen(req, res));
router.post('/:id/vip', authenticateJWT, (req, res) => controller.toggleVip(req, res));
router.get('/users/search', authenticateJWT, requireTicketPermission("ticket:search"), (req, res) => controller.searchUsers(req, res));
router.get('/users/ad-search', authenticateJWT, requireTicketPermission("ticket:ad_search"), async (req, res) => {
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

// ─── Filtres sauvegardés ─────────────────────────────────────────
router.get('/saved-filters', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username;
        const filters = await pgDb.all(
            `SELECT * FROM hub_tickets.saved_filters WHERE scope = 'global' OR created_by = $1 ORDER BY scope DESC, created_at DESC`,
            [username]
        );
        res.json(filters);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/saved-filters', authenticateJWT, async (req, res) => {
    try {
        const { name, scope, filters } = req.body;
        if (!name || !filters) return res.status(400).json({ message: 'name et filters requis' });
        const effectiveScope = scope === 'global' ? 'global' : 'personal';
        if (effectiveScope === 'global') {
            const { isAdminLike } = require('../../shared/middleware');
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Admin requis pour les filtres globaux' });
        }
        const result = await pgDb.run(
            `INSERT INTO hub_tickets.saved_filters (name, scope, filters, created_by) VALUES ($1, $2, $3, $4)`,
            [name, effectiveScope, JSON.stringify(filters), req.user.username]
        );
        const saved = await pgDb.get('SELECT * FROM hub_tickets.saved_filters WHERE id = $1', [result.lastID]);
        res.status(201).json(saved);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/saved-filters/:id', authenticateJWT, async (req, res) => {
    try {
        const filter = await pgDb.get('SELECT * FROM hub_tickets.saved_filters WHERE id = $1', [parseInt(req.params.id)]);
        if (!filter) return res.status(404).json({ message: 'Filtre introuvable' });
        const { isAdminLike } = require('../../shared/middleware');
        if (filter.created_by !== req.user.username && !isAdminLike(req.user)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        await pgDb.run('DELETE FROM hub_tickets.saved_filters WHERE id = $1', [parseInt(req.params.id)]);
        res.json({ message: 'Supprimé' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── CRUD Tickets (doit être APRÈS les routes spécifiques) ────────
router.get('/requester/:email', authenticateJWT, (req, res) => controller.getByRequester(req, res));
router.get('/my-phone', authenticateJWT, (req, res) => controller.getMyPhone(req, res));
router.delete('/bulk', authenticateJWT, (req, res) => controller.bulkDelete(req, res));
router.get('/batch-details', apiTickets, (req, res) => controller.getBatchDetails(req, res));
router.get('/', apiTickets, (req, res) => controller.getAll(req, res));
router.get('/:id', apiTickets, (req, res) => controller.getById(req, res));
router.post('/', apiTickets, (req, res) => controller.create(req, res));
router.put('/:id', apiTickets, (req, res) => controller.update(req, res));
router.patch('/:id', apiTickets, (req, res) => controller.update(req, res));
router.delete('/:id', authenticateJWT, (req, res) => controller.delete(req, res));

module.exports = router;
