const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const groupRepo = require('./repositories/ticket-group.repository');
const workflowService = require('./services/workflow.service');
const ticketService = require('./services/ticket.service');
const historyRepo = require('./repositories/history.repository');

// ─── Créer un groupe à partir de plusieurs tickets ───────────────
router.post('/', authenticateJWT, async (req, res) => {
    try {
        const { ticket_ids, name } = req.body;
        if (!Array.isArray(ticket_ids) || ticket_ids.length < 2) {
            return res.status(400).json({ message: 'Au moins 2 tickets sont requis pour créer un groupe' });
        }
        // Vérifier qu'aucun ticket n'est déjà dans un autre groupe
        for (const id of ticket_ids) {
            const existing = await groupRepo.findByTicketId(id);
            if (existing) {
                return res.status(400).json({
                    message: `Le ticket #${id} appartient déjà au groupe "${existing.name}"`
                });
            }
        }
        const groupName = name || `Groupe du ${new Date().toLocaleDateString('fr-FR')}`;
        const groupId = await groupRepo.create(groupName, req.user.username);
        for (const id of ticket_ids) {
            await groupRepo.addMember(groupId, id, req.user.username);
        }
        // Historique sur chaque ticket
        const actor = req.user.displayName || req.user.username;
        for (const id of ticket_ids) {
            try {
                await historyRepo.log(id, req.user.id, 'grouped', null, null, String(groupId),
                    `Groupé dans "${groupName}" par ${actor}`);
            } catch (e) {}
        }
        res.status(201).json({ id: groupId, message: 'Groupe créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Obtenir un groupe par ticket ────────────────────────────────
router.get('/by-ticket/:ticketId', authenticateJWT, async (req, res) => {
    try {
        const group = await groupRepo.findByTicketId(parseInt(req.params.ticketId));
        if (!group) return res.json(null);
        const full = await groupRepo.getGroupWithMembers(group.id);
        res.json(full);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Obtenir un groupe par son ID ────────────────────────────────
router.get('/:id', authenticateJWT, async (req, res) => {
    try {
        const group = await groupRepo.getGroupWithMembers(parseInt(req.params.id));
        if (!group) return res.status(404).json({ message: 'Groupe non trouvé' });
        res.json(group);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Renommer le groupe ──────────────────────────────────────────
router.put('/:id', authenticateJWT, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'Nom requis' });
        await groupRepo.updateName(parseInt(req.params.id), name.trim());
        res.json({ message: 'Groupe renommé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Ajouter un ticket au groupe ─────────────────────────────────
router.post('/:id/members', authenticateJWT, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const { ticket_id } = req.body;
        if (!ticket_id) return res.status(400).json({ message: 'ticket_id requis' });
        const existing = await groupRepo.findByTicketId(parseInt(ticket_id));
        if (existing && existing.id !== groupId) {
            return res.status(400).json({
                message: `Ce ticket appartient déjà au groupe "${existing.name}"`
            });
        }
        if (existing && existing.id === groupId) {
            return res.json({ message: 'Ticket déjà dans ce groupe' });
        }
        await groupRepo.addMember(groupId, parseInt(ticket_id), req.user.username);
        const group = await groupRepo.findById(groupId);
        try {
            await historyRepo.log(parseInt(ticket_id), req.user.id, 'grouped', null, null, String(groupId),
                `Ajouté au groupe "${group?.name}" par ${req.user.displayName || req.user.username}`);
        } catch (e) {}
        res.json({ message: 'Ticket ajouté au groupe' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Retirer un ticket du groupe ─────────────────────────────────
router.delete('/:id/members/:ticketId', authenticateJWT, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const ticketId = parseInt(req.params.ticketId);
        const group = await groupRepo.findById(groupId);
        await groupRepo.removeMember(groupId, ticketId);
        try {
            await historyRepo.log(ticketId, req.user.id, 'ungrouped', null, String(groupId), null,
                `Retiré du groupe par ${req.user.displayName || req.user.username}`);
        } catch (e) {}
        // Si moins de 2 membres restants → dissolution automatique
        const count = await groupRepo.getMemberCount(groupId);
        if (count < 2) {
            if (count === 1) {
                const remaining = await groupRepo.getGroupWithMembers(groupId);
                for (const m of remaining.members) {
                    try {
                        await historyRepo.log(m.ticket_id, req.user.id, 'ungrouped', null, String(groupId), null,
                            `Groupe "${group?.name}" dissous automatiquement (moins de 2 membres)`);
                    } catch (e) {}
                }
            }
            await groupRepo.dissolve(groupId);
            return res.json({ message: 'Groupe dissous (moins de 2 membres)', dissolved: true });
        }
        res.json({ message: 'Ticket retiré du groupe' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Dissoudre le groupe ─────────────────────────────────────────
router.delete('/:id', authenticateJWT, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const group = await groupRepo.getGroupWithMembers(groupId);
        const actor = req.user.displayName || req.user.username;
        if (group) {
            for (const m of group.members) {
                try {
                    await historyRepo.log(m.ticket_id, req.user.id, 'ungrouped', null, String(groupId), null,
                        `Groupe "${group.name}" dissous par ${actor}`);
                } catch (e) {}
            }
        }
        await groupRepo.dissolve(groupId);
        res.json({ message: 'Groupe dissous' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Transformer le groupe en Problème ──────────────────────────
router.post('/:id/transform-to-problem', authenticateJWT, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const group = await groupRepo.getGroupWithMembers(groupId);
        if (!group) return res.status(404).json({ message: 'Groupe non trouvé' });
        if (group.problem_ticket_id) {
            return res.status(400).json({
                message: `Ce groupe est déjà associé au problème #${group.problem_ticket_id}`,
                problem_ticket_id: group.problem_ticket_id
            });
        }
        const { title, content, resolution_method, knowledge_article, priority } = req.body;
        const problemTitle = (title || `Problème : ${group.name}`).trim();
        const memberList = group.members.map(m => `#${m.ticket_id} — ${m.title}`).join('\n');
        const problemContent = `Problème issu du groupe "${group.name}".\n\nTickets associés :\n${memberList}\n\n${content || ''}`.trim();

        const problemTicketId = await ticketService.create({
            title: problemTitle,
            content: problemContent,
            type: 3,
            priority: priority || 4,
            urgency: 3,
            impact: 3,
            resolution_method: resolution_method || '',
            knowledge_article: knowledge_article || '',
        }, req.user);

        await groupRepo.setProblemTicket(groupId, problemTicketId);

        const actor = req.user.displayName || req.user.username;
        for (const m of group.members) {
            try {
                await historyRepo.log(m.ticket_id, req.user.id, 'problem_created', null, null, String(problemTicketId),
                    `Problème #${problemTicketId} créé par ${actor}`);
            } catch (e) {}
        }
        res.status(201).json({ problem_ticket_id: problemTicketId, message: 'Problème créé avec succès' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

module.exports = router;
