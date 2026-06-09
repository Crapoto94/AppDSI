const { pgDb } = require('../../../shared/database');

module.exports = {
    async create(name, createdByUsername) {
        const res = await pgDb.run(
            'INSERT INTO hub_tickets.ticket_groups (name, created_by_username) VALUES ($1, $2)',
            [name, createdByUsername]
        );
        return res.lastID;
    },

    async findById(groupId) {
        return pgDb.get('SELECT * FROM hub_tickets.ticket_groups WHERE id = $1', [groupId]);
    },

    async findByTicketId(ticketId) {
        return pgDb.get(`
            SELECT g.* FROM hub_tickets.ticket_groups g
            JOIN hub_tickets.ticket_group_members m ON g.id = m.group_id
            WHERE m.ticket_id = $1
        `, [ticketId]);
    },

    async getGroupWithMembers(groupId) {
        const group = await pgDb.get('SELECT * FROM hub_tickets.ticket_groups WHERE id = $1', [groupId]);
        if (!group) return null;
        const members = await pgDb.all(`
            SELECT m.ticket_id, t.title, t.status, t.requester_name, t.date_creation
            FROM hub_tickets.ticket_group_members m
            JOIN hub_tickets.tickets t ON t.glpi_id = m.ticket_id
            WHERE m.group_id = $1
            ORDER BY m.added_at ASC
        `, [groupId]);
        return { ...group, members };
    },

    // Retourne les IDs des autres tickets du même groupe
    async getSiblingIds(ticketId) {
        const rows = await pgDb.all(`
            SELECT m2.ticket_id
            FROM hub_tickets.ticket_group_members m1
            JOIN hub_tickets.ticket_group_members m2 ON m1.group_id = m2.group_id
            WHERE m1.ticket_id = $1 AND m2.ticket_id != $1
        `, [ticketId]);
        return rows.map(r => r.ticket_id);
    },

    // Retourne les IDs des tickets membres du groupe dont ce ticket est le chef (problem_ticket_id)
    async getLinkedMemberIds(problemTicketId) {
        const rows = await pgDb.all(`
            SELECT m.ticket_id
            FROM hub_tickets.ticket_groups g
            JOIN hub_tickets.ticket_group_members m ON m.group_id = g.id
            WHERE g.problem_ticket_id = $1
        `, [problemTicketId]);
        return rows.map(r => r.ticket_id);
    },

    async addMember(groupId, ticketId, addedByUsername) {
        await pgDb.run(
            'INSERT INTO hub_tickets.ticket_group_members (group_id, ticket_id, added_by_username) VALUES ($1, $2, $3)',
            [groupId, ticketId, addedByUsername]
        );
    },

    async removeMember(groupId, ticketId) {
        await pgDb.run(
            'DELETE FROM hub_tickets.ticket_group_members WHERE group_id = $1 AND ticket_id = $2',
            [groupId, ticketId]
        );
    },

    async getMemberCount(groupId) {
        const row = await pgDb.get(
            'SELECT COUNT(*) as cnt FROM hub_tickets.ticket_group_members WHERE group_id = $1',
            [groupId]
        );
        return parseInt(row?.cnt || 0);
    },

    async dissolve(groupId) {
        // Les membres sont supprimés en cascade (ON DELETE CASCADE)
        await pgDb.run('DELETE FROM hub_tickets.ticket_groups WHERE id = $1', [groupId]);
    },

    async setProblemTicket(groupId, problemTicketId) {
        await pgDb.run(
            'UPDATE hub_tickets.ticket_groups SET problem_ticket_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [problemTicketId, groupId]
        );
    },

    async updateName(groupId, name) {
        await pgDb.run(
            'UPDATE hub_tickets.ticket_groups SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [name, groupId]
        );
    }
};
