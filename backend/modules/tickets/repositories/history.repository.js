const { pgDb } = require('../../../shared/database');

module.exports = {
    async findByTicket(ticketId) {
        // Résolution du nom par USERNAME (fiable) ; repli sur l'id-join pour l'historique
        // antérieur (lignes sans username) — imparfait mais conservé tel quel.
        return pgDb.all(`
            SELECT h.*,
                   COALESCE(un.displayName, uid.displayName, h.username) AS user_name
            FROM hub_tickets.ticket_history h
            LEFT JOIN hub.users un ON LOWER(un.username) = LOWER(h.username)
            LEFT JOIN hub.users uid ON h.username IS NULL AND h.user_id = uid.id
            WHERE h.ticket_id = $1
            ORDER BY h.created_at ASC
        `, [ticketId]);
    },

    // createdAt (optionnel) : horodatage explicite de l'événement, en UTC
    // (created_at est un timestamp naïf en UTC, comme le DEFAULT CURRENT_TIMESTAMP).
    // Utilisé par la clôture automatique rétroactive, qui date l'événement du
    // jour où la clôture aurait dû avoir lieu.
    async log(ticketId, userId, action, fieldName, oldValue, newValue, comment = null, username = null, createdAt = null) {
        if (createdAt) {
            await pgDb.run(`
                INSERT INTO hub_tickets.ticket_history
                    (ticket_id, user_id, username, action, field_name, old_value, new_value, comment, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [ticketId, userId, username, action, fieldName, oldValue, newValue, comment, createdAt]);
            return;
        }
        await pgDb.run(`
            INSERT INTO hub_tickets.ticket_history
                (ticket_id, user_id, username, action, field_name, old_value, new_value, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [ticketId, userId, username, action, fieldName, oldValue, newValue, comment]);
    },
};
