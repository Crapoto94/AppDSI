const { pgDb } = require('../../../shared/database');

module.exports = {
    async getSettings() {
        const rows = await pgDb.all('SELECT * FROM hub_tickets.auto_resolution_settings LIMIT 1');
        if (rows.length === 0) {
            await pgDb.run(`INSERT INTO hub_tickets.auto_resolution_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
            return (await pgDb.all('SELECT * FROM hub_tickets.auto_resolution_settings LIMIT 1'))[0];
        }
        return rows[0];
    },

    async updateSettings(data) {
        const fields = [];
        const params = [];
        let idx = 1;
        for (const key of ['enabled', 'inactivity_days', 'max_reminders', 'reminder_frequency_days', 'notify_observers', 'reminder_subject', 'reminder_message', 'closure_message']) {
            if (data[key] !== undefined) {
                fields.push(`${key} = $${idx++}`);
                params.push(data[key]);
            }
        }
        if (fields.length === 0) return this.getSettings();
        params.push(1);
        await pgDb.run(`UPDATE hub_tickets.auto_resolution_settings SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`, params);
        return this.getSettings();
    },

    async addLog(ticketId, action, reminderCount = 0, token = null, details = '') {
        // NB : pgDb.run ajoute automatiquement « RETURNING id » aux INSERT.
        // Ne pas le mettre ici, sinon on obtient « ... RETURNING id RETURNING id »
        // -> erreur de syntaxe Postgres (cf. shared/pg_db.js run()).
        const res = await pgDb.run(
            `INSERT INTO hub_tickets.auto_resolution_logs (ticket_id, action, reminder_count, token, details) VALUES ($1, $2, $3, $4, $5)`,
            [ticketId, action, reminderCount, token, details]
        );
        return res.lastID;
    },

    async getLogs(limit = 100, offset = 0) {
        return pgDb.all(`
            SELECT l.*, t.title as ticket_title, t.requester_email_22
            FROM hub_tickets.auto_resolution_logs l
            LEFT JOIN hub_tickets.tickets t ON t.glpi_id = l.ticket_id
            ORDER BY l.created_at DESC LIMIT $1 OFFSET $2
        `, [limit, offset]);
    },

    async getLogByToken(token) {
        const rows = await pgDb.all(
            'SELECT * FROM hub_tickets.auto_resolution_logs WHERE token = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1',
            [token, 'reminder_sent']
        );
        return rows.length > 0 ? rows[0] : null;
    },

    async getTicketsPendingReminder(inactivityDays, now) {
        return pgDb.all(`
            SELECT t.*,
                   COALESCE(l.reminder_count, 0) as reminder_count,
                   l.created_at as last_reminder_at,
                   l.token as last_token
            FROM hub_tickets.tickets t
            LEFT JOIN LATERAL (
                SELECT reminder_count, created_at, token
                FROM hub_tickets.auto_resolution_logs
                WHERE ticket_id = t.glpi_id AND action = 'reminder_sent'
                ORDER BY created_at DESC LIMIT 1
            ) l ON true
            WHERE t.status NOT IN ('6', '7', '8')
              AND t.date_mod < $1::timestamp - ($2 || ' days')::interval
              AND (t.auto_resolution_status IS NULL OR t.auto_resolution_status NOT IN ('kept_alive', 'closed'))
              AND t.requester_email_22 IS NOT NULL AND t.requester_email_22 != ''
            ORDER BY t.date_mod ASC
        `, [now, inactivityDays]);
    },

    async getTicketsByRequester(email) {
        return pgDb.all(`
            SELECT t.*,
                   COALESCE(l.reminder_count, 0) as reminder_count,
                   l.created_at as last_reminder_at,
                   l.token as last_token
            FROM hub_tickets.tickets t
            LEFT JOIN LATERAL (
                SELECT reminder_count, created_at, token
                FROM hub_tickets.auto_resolution_logs
                WHERE ticket_id = t.glpi_id AND action = 'reminder_sent'
                ORDER BY created_at DESC LIMIT 1
            ) l ON true
            WHERE LOWER(t.requester_email_22) = LOWER($1)
              AND t.status NOT IN ('6', '7', '8')
              AND (t.auto_resolution_status IS NULL OR t.auto_resolution_status NOT IN ('kept_alive', 'closed'))
            ORDER BY t.date_mod ASC
        `, [email]);
    },

    async markTicketKeepAlive(ticketId) {
        await pgDb.run(`UPDATE hub_tickets.tickets SET auto_resolution_status = 'kept_alive' WHERE glpi_id = $1`, [ticketId]);
    },

    async markTicketClosed(ticketId) {
        await pgDb.run(`UPDATE hub_tickets.tickets SET auto_resolution_status = 'closed' WHERE glpi_id = $1`, [ticketId]);
    },

    async getTicketInfo(ticketId) {
        return pgDb.get('SELECT glpi_id, title, requester_name, requester_email_22, status, priority, description, date_mod, date_creation FROM hub_tickets.tickets WHERE glpi_id = $1', [ticketId]);
    },
};
