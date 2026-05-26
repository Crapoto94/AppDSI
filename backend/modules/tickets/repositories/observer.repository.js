const { pgDb } = require('../../../shared/database');

module.exports = {
    async findByTicket(ticketId) {
        return pgDb.all(`
            SELECT o.*, COALESCE(u."displayName", NULLIF(o.name, ''), NULLIF(o.login, ''), 'Utilisateur #' || o.user_id) as display_name
            FROM hub_tickets.observers o
            LEFT JOIN hub.users u ON o.login = u.username
            WHERE o.ticket_id = $1 AND o.is_active = 1
        `, [ticketId]);
    },

    async add(ticketId, userId, user) {
        await pgDb.run(`
            INSERT INTO hub_tickets.observers (ticket_id, user_id, name, login, email)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (ticket_id, user_id) DO UPDATE SET is_active = 1
        `, [ticketId, userId, user.displayName || user.username, user.username, user.email || '']);
    },

    async remove(ticketId, userId) {
        await pgDb.run(
            'DELETE FROM hub_tickets.observers WHERE ticket_id = $1 AND user_id = $2',
            [ticketId, userId]
        );
    },
};
