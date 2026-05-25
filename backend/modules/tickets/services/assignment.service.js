const { pgDb } = require('../../../shared/database');
const ticketRepo = require('../repositories/ticket.repository');
const historyRepo = require('../repositories/history.repository');
const notificationService = require('./notification.service');

module.exports = {
    async assign(ticketId, { technician_id, group_id }, user) {
        const ticket = await ticketRepo.findById(ticketId);
        if (!ticket) throw new Error('Ticket non trouvé');

        // Résoudre les IDs SQLite → PostgreSQL hub.users.id par username
        let resolvedTechId = technician_id;
        if (resolvedTechId) {
            const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [resolvedTechId]);
            if (!exists && user?.username) {
                const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [user.username]);
                if (hubUser) { resolvedTechId = hubUser.id; console.log('[ASSIGN] Resolved techId %s -> %d (by username)', technician_id, hubUser.id); }
                else { console.log('[ASSIGN] WARNING: techId %s not found in hub.users and no username match for %s', technician_id, user.username); }
            }
        }

        let resolvedUserId = user?.id;
        if (resolvedUserId && user?.username) {
            const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [resolvedUserId]);
            if (!exists) {
                const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [user.username]);
                if (hubUser) { resolvedUserId = hubUser.id; console.log('[ASSIGN] Resolved userId %s -> %d (by username %s)', user.id, hubUser.id, user.username); }
            }
        }

        const existing = await pgDb.get(
            'SELECT technician_id, group_id FROM hub_tickets.ticket_assignments WHERE ticket_id = $1',
            [ticketId]
        );

        const oldTechId = existing?.technician_id;
        const oldGroupId = existing?.group_id;

        if (existing) {
            await pgDb.run(`
                UPDATE hub_tickets.ticket_assignments
                SET technician_id = $1, group_id = $2, assigned_at = $3, assigned_by = $4
                WHERE ticket_id = $5
            `, [resolvedTechId || null, group_id || null, new Date(), resolvedUserId, ticketId]);
        } else {
            await pgDb.run(`
                INSERT INTO hub_tickets.ticket_assignments
                    (ticket_id, technician_id, group_id, assigned_by)
                VALUES ($1, $2, $3, $4)
            `, [ticketId, resolvedTechId || null, group_id || null, resolvedUserId]);
        }

        if (resolvedTechId && resolvedTechId !== oldTechId) {
            try {
                await historyRepo.log(ticketId, resolvedUserId, 'assigned', 'technician_id',
                    String(oldTechId || ''), String(resolvedTechId));
            } catch (e) { console.error('[HISTORY] assign log failed:', e.message); }

            if (ticket.status === 1) {
                await ticketRepo.update(ticketId, { status: 2 });
                try {
                    await historyRepo.log(ticketId, resolvedUserId, 'status_changed', 'status', '1', '2', 'Assignation automatique');
                } catch (e) { console.error('[HISTORY] auto-status log failed:', e.message); }
            }

            await notificationService.trigger('ticket.assigned', { ticket_id: ticketId, user, technician_id: resolvedTechId });
        }

        if (group_id && group_id !== oldGroupId) {
            try {
                await historyRepo.log(ticketId, resolvedUserId, 'assigned_group', 'group_id',
                    String(oldGroupId || ''), String(group_id));
            } catch (e) { console.error('[HISTORY] group assign log failed:', e.message); }
        }
    },

    async autoAssign(ticket) {
        const rules = await pgDb.all(`
            SELECT * FROM hub_tickets.assignment_rules
            WHERE is_active = true
            ORDER BY priority ASC
        `);

        for (const rule of rules) {
            if (!this.matchesRule(ticket, rule)) continue;

            if (rule.assign_type === 'technician') {
                await this.assign(ticket.glpi_id, { technician_id: rule.assign_to_id }, { id: null, username: 'system' });
                return;
            } else if (rule.assign_type === 'group') {
                const tech = await this.findLeastBusyInGroup(rule.assign_to_id);
                if (tech) {
                    await this.assign(ticket.glpi_id, { technician_id: tech.user_id, group_id: rule.assign_to_id }, { id: null, username: 'system' });
                    return;
                }
            }
        }
    },

    matchesRule(ticket, rule) {
        if (!rule.match_type || rule.match_type === 'any') return true;
        if (rule.match_type === 'category') {
            const catId = String(ticket.category_id || '');
            return catId === String(rule.match_value);
        }
        if (rule.match_type === 'priority') {
            return String(ticket.priority || '') === String(rule.match_value);
        }
        if (rule.match_type === 'type') {
            return (ticket.type || '') === rule.match_value;
        }
        return true;
    },

    async findLeastBusyInGroup(groupId) {
        return pgDb.get(`
            SELECT tgm.user_id, COUNT(ta.id) as active_tickets
            FROM hub_tickets.technician_group_members tgm
            LEFT JOIN hub_tickets.ticket_assignments ta
                ON ta.technician_id = tgm.user_id
                AND ta.ticket_id IN (
                    SELECT glpi_id FROM hub_tickets.tickets
                    WHERE status IN (1, 2, 3) AND source = 'hub'
                )
            WHERE tgm.group_id = $1
            GROUP BY tgm.user_id
            ORDER BY active_tickets ASC
            LIMIT 1
        `, [groupId]);
    },
};
