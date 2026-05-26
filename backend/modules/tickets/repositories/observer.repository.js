const { pgDb } = require('../../../shared/database');

module.exports = {
    async findByTicket(ticketId) {
        try {
            const rows = await pgDb.all(`
                SELECT o.*,
                       COALESCE(
                         u.displayname,
                         CASE WHEN o.name ~ '^[0-9]+$' THEN NULL ELSE NULLIF(o.name, '') END,
                         CASE WHEN o.login ~ '^[0-9]+$' THEN NULL ELSE NULLIF(o.login, '') END,
                         NULLIF(o.email, ''),
                         'Utilisateur #' || o.user_id
                       ) as display_name
                FROM hub_tickets.observers o
                LEFT JOIN hub.users u ON LOWER(o.login) = LOWER(u.username) OR (o.login IS NULL AND LOWER(o.email) = LOWER(u.email))
                WHERE o.ticket_id = $1 AND o.is_active = 1
            `, [ticketId]);
            if (rows.length === 0) {
                const allRows = await pgDb.all(`
                    SELECT o.*,
                           COALESCE(
                             u.displayname,
                             CASE WHEN o.name ~ '^[0-9]+$' THEN NULL ELSE NULLIF(o.name, '') END,
                             CASE WHEN o.login ~ '^[0-9]+$' THEN NULL ELSE NULLIF(o.login, '') END,
                             NULLIF(o.email, ''),
                             'Utilisateur #' || o.user_id
                           ) as display_name
                    FROM hub_tickets.observers o
                    LEFT JOIN hub.users u ON LOWER(o.login) = LOWER(u.username) OR (o.login IS NULL AND LOWER(o.email) = LOWER(u.email))
                    WHERE o.ticket_id = $1
                `, [ticketId]);
                if (allRows.length > 0) {
                    console.warn(`[OBSERVERS] Found ${allRows.length} rows without is_active filter for ticket ${ticketId}`);
                    return allRows;
                }
            }
            return rows;
        } catch (error) {
            console.error(`[OBSERVERS] findByTicket(${ticketId}) error:`, error.message);
            throw error;
        }
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
