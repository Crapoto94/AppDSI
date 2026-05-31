const crypto = require('crypto');
const repo = require('../repositories/auto-resolution.repository');
const commentRepo = require('../../tickets/repositories/comment.repository');
const historyRepo = require('../../tickets/repositories/history.repository');
const slaRepo = require('../../tickets/repositories/sla.repository');
const { pgDb } = require('../../../shared/database');

let _sendMail = null;
function setSendMail(fn) { _sendMail = fn; }

async function getAppBaseUrl() {
    try {
        const { getSqlite } = require('../../../shared/database');
        const db = getSqlite();
        const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
        const val = row?.setting_value?.trim();
        return val || process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    } catch {
        return process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    }
}

function generateToken() {
    return crypto.randomBytes(24).toString('hex');
}

function buildSystemUser(ticket) {
    return {
        id: 0,
        username: 'auto-resolution',
        displayName: 'Résolution Automatique',
        email: ticket.requester_email_22 || '',
        role: 'superadmin',
    };
}

module.exports = {
    setSendMail,

    async getSettings() {
        return repo.getSettings();
    },

    async updateSettings(data) {
        return repo.updateSettings(data);
    },

    async getLogs(limit, offset) {
        return repo.getLogs(limit, offset);
    },

    async getTicketInfoPublic(token) {
        const log = await repo.getLogByToken(token);
        if (!log) return null;
        const ticket = await repo.getTicketInfo(log.ticket_id);
        if (!ticket) return null;
        return {
            id: ticket.glpi_id,
            title: ticket.title,
            requester_name: ticket.requester_name,
            requester_email: ticket.requester_email_22,
            description: ticket.description,
            token,
        };
    },

    async submitKeepAlive(token, commentText) {
        const log = await repo.getLogByToken(token);
        if (!log) throw new Error('Lien invalide ou expiré');
        if (log.used_at) throw new Error('Ce lien a déjà été utilisé');

        const ticket = await repo.getTicketInfo(log.ticket_id);
        if (!ticket) throw new Error('Ticket introuvable');

        const sysUser = buildSystemUser(ticket);
        const ticketId = ticket.glpi_id;

        await commentRepo.create(ticketId, { content: commentText, is_private: 0, sent_to_user: 0 }, {
            ...sysUser,
            displayName: ticket.requester_name || 'Demandeur',
        });
        try {
            await historyRepo.log(ticketId, 0, 'comment_added', null, null, null,
                `Commentaire du demandeur (relance auto) : ${commentText.substring(0, 100)}`);
        } catch (e) {}

        const currentPriority = parseInt(ticket.priority) || 3;
        const newPriority = Math.min(5, currentPriority + 1);
        await pgDb.run('UPDATE hub_tickets.tickets SET priority = $1, date_mod = CURRENT_TIMESTAMP WHERE glpi_id = $2', [newPriority, ticketId]);

        await repo.markTicketKeepAlive(ticketId);
        await repo.addLog(ticketId, 'keep_alive', log.reminder_count, null, `Priorité passée de ${currentPriority} à ${newPriority}`);

        await pgDb.run(
            'UPDATE hub_tickets.auto_resolution_logs SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [log.id]
        );

        if (_sendMail) {
            const baseUrl = await getAppBaseUrl();
            const subject = `[Ticket #${ticketId}] Merci de votre confirmation`;
            const body = `<p>Bonjour ${ticket.requester_name || ''},</p>
                <p>Nous avons bien reçu votre confirmation pour le ticket <strong>#${ticketId} – ${ticket.title}</strong>.</p>
                <p>Votre commentaire a été ajouté au ticket et sa priorité a été augmentée. Nous traiterons votre demande en priorité.</p>
                <p>Vous pouvez suivre l'avancement de votre ticket ici :
                <a href="${baseUrl}/tickets/${ticketId}">#${ticketId} – ${ticket.title}</a></p>
                <p>Cordialement,<br>Le support DSI</p>`;
            try { await _sendMail(ticket.requester_email_22, subject, body); } catch (e) {}
        }

        return { ticket_id: ticketId, title: ticket.title, priority: newPriority };
    },

    async processTickets(requesterEmail = null) {
        const settings = await repo.getSettings();
        if (!settings.enabled && !requesterEmail) return { message: 'Résolution automatique désactivée', processed: 0 };

        const inactivityDays = requesterEmail ? 0 : settings.inactivity_days;
        const maxReminders = settings.max_reminders || 3;
        const frequencyDays = settings.reminder_frequency_days || 7;
        const notifyObservers = !!settings.notify_observers;
        const now = new Date().toISOString();

        let tickets;
        if (requesterEmail) {
            tickets = await repo.getTicketsByRequester(requesterEmail);
        } else {
            tickets = await repo.getTicketsPendingReminder(inactivityDays, now);
        }

        if (tickets.length === 0) return { message: 'Aucun ticket à traiter', processed: 0 };

        const baseUrl = await getAppBaseUrl();
        const results = { reminders_sent: 0, keep_alive: 0, closed: 0, errors: 0 };

        for (const ticket of tickets) {
            try {
                const reminderCount = parseInt(ticket.reminder_count) || 0;
                const lastReminderAt = ticket.last_reminder_at ? new Date(ticket.last_reminder_at) : null;

                let shouldSendReminder = false;
                let shouldClose = false;

                if (reminderCount === 0) {
                    shouldSendReminder = true;
                } else if (reminderCount < maxReminders) {
                    const nextReminder = new Date(lastReminderAt);
                    nextReminder.setDate(nextReminder.getDate() + frequencyDays);
                    if (new Date() >= nextReminder) {
                        shouldSendReminder = true;
                    }
                } else {
                    const closingDate = new Date(lastReminderAt);
                    closingDate.setDate(closingDate.getDate() + frequencyDays);
                    if (new Date() >= closingDate) {
                        shouldClose = true;
                    }
                }

                if (shouldSendReminder && !requesterEmail && !settings.enabled) continue;

                if (shouldClose) {
                    const sysUser = buildSystemUser(ticket);
                    const oldStatus = ticket.status;
                    await pgDb.run(`UPDATE hub_tickets.tickets SET status = '7', date_mod = CURRENT_TIMESTAMP, date_closed = CURRENT_TIMESTAMP WHERE glpi_id = $1`, [ticket.glpi_id]);
                    try {
                        await historyRepo.log(ticket.glpi_id, 0, 'status_changed', 'status', String(oldStatus), '7',
                            'Clôture automatique – aucune réponse après relances');
                    } catch (e) {}
                    await repo.markTicketClosed(ticket.glpi_id);
                    await repo.addLog(ticket.glpi_id, 'closed', reminderCount, null, 'Clôture automatique');

                    if (_sendMail && ticket.requester_email_22) {
                        const subject = `[Ticket #${ticket.glpi_id}] Votre ticket a été clôturé automatiquement`;
                        const body = `<p>Bonjour ${ticket.requester_name || ''},</p>
                            <p>Le ticket <strong>#${ticket.glpi_id} – ${ticket.title}</strong> a été automatiquement clôturé car nous n'avons pas reçu de réponse après ${maxReminders} relances.</p>
                            <p>Si vous avez encore besoin d'assistance, merci de créer un nouveau ticket.</p>
                            <p>Cordialement,<br>Le support DSI</p>`;
                        try { await _sendMail(ticket.requester_email_22, subject, body); } catch (e) {}
                    }
                    results.closed++;
                    continue;
                }

                if (shouldSendReminder) {
                    const token = generateToken();
                    const newReminderCount = reminderCount + 1;
                    const ticketId = ticket.glpi_id;

                    await repo.addLog(ticketId, 'reminder_sent', newReminderCount, token, `Relance n°${newReminderCount}/${maxReminders}`);

                    if (_sendMail && ticket.requester_email_22) {
                        const keepAliveUrl = `${baseUrl}/auto-resolution/keep-alive/${token}`;
                        const lastActivityDate = new Date(ticket.date_mod || ticket.date_creation);
                        const today = new Date();
                        const actualInactivityDays = Math.floor((today - lastActivityDate) / (1000 * 60 * 60 * 24));

                        const subject = (settings.reminder_subject || 'Votre ticket n°{{ticket_id}} est-il toujours d\'actualité ?')
                            .replace(/\{\{ticket_id\}\}/g, String(ticketId))
                            .replace(/\{\{ticket_title\}\}/g, ticket.title || '')
                            .replace(/\{\{inactivity_days\}\}/g, String(actualInactivityDays))
                            .replace(/\{\{max_reminders\}\}/g, String(maxReminders))
                            .replace(/\{\{reminder_count\}\}/g, String(newReminderCount));

                        let body = (settings.reminder_message || '').trim() || `<p>Bonjour ${ticket.requester_name || ''},</p>
                            <p>Le ticket <strong>#${ticketId} – ${ticket.title}</strong> n'a pas eu d'activité depuis ${actualInactivityDays} jours.</p>
                            <p>Si vous avez encore besoin d'assistance, merci de cliquer sur le bouton ci-dessous :</p>
                            <p><a href="${keepAliveUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Mon ticket est toujours d'actualité</a></p>
                            <p style="font-size:12px;color:#94a3b8;">Ou copiez ce lien : ${keepAliveUrl}</p>`;

                        body = body
                            .replace(/\{\{ticket_id\}\}/g, String(ticketId))
                            .replace(/\{\{ticket_title\}\}/g, ticket.title || '')
                            .replace(/\{\{requester_name\}\}/g, ticket.requester_name || '')
                            .replace(/\{\{inactivity_days\}\}/g, String(actualInactivityDays))
                            .replace(/\{\{max_reminders\}\}/g, String(maxReminders))
                            .replace(/\{\{reminder_count\}\}/g, String(newReminderCount))
                            .replace(/\{\{keep_alive_url\}\}/g, keepAliveUrl);

                        try { await _sendMail(ticket.requester_email_22, subject, body); } catch (e) {}

                        if (notifyObservers) {
                            try {
                                const observers = await pgDb.all(
                                    'SELECT email FROM hub_tickets.observers WHERE ticket_id = $1 AND is_active = 1 AND email IS NOT NULL',
                                    [ticketId]
                                );
                                for (const obs of observers) {
                                    if (obs.email !== ticket.requester_email_22) {
                                        try { await _sendMail(obs.email, `[Relance] ${subject}`, body); } catch (e) {}
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                    results.reminders_sent++;
                }
            } catch (e) {
                console.error(`[AUTO-RESOLUTION] Error processing ticket #${ticket.glpi_id}:`, e.message);
                results.errors++;
            }
        }

        return {
            message: `${results.reminders_sent} relance(s) envoyée(s), ${results.closed} ticket(s) clôturé(s), ${results.keep_alive} confirmé(s), ${results.errors} erreur(s)`,
            ...results,
            total_tickets: tickets.length,
        };
    },
};
