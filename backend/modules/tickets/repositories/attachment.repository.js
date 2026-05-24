const { pgDb } = require('../../../shared/database');
const fs = require('fs');

module.exports = {
    async findByTicket(ticketId) {
        return pgDb.all(`
            SELECT * FROM hub_tickets.ticket_attachments
            WHERE ticket_id = $1
            ORDER BY created_at DESC
        `, [ticketId]);
    },

    async findById(id) {
        return pgDb.get('SELECT * FROM hub_tickets.ticket_attachments WHERE id = $1', [id]);
    },

    async create(ticketId, file, user) {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_attachments
                (ticket_id, filename, original_name, mimetype, file_size, file_path, is_image, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            ticketId, file.filename, file.originalname,
            file.mimetype, file.size, file.path,
            file.mimetype?.startsWith('image/') ? true : false,
            user.id
        ]);

        return pgDb.get('SELECT * FROM hub_tickets.ticket_attachments WHERE id = $1', [result.lastID]);
    },

    async delete(id, user) {
        const file = await this.findById(id);
        if (!file) return;

        try { if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path); } catch (e) {}

        await pgDb.run('DELETE FROM hub_tickets.ticket_attachments WHERE id = $1', [id]);
    },
};
