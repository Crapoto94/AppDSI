const { pgDb } = require('../../../shared/database');

module.exports = {
    async findByTicket(ticketId) {
        return pgDb.all(`
            SELECT h.*, u.displayName as user_name
            FROM hub_tickets.ticket_history h
            LEFT JOIN hub.users u ON h.user_id = u.id
            WHERE h.ticket_id = $1
            ORDER BY h.created_at ASC
        `, [ticketId]);
    },

    async log(ticketId, userId, action, fieldName, oldValue, newValue, comment = null) {
        await pgDb.run(`
            INSERT INTO hub_tickets.ticket_history
                (ticket_id, user_id, action, field_name, old_value, new_value, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [ticketId, userId, action, fieldName, oldValue, newValue, comment]);
    },
};
