const { pgDb } = require('../../../shared/database');
const ticketRepo = require('../repositories/ticket.repository');
const historyRepo = require('../repositories/history.repository');
const slaRepo = require('../repositories/sla.repository');
const notificationService = require('./notification.service');
const { normalizeRole, resolveTicketRole } = require('../middleware/ticket-permissions');
const { toParisSql } = require('../../../shared/utils');

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

        // Suivi du temps d'attente : si on sort du statut "En attente" (4), on ajoute le temps écoulé
        if (currentStatus === 4 && newStatus !== 4) {
            try {
                const lastEntry = await pgDb.get(`
                    SELECT created_at FROM hub_tickets.ticket_history
                    WHERE ticket_id = $1 AND action = 'status_changed'
                      AND new_value = '4'
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
                String(currentStatus), String(newStatus), comment || null, user?.username || null);
        } catch (e) { console.error('[HISTORY] status_changed log failed:', e.message); }

        // Gestion SLA : pause/resume selon statuts "en attente"
        const sla = await slaRepo.findByTicket(ticketId);
        if (sla) {
            if (newStatus === 4) {
                await slaRepo.pauseSla(sla.id, 'waiting');
            } else if (currentStatus === 4) {
                await slaRepo.resumeSla(sla.id);
            }
            if (newStatus === 5 || newStatus === 6) {
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

        if (ticket.status !== 5 && ticket.status !== 6 && ticket.status !== 8) {
            throw new Error('Seuls les tickets Résolus, Clos ou Rejetés peuvent être réouverts');
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

        const targetStatus = (ticket.technician_id || ticket.group_id) ? 2 : 1;
        await this.changeStatus(ticketId, targetStatus, resolvedUserId, 'Réouverture du ticket', user);

        await notificationService.trigger('ticket.reopened', {
            ticket_id: ticketId, user
        });
    },

    // Clôture automatique des tickets résolus (statut 5) depuis plus de N jours.
    // N est lu depuis hub_tickets.module_config (clé auto_close_days, défaut 7 ; 0 = désactivé).
    // Déclenché par le balayage horaire (et au démarrage du serveur, pour
    // rattraper les exécutions manquées). Chaque clôture est tracée dans
    // ticket_history (action status_changed, new_value 6, auteur = Système)
    // afin d'alimenter le log de clôture.
    //
    // Le balayage est auto-réparateur : les tickets résolus dont la date de
    // résolution a été perdue (resynchronisation GLPI) sont d'abord remis en
    // état à partir de l'historique, sans quoi ils resteraient au statut 5
    // indéfiniment.
    //
    // Options :
    //   notify : 'fresh' (défaut) → notifie seulement les clôtures du jour ;
    //            'all' → notifie tout ; 'none' → ne notifie pas.
    //            (une clôture rétroactive de plusieurs mois n'a pas vocation à
    //            déclencher un mail au demandeur)
    //   dryRun : true → ne modifie rien, retourne la liste des tickets concernés.
    async autoCloseResolvedTickets(options = {}) {
        const { notify = 'fresh', dryRun = false } = options;
        const cfg = await pgDb.get("SELECT value FROM hub_tickets.module_config WHERE key = 'auto_close_days'");
        const days = parseInt(cfg?.value ?? '7', 10);
        if (!Number.isFinite(days) || days <= 0) {
            return { closed: 0, days, disabled: true, repaired: 0 };
        }

        // 1. Réparation : les tickets résolus sans date de résolution sont
        //    remis en état à partir de l'historique (sinon : jamais éligibles).
        let repaired = 0;
        if (!dryRun) {
            const restored = await ticketRepo.repairMissingResolvedDates();
            repaired = restored.length;
            if (repaired > 0) {
                console.log(`[AUTO-CLOSE] ${repaired} ticket(s) résolu(s) sans date de résolution → date restaurée depuis l'historique.`);
            }
        }

        // 2. Sélection des tickets résolus depuis plus de N jours.
        const rows = await ticketRepo.findResolvedTicketsToClose(days);
        if (dryRun) {
            return { closed: 0, days, disabled: false, repaired, candidates: rows };
        }

        // 3. Clôture. La date de clôture est la date théorique (résolution +
        //    délai) : une clôture rattrée est datée du jour où elle aurait dû
        //    avoir lieu, ce qui garde l'historique des KPI cohérent.
        const todayParis = toParisSql().slice(0, 10);
        let closed = 0;
        let notified = 0;
        for (const t of rows) {
            const isFresh = String(t.due_at).slice(0, 10) >= todayParis;
            try {
                await ticketRepo.update(t.glpi_id, { status: 6, date_closed: t.due_at });
                await historyRepo.log(t.glpi_id, null, 'status_changed', 'status', '5', '6',
                    `Clôture automatique (résolu depuis plus de ${days} j)`, null, t.due_at_utc);
                try {
                    const sla = await slaRepo.findByTicket(t.glpi_id);
                    if (sla) await slaRepo.updateSlaStatus(sla.id, 'ok');
                } catch (e) { /* SLA facultatif */ }
                if (notify === 'all' || (notify === 'fresh' && isFresh)) {
                    try { await notificationService.trigger('ticket.closed', { ticket_id: t.glpi_id }); } catch (e) { /* notif facultative */ }
                    notified++;
                }
                closed++;
            } catch (e) {
                console.error(`[AUTO-CLOSE] Échec clôture ticket ${t.glpi_id}:`, e.message);
            }
        }
        if (closed > 0) console.log(`[AUTO-CLOSE] ${closed} ticket(s) clos automatiquement (délai ${days} j, ${notified} notification(s)).`);
        return { closed, days, disabled: false, repaired, notified };
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
