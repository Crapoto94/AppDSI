const { pgDb } = require('../../../shared/database');
const ticketRepo = require('../repositories/ticket.repository');
const historyRepo = require('../repositories/history.repository');
const slaRepo = require('../repositories/sla.repository');
const notificationService = require('./notification.service');
const assignmentService = require('./assignment.service');
const slaService = require('./sla.service');
const observerRepo = require('../repositories/observer.repository');
const ticketDto = require('../dtos/ticket.dto');
const { normalizeRole } = require('../middleware/ticket-permissions');

function normalizeTicketType(type) {
    if (type === 1 || type === '1' || type === 'incident') return 1;
    if (type === 2 || type === '2' || type === 'request') return 2;
    if (type === 3 || type === '3' || type === 'problem') return 3;
    return type;
}

module.exports = {
    async findAll(filters, pagination, user) {
        const result = await ticketRepo.findAll(filters, pagination, user);
        return {
            data: result.data.map(t => ticketDto.toListDTO(t)),
            pagination: result.pagination,
        };
    },

    async findById(id, user) {
        const ticket = await ticketRepo.findById(id);
        if (!ticket) return null;
        return ticketDto.toDTO(ticket);
    },

    async create(data, user) {
        const ticketData = {
            ...data,
            type: normalizeTicketType(data.type) || 1,
            requester_name: data.requester_name || user.displayName || user.username,
            requester_email: data.requester_email || user.email,
        };

        const ticketId = await ticketRepo.create(ticketData);

        try { await historyRepo.log(ticketId, user.id, 'created', 'status', null, '1', 'Ticket créé'); }
        catch (e) { console.error('[TICKET] history log failed:', e.message); }

        try { await slaService.applySLA(ticketId, ticketData); }
        catch (e) { console.error('[TICKET] SLA apply failed:', e.message); }

        try { await notificationService.trigger('ticket.created', { ticket_id: ticketId, user }); }
        catch (e) { console.error('[TICKET] notification failed:', e.message); }

        // Ajouter les observateurs si fournis
        if (data.observer_ids && Array.isArray(data.observer_ids)) {
            for (const obs of data.observer_ids) {
                try {
                    let userId = obs.user_id;
                    if (!userId) {
                        const existing = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [obs.username || '']);
                        if (existing) {
                            userId = existing.id;
                        } else {
                            const result = await pgDb.run(
                                'INSERT INTO hub.users (username, "displayName", email, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET "displayName" = EXCLUDED."displayName" RETURNING id',
                                [obs.username || obs.name, obs.name || obs.username, obs.email || '', 'user']
                            );
                            userId = result.lastID || result.id;
                        }
                    }
                    if (userId) {
                        await observerRepo.add(ticketId, userId, { displayName: obs.name, username: obs.username, email: obs.email });
                    }
                } catch (e) {
                    console.error('[TICKET] add observer failed for obs=%j:', { user_id: obs.user_id, username: obs.username }, e.message);
                }
            }
        }

        process.nextTick(async () => {
            try {
                await assignmentService.autoAssign({ glpi_id: ticketId, ...ticketData });
            } catch (e) {
                console.error('[AUTO-ASSIGN]', e.message);
            }
        });

        return ticketId;
    },

    async update(id, data, user) {
        const ticket = await ticketRepo.findById(id);
        if (!ticket) throw new Error('Ticket non trouvé');

        const oldValues = {};
        for (const key of Object.keys(data)) {
            oldValues[key] = ticket[key];
        }

        await ticketRepo.update(id, data);

        for (const key of Object.keys(data)) {
            if (oldValues[key] !== data[key]) {
                await historyRepo.log(id, user.id, 'updated', key, String(oldValues[key] || ''), String(data[key] || ''));
            }
        }

        // Synchroniser les observateurs si fournis
        if (data.observer_ids && Array.isArray(data.observer_ids)) {
            const existing = await observerRepo.findByTicket(id);
            const existingIds = existing.map(o => o.user_id);
            const newIds = data.observer_ids.map(o => o.user_id).filter(Boolean);

            // Supprimer ceux qui ne sont plus dans la liste
            for (const obs of existing) {
                if (!newIds.includes(obs.user_id)) {
                    try { await observerRepo.remove(id, obs.user_id); } catch (e) { console.error('[TICKET] remove observer failed:', e.message); }
                }
            }

            // Ajouter les nouveaux
            for (const obs of data.observer_ids) {
                let userId = obs.user_id;
                if (!userId) {
                    const existing = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [obs.username || '']);
                    if (existing) {
                        userId = existing.id;
                    } else {
                        const result = await pgDb.run(
                            'INSERT INTO hub.users (username, "displayName", email, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET "displayName" = EXCLUDED."displayName" RETURNING id',
                            [obs.username || obs.name, obs.name || obs.username, obs.email || '', 'user']
                        );
                        userId = result.lastID || result.id;
                    }
                }
                if (userId && !existingIds.includes(userId)) {
                    try {
                        await observerRepo.add(id, userId, { displayName: obs.name, username: obs.username, email: obs.email });
                    } catch (e) { console.error('[TICKET] add observer failed for obs=%j:', { user_id: obs.user_id, username: obs.username }, e.message); }
                }
            }
        }
    },

    async setSolution(id, solution, user) {
        await ticketRepo.update(id, { solution, status: 6, date_solved: new Date().toISOString() });
        await historyRepo.log(id, user.id, 'solved', 'solution', null, solution, 'Solution fournie');

        const sla = await slaRepo.findByTicket(id);
        if (sla) {
            await slaRepo.updateSlaStatus(sla.id, 'ok');
        }

        await notificationService.trigger('ticket.resolved', { ticket_id: id, user, solution });
    },

    async softDelete(id, user) {
        const { pool } = require('../../../shared/database');

        // Supprimer les tâches liées à ce ticket
        await pool.query(
            'DELETE FROM hub.user_tasks WHERE context_source = $1 AND context_id = $2',
            ['ticket', id]
        );

        await ticketRepo.softDelete(id);
        await historyRepo.log(id, user.id, 'deleted', 'status', null, '8', 'Ticket supprimé');
    },

    async getDashboardStats(user) {
        const stats = await ticketRepo.getDashboardStats();
        const myStats = await ticketRepo.getMyStats(user.username);
        const userCounts = await ticketRepo.getDashboardUserCounts(user);
        const timeStats = await ticketRepo.getTimeStats();
        const weekStats = await ticketRepo.getResolvedWeekTimeStats();
        return {
            ...stats,
            my_tickets: myStats?.total || 0,
            user_counts: userCounts || {},
            avg_waiting_seconds_active: timeStats?.avg_waiting_seconds_active || 0,
            avg_active_seconds_resolved_week: weekStats?.avg_active_seconds_week || 0,
            resolved_week_count: weekStats?.resolved_count || 0,
            avg_age_open_seconds: timeStats?.avg_age_open_seconds || 0,
        };
    },

    async getMyStats(user) {
        return ticketRepo.getMyStats(user.id);
    },

    async saveDailyKpiSnapshot() {
        const stats = await ticketRepo.getDashboardStats();
        const timeStats = await ticketRepo.getTimeStats();
        const weekStats = await ticketRepo.getResolvedWeekTimeStats();
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        await ticketRepo.saveKpiSnapshot({
            snapshot_date: today,
            total: stats?.total || 0,
            open: stats?.open || 0,
            in_progress: stats?.in_progress || 0,
            waiting: stats?.waiting || 0,
            critical_open: stats?.critical_open || 0,
            resolved: stats?.resolved || 0,
            closed: stats?.closed || 0,
            problems: stats?.problems || 0,
            vip_total: stats?.vip_total || 0,
            open_incident: stats?.open_incident || 0,
            open_request: stats?.open_request || 0,
            avg_age_open_seconds: timeStats?.avg_age_open_seconds || 0,
            avg_waiting_seconds_active: timeStats?.avg_waiting_seconds_active || 0,
            avg_active_seconds_week: weekStats?.avg_active_seconds_week || 0,
            resolved_week_count: weekStats?.resolved_count || 0,
        });
        console.log(`[KPI HISTORY] Snapshot sauvegardé pour ${today}`);
    },

    async getKpiHistory(days = 30) {
        return ticketRepo.getKpiHistory(days);
    },

    async backfillKpiHistory(days = 30) {
        const count = await ticketRepo.backfillKpiHistory(days);
        console.log(`[KPI HISTORY] Rétro-calcul : ${count} snapshots générés sur ${days} jours`);
        return count;
    },

    async getDailyMetrics() {
        return ticketRepo.getDailyMetricsWithRollingAverage();
    },
};
