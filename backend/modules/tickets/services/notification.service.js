const { pgDb, getSqlite } = require('../../../shared/database');

module.exports = {
    async trigger(event, context) {
        try {
            // Check if mail is enabled locally in SQLite before doing anything
            const sqlite = getSqlite();
            const mailSettings = await sqlite.get('SELECT global_enable FROM mail_settings WHERE id = 1');
            if (!mailSettings || !mailSettings.global_enable) {
                console.log('[NOTIFICATION] Mail sending disabled locally, skipping trigger');
                return;
            }

            const triggers = await pgDb.all(`
                SELECT nt.*, ntr.recipient_type
                FROM hub_tickets.notification_triggers ntr
                JOIN hub_tickets.notification_templates nt ON ntr.template_slug = nt.slug
                WHERE ntr.event = $1 AND ntr.is_active = true AND nt.is_active = true
            `, [event]);

            if (!triggers.length) return;

            const ticket = await pgDb.get(`
                SELECT t.*, ta.technician_id
                FROM hub_tickets.tickets t
                LEFT JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
                WHERE t.glpi_id = $1
            `, [context.ticket_id]);

            if (!ticket) return;

            for (const trigger of triggers) {
                const recipients = await this.getRecipients(trigger.recipient_type, ticket, context);
                for (const recipient of recipients) {
                    if (!recipient.email) continue;

                    const bodyHtml = this.fillTemplate(trigger.body_html, { ...context, ticket, recipient });
                    const subject = this.fillTemplate(trigger.subject, { ...context, ticket, recipient });

                    const dup = await pgDb.get(`
                        SELECT id FROM hub_tickets.notification_queue
                        WHERE ticket_id = $1 AND recipient_email = $2 AND subject = $3 AND status IN ('pending', 'sent') AND created_at > NOW() - INTERVAL '1 hour'
                    `, [context.ticket_id, recipient.email, subject]);
                    if (dup) continue;
                    await pgDb.run(`
                        INSERT INTO hub_tickets.notification_queue
                            (ticket_id, recipient_email, recipient_name, subject, body_html, status)
                        VALUES ($1, $2, $3, $4, $5, 'pending')
                    `, [context.ticket_id, recipient.email, recipient.name, subject, bodyHtml]);
                }
            }
        } catch (error) {
            console.error('[NOTIFICATION] Error triggering event:', event, error.message);
        }
    },

    async getRecipients(recipientType, ticket, context) {
        const recipients = [];

        switch (recipientType) {
            case 'requester':
                if (ticket.requester_email_22) {
                    recipients.push({ email: ticket.requester_email_22, name: ticket.requester_name });
                }
                break;
            case 'technician':
                if (ticket.technician_id) {
                    const tech = await pgDb.get('SELECT email, displayName FROM hub.users WHERE id = $1', [ticket.technician_id]);
                    if (tech?.email) recipients.push({ email: tech.email, name: tech.displayName });
                }
                break;
            case 'supervisor': {
                const supervisors = await pgDb.all(`
                    SELECT DISTINCT u.email, u.displayName
                    FROM hub.users u
                    JOIN hub_tickets.technician_group_members tgm ON u.id = tgm.user_id
                    JOIN hub_tickets.ticket_assignments ta ON ta.group_id = tgm.group_id
                    WHERE ta.ticket_id = $1 AND u.role IN ('supervisor', 'admin', 'superadmin')
                `, [context.ticket_id]);
                recipients.push(...supervisors.filter(s => s.email).map(s => ({ email: s.email, name: s.displayName })));
                break;
            }
            case 'admin': {
                const admins = await pgDb.all(
                    "SELECT email, displayName FROM hub.users WHERE role IN ('admin', 'superadmin') AND email IS NOT NULL"
                );
                recipients.push(...admins.map(a => ({ email: a.email, name: a.displayName })));
                break;
            }
            case 'watchers': {
                const watchers = await pgDb.all(`
                    SELECT DISTINCT u.email, u.displayName
                    FROM hub_tickets.observers o
                    JOIN hub.users u ON o.user_id = u.id
                    WHERE o.ticket_id = $1 AND o.is_active = 1
                `, [context.ticket_id]);
                recipients.push(...watchers.filter(w => w.email).map(w => ({ email: w.email, name: w.displayName })));
                break;
            }
            case 'group': {
                const groupMembers = await pgDb.all(`
                    SELECT DISTINCT u.email, u.displayName
                    FROM hub_tickets.technician_group_members tgm
                    JOIN hub.users u ON tgm.user_id = u.id
                    JOIN hub_tickets.ticket_assignments ta ON ta.group_id = tgm.group_id
                    WHERE ta.ticket_id = $1
                `, [context.ticket_id]);
                recipients.push(...groupMembers.filter(g => g.email).map(g => ({ email: g.email, name: g.displayName })));
                break;
            }
            default:
                if (context.recipient_email) {
                    recipients.push({ email: context.recipient_email, name: context.recipient_name });
                }
        }

        // Déduplication
        const seen = new Set();
        return recipients.filter(r => {
            const key = r.email?.toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    fillTemplate(template, context) {
        const { ticket, recipient, user, oldStatus, newStatus, solution, sla_data, sla_type, comment } = context;

        const vars = {
            app_name: 'DSI Hub',
            app_url: process.env.APP_URL || 'http://localhost:5173',
            ticket_id: ticket?.glpi_id || context.ticket_id,
            ticket_title: ticket?.title || '',
            ticket_content: ticket?.content || '',
            priority_label: ({ 2: 'Basse', 3: 'Normale', 4: 'Haute', 5: 'Tres haute' })[ticket?.priority] || 'Normale',
            type_label: ({ 1: 'Incident', 2: 'Demande' })[ticket?.type] || ticket?.type || '',
            status_label: ['Nouveau', 'Assigné', 'En cours', 'En attente', 'En attente', 'Résolu', 'Fermé', 'Rejeté'][(ticket?.status || 1) - 1] || '',
            requester_name: ticket?.requester_name || '',
            recipient_name: recipient?.name || 'Utilisateur',
            assignee_name: recipient?.name || '',
            technician_name: user?.displayName || user?.username || 'Technicien',
            author_name: user?.displayName || user?.username || '',
            old_status: ['Nouveau', 'Assigné', 'En cours', 'En attente', 'En attente', 'Résolu', 'Fermé', 'Rejeté'][(oldStatus || 1) - 1] || '',
            new_status: ['Nouveau', 'Assigné', 'En cours', 'En attente', 'En attente', 'Résolu', 'Fermé', 'Rejeté'][(newStatus || 1) - 1] || '',
            solution_text: solution || ticket?.solution || '',
            sla_type: sla_type === 'first_response' ? '1ère réponse' : 'Résolution',
            sla_deadline: sla_data?.resolution_target || sla_data?.first_response_target || '',
            comment_content: comment?.content || '',
            reopened_by: user?.displayName || user?.username || '',
            reply_url: context.reply_url || '',
        };

        let result = template;
        for (const [key, value] of Object.entries(vars)) {
            result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
        }
        return result;
    },

    async processQueue(sendMailFn) {
        const pending = await pgDb.all(`
            SELECT * FROM hub_tickets.notification_queue
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 20
        `);

        if (pending.length > 0) {
            console.log(`[NOTIFICATION-QUEUE] Processing ${pending.length} items`);
        }

        for (const item of pending) {
            try {
                console.log(`[NOTIFICATION-QUEUE] Sending to ${item.recipient_email}: ${item.subject}`);
                await sendMailFn(item.recipient_email, item.subject, item.body_html, [], 'ticket');
                await pgDb.run(
                    "UPDATE hub_tickets.notification_queue SET status = 'sent', sent_at = $1 WHERE id = $2",
                    [new Date(), item.id]
                );
                await pgDb.run(`
                    INSERT INTO hub_tickets.notification_logs
                        (ticket_id, event, recipient_email, recipient_name, subject, status)
                    VALUES ($1, $2, $3, $4, $5, 'sent')
                `, [item.ticket_id, 'notification_sent', item.recipient_email, item.recipient_name, item.subject]);
                console.log(`[NOTIFICATION-QUEUE] Sent to ${item.recipient_email}: ${item.subject}`);
            } catch (error) {
                await pgDb.run(
                    "UPDATE hub_tickets.notification_queue SET status = 'failed', error_message = $1 WHERE id = $2",
                    [error.message, item.id]
                );
                console.error(`[NOTIFICATION-QUEUE] Failed for ${item.recipient_email}:`, error.message);
            }
        }
    },
};
