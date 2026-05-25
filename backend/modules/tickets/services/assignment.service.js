const { pgDb } = require('../../../shared/database');
const ticketRepo = require('../repositories/ticket.repository');
const historyRepo = require('../repositories/history.repository');
const notificationService = require('./notification.service');

module.exports = {
    async assign(ticketId, { technician_id, technician_username, group_id }, user) {
        const ticket = await ticketRepo.findById(ticketId);
        if (!ticket) throw new Error('Ticket non trouvé');

        // Resolve technician ID: prefer username lookup, then validate passed ID
        let resolvedTechId = null;
        if (technician_username) {
            const hubUser = await pgDb.get('SELECT id, displayName FROM hub.users WHERE LOWER(username) = LOWER($1)', [technician_username]);
            if (hubUser) { resolvedTechId = hubUser.id; }
            else { console.log('[ASSIGN] WARNING: username %s not found in hub.users', technician_username); }
        } else if (technician_id) {
            const exists = await pgDb.get('SELECT id, displayName FROM hub.users WHERE id = $1', [technician_id]);
            if (exists) { resolvedTechId = technician_id; }
            else if (user?.username) {
                const hubUser = await pgDb.get('SELECT id, displayName FROM hub.users WHERE LOWER(username) = LOWER($1)', [user.username]);
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

        // Remove old assignments for this ticket
        await pgDb.run('DELETE FROM hub_tickets.ticket_assignments WHERE ticket_id = $1', [ticketId]);

        // Insert new assignment
        await pgDb.run(`
            INSERT INTO hub_tickets.ticket_assignments
                (ticket_id, technician_id, group_id, assigned_by, is_primary)
            VALUES ($1, $2, $3, $4, true)
        `, [ticketId, resolvedTechId || null, group_id || null, resolvedUserId]);

        if (resolvedTechId) {
            try {
                await historyRepo.log(ticketId, resolvedUserId, 'assigned', 'technician_id',
                    '', String(resolvedTechId));
            } catch (e) { console.error('[HISTORY] assign log failed:', e.message); }

            if (ticket.status === 1) {
                await ticketRepo.update(ticketId, { status: 2 });
                try {
                    await historyRepo.log(ticketId, resolvedUserId, 'status_changed', 'status', '1', '2', 'Assignation automatique');
                } catch (e) { console.error('[HISTORY] auto-status log failed:', e.message); }
            }

            await notificationService.trigger('ticket.assigned', { ticket_id: ticketId, user, technician_id: resolvedTechId });
        }

        if (group_id) {
            try {
                await historyRepo.log(ticketId, resolvedUserId, 'assigned_group', 'group_id',
                    '', String(group_id));
            } catch (e) { console.error('[HISTORY] group assign log failed:', e.message); }
        }
    },

    async assignToMultiple(ticketId, { user_id, group_id, is_primary, skipHistory }, user) {
        const ticket = await ticketRepo.findById(ticketId);
        if (!ticket) throw new Error('Ticket non trouvé');

        let resolvedUserId = user_id;
        if (resolvedUserId) {
            const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [resolvedUserId]);
            if (!exists) {
                const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [user?.username || '']);
                if (hubUser) resolvedUserId = hubUser.id;
            }
        }

        let resolvedAssignedBy = user?.id;
        if (resolvedAssignedBy && user?.username) {
            const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [resolvedAssignedBy]);
            if (!exists) {
                const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [user.username]);
                if (hubUser) resolvedAssignedBy = hubUser.id;
            }
        }

        // Check if already assigned
        const existing = await pgDb.get(
            'SELECT id FROM hub_tickets.ticket_assignments WHERE ticket_id = $1 AND technician_id = $2',
            [ticketId, resolvedUserId]
        );
        if (existing) {
            // Update is_primary if needed
            await pgDb.run('UPDATE hub_tickets.ticket_assignments SET is_primary = $1, group_id = $2 WHERE id = $3',
                [is_primary ? true : false, group_id || null, existing.id]);
            return;
        }

        // Insert assignment
        await pgDb.run(`
            INSERT INTO hub_tickets.ticket_assignments
                (ticket_id, technician_id, group_id, assigned_by, is_primary)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
        `, [ticketId, resolvedUserId, group_id || null, resolvedAssignedBy, is_primary ? true : false]);

        if (resolvedUserId && !skipHistory) {
            try {
                await historyRepo.log(ticketId, resolvedAssignedBy, 'assigned', 'technician_id',
                    '', String(resolvedUserId));
            } catch (e) { console.error('[HISTORY] assign log failed:', e.message); }
        }

        if (resolvedUserId && is_primary && ticket.status === 1) {
            await ticketRepo.update(ticketId, { status: 2 });
            if (!skipHistory) {
                try {
                    await historyRepo.log(ticketId, resolvedAssignedBy, 'status_changed', 'status', '1', '2', 'Assignation automatique');
                } catch (e) { console.error('[HISTORY] auto-status log failed:', e.message); }
            }
        }

        if (resolvedUserId) {
            await notificationService.trigger('ticket.assigned', { ticket_id: ticketId, user, technician_id: resolvedUserId });
        }
    },

    async autoAssign(ticket) {
        // Check VIP requester first — mark ticket as VIP regardless of rules
        await this.checkVipRequester(ticket);

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

    async checkVipRequester(ticket) {
        const email = ticket.requester_email_22 || '';
        const requesterName = ticket.requester_name || '';
        if (!email && !requesterName) return;
        const vip = await pgDb.get(
            `SELECT id FROM hub_tickets.vip_users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2) LIMIT 1`,
            [email, requesterName]
        );
        if (vip) {
            await ticketRepo.update(ticket.glpi_id, { is_vip: true });
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
        if (rule.match_type === 'vip_requester') {
            return !!ticket.is_vip;
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
