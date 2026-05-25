const { pgDb } = require('../../../shared/database');
const ticketRepo = require('../repositories/ticket.repository');
const historyRepo = require('../repositories/history.repository');
const slaRepo = require('../repositories/sla.repository');
const notificationService = require('./notification.service');
const { normalizeRole, resolveTicketRole } = require('../middleware/ticket-permissions');

// Utilise les rôles NORMALISÉS (normalizeRole) pour la comparaison
// Toutes les transitions sont autorisées (workflow à définir ultérieurement)
const ALL_STATUSES = [1, 2, 3, 4, 5, 6, 7, 8];
const TRANSITIONS = Object.fromEntries(
    ALL_STATUSES.map(s => [s, { to: ALL_STATUSES.filter(t => t !== s), roles: ['user', 'technician', 'supervisor', 'admin', 'superadmin'] }])
);

module.exports = {
    async changeStatus(ticketId, newStatus, userId, comment, user) {
        const ticket = await ticketRepo.findById(ticketId);
        if (!ticket) throw new Error('Ticket non trouvé');

        const resolvedUserId = await resolveUserId(user) || userId;

        const currentStatus = ticket.status;
        const transition = TRANSITIONS[currentStatus];

        if (!transition || !transition.to.includes(newStatus)) {
            throw new Error(`Transition ${currentStatus} → ${newStatus} non autorisée`);
        }

        const role = await resolveTicketRole(user);
        if (!transition.roles.includes(role) && !transition.roles.includes('auto')) {
            throw new Error('Permission refusée pour cette transition');
        }

        // Suivi du temps d'attente : si on sort d'un statut attente, on ajoute le temps écoulé
        if ([4, 5].includes(currentStatus) && ![4, 5].includes(newStatus)) {
            try {
                const lastEntry = await pgDb.get(`
                    SELECT created_at FROM hub_tickets.ticket_history
                    WHERE ticket_id = $1 AND action = 'status_changed'
                      AND new_value IN ('4','5')
                    ORDER BY created_at DESC LIMIT 1
                `, [ticketId]);
                if (lastEntry) {
                    const waitingSeconds = Math.round((Date.now() - new Date(lastEntry.created_at).getTime()) / 1000);
                    if (waitingSeconds > 0) {
                        await pgDb.run(
                            'UPDATE hub_tickets.tickets SET total_waiting_seconds = COALESCE(total_waiting_seconds, 0) + $1 WHERE glpi_id = $2',
                            [waitingSeconds, ticketId]
                        );
                    }
                }
            } catch (e) { console.error('[WAITING] tracking failed:', e.message); }
        }

        await ticketRepo.update(ticketId, { status: newStatus });

        try {
            await historyRepo.log(ticketId, resolvedUserId, 'status_changed', 'status',
                String(currentStatus), String(newStatus), comment || null);
        } catch (e) { console.error('[HISTORY] status_changed log failed:', e.message); }

        // Gestion SLA : pause/resume selon statuts "en attente"
        const sla = await slaRepo.findByTicket(ticketId);
        if (sla) {
            if ([4, 5].includes(newStatus)) {
                await slaRepo.pauseSla(sla.id, 'waiting');
            } else if (currentStatus === 4 || currentStatus === 5) {
                await slaRepo.resumeSla(sla.id);
            }
            if (newStatus === 6) {
                await slaRepo.updateSlaStatus(sla.id, 'ok');
            }
        }

        await notificationService.trigger('ticket.status_changed', {
            ticket_id: ticketId, user, oldStatus: currentStatus, newStatus
        });

        return ticket;
    },

    async reopen(ticketId, user) {
        const ticket = await ticketRepo.findById(ticketId);
        if (!ticket) throw new Error('Ticket non trouvé');

        if (ticket.status !== 6 && ticket.status !== 7) {
            throw new Error('Seuls les tickets Résolus ou Fermés peuvent être réouverts');
        }

        const role = await resolveTicketRole(user);
        const resolvedUserId = await resolveUserId(user);

        if (role === 'user') {
            if (ticket.requester_email_22 !== user.email) {
                throw new Error('Vous ne pouvez pas réouvrir ce ticket');
            }
            const closedDate = new Date(ticket.date_closed || ticket.date_mod);
            const daysSinceClose = (Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceClose > 7) {
                throw new Error('Délai de réouverture dépassé (7 jours). Veuillez créer un nouveau ticket.');
            }
        }

        await this.changeStatus(ticketId, 3, resolvedUserId, 'Réouverture du ticket', user);

        await notificationService.trigger('ticket.reopened', {
            ticket_id: ticketId, user
        });
    },
};

async function resolveUserId(user) {
    if (!user?.username) return null;
    if (user.id) {
        const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [user.id]);
        if (exists) return user.id;
    }
    const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [user.username]);
    return hubUser?.id || null;
}
