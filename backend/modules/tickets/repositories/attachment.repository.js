const { pgDb } = require('../../../shared/database');
const storage = require('../../../shared/storage');
const fs = require('fs');

const MODULE = 'tickets';

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
        // Corrige l'encodage et sauvegarde via storage
        if (file && file.originalname) file.originalname = storage.fixUploadName(file.originalname);
        const saved = await storage.saveFile(MODULE, ticketId, file);

        const inserted = await pgDb.get(`
            INSERT INTO hub_tickets.ticket_attachments
                (ticket_id, filename, original_name, mimetype, file_size, file_path, is_image, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            ticketId, saved.filename, file.originalname,
            file.mimetype, file.size, saved.dbPath,
            file.mimetype?.startsWith('image/') ? true : false,
            user.id
        ]);

        // Dual-write hub_docs (viewer central)
        try {
            const docsService = require('../../../shared/documents.service');
            await docsService.registerExternalUpload({
                module: 'tickets',
                entityType: 'attachment',
                entityId: ticketId,
                title: file.originalname,
                filename: saved.filename,
                originalName: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                storageRef: saved.dbPath,
                metadata: { is_image: !!file.mimetype?.startsWith('image/') },
                uploadedBy: user?.username || null,
            });
        } catch (e) { console.warn('[DOCS] register failed:', e.message); }

        return inserted;
    },

    async delete(id, user) {
        const file = await this.findById(id);
        if (!file) return;

        // Supprime via le service de stockage (nouveau ou legacy)
        if (storage.isStoragePath(file.file_path)) {
            await storage.deleteFile(file.file_path);
        } else {
            try { if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path); } catch (e) {}
        }

        await pgDb.run('DELETE FROM hub_tickets.ticket_attachments WHERE id = $1', [id]);
    },
};
