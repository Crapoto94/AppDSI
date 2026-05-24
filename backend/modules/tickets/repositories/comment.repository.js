const { pgDb } = require('../../../shared/database');
const crypto = require('crypto');

const { resolveTicketRole } = require('../middleware/ticket-permissions');

const INTERNAL_RAW_ROLES = ['superviseur', 'supervisor', 'admin', 'superadmin', 'technicien', 'technicienne', 'technician', 'tech', 'superadmins'];

module.exports = {
    async findByTicket(ticketId, user = null) {
        // Double vérification : rôle résolu ET rôle brut du token (filet de sécurité)
        const effectiveRole = user ? await resolveTicketRole(user) : 'user';
        const rawRoleIsInternal = user?.role ? INTERNAL_RAW_ROLES.includes(user.role.toLowerCase()) : false;
        const isInternal = ['technician', 'supervisor', 'admin', 'superadmin'].includes(effectiveRole) || rawRoleIsInternal;

        if (isInternal) {
            return pgDb.all(`
                SELECT * FROM hub_tickets.ticket_followups
                WHERE ticket_id = $1
                ORDER BY date_creation ASC
            `, [ticketId]);
        }

        return pgDb.all(`
            SELECT * FROM hub_tickets.ticket_followups
            WHERE ticket_id = $1 AND is_private = 0
            ORDER BY date_creation ASC
        `, [ticketId]);
    },

    async create(ticketId, data, user) {
        const contentHash = crypto.createHash('md5').update(data.content || '').digest('hex');

        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_followups
                (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            ticketId, data.content, contentHash,
            user.displayName || user.username, user.email || '',
            data.is_private ? 1 : 0, new Date()
        ]);

        const id = result.lastID;
        return pgDb.get('SELECT * FROM hub_tickets.ticket_followups WHERE id = $1', [id]);
    },

    async update(id, data, user) {
        await pgDb.run(`
            UPDATE hub_tickets.ticket_followups
            SET content = $1, content_hash = $2
            WHERE id = $3 AND (author_email = $4 OR $5 = true)
        `, [
            data.content,
            crypto.createHash('md5').update(data.content || '').digest('hex'),
            id, user.email || '', false
        ]);
    },

    async delete(id, user) {
        await pgDb.run(
            'DELETE FROM hub_tickets.ticket_followups WHERE id = $1',
            [id]
        );
    },
};
