const { pgDb } = require('../../../shared/database');

module.exports = {
    // ─── Sorties / BL ────────────────────────────────────────
    async createDelivery({ store_id, beneficiary_name, beneficiary_username, beneficiary_email, notes, delivered_by, template_id, prepared_by, kind, meta }) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.deliveries
                (store_id, beneficiary_name, beneficiary_username, beneficiary_email, notes, delivered_by, template_id, prepared_by, kind, meta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
            [store_id, beneficiary_name || null, beneficiary_username || null, beneficiary_email || null,
             notes || null, delivered_by || null, template_id || null, prepared_by || null,
             kind || 'delivery', JSON.stringify(meta || {})]
        );
        return r.lastID;
    },
    async addDeliveryLine(deliveryId, { item_id, serial_item_id, location_id, quantity }) {
        await pgDb.run(
            `INSERT INTO hub_stocks.delivery_lines (delivery_id, item_id, serial_item_id, location_id, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [deliveryId, item_id, serial_item_id || null, location_id || null, parseInt(quantity, 10) || 1]
        );
    },
    // Phase préparation : signature préparateur + BL pré-signé → statut 'prepared'
    async setPreparation(id, { preparer_signature_document_id, bl_document_id }) {
        await pgDb.run(
            `UPDATE hub_stocks.deliveries
             SET status = 'prepared', prepared_at = CURRENT_TIMESTAMP,
                 preparer_signature_document_id = COALESCE($1, preparer_signature_document_id),
                 bl_document_id = COALESCE($2, bl_document_id)
             WHERE id = $3`,
            [preparer_signature_document_id || null, bl_document_id || null, id]
        );
    },
    // Phase livraison : signature destinataire + BL final → statut 'delivered'
    async setDelivered(id, { recipient_signature_document_id, bl_document_id }) {
        await pgDb.run(
            `UPDATE hub_stocks.deliveries
             SET status = 'delivered', signed_at = CURRENT_TIMESTAMP,
                 recipient_signature_document_id = COALESCE($1, recipient_signature_document_id),
                 bl_document_id = COALESCE($2, bl_document_id)
             WHERE id = $3`,
            [recipient_signature_document_id || null, bl_document_id || null, id]
        );
    },
    async deleteDelivery(id) {
        await pgDb.run(`DELETE FROM hub_stocks.deliveries WHERE id = $1`, [id]);
    },
    async getDelivery(id) {
        const d = await pgDb.get(`SELECT * FROM hub_stocks.deliveries WHERE id = $1`, [id]);
        if (!d) return null;
        const lines = await pgDb.all(
            `SELECT dl.*, i.label AS item_label, i.reference AS item_reference, si.serial_number
             FROM hub_stocks.delivery_lines dl
             JOIN hub_stocks.items i ON i.id = dl.item_id
             LEFT JOIN hub_stocks.serial_items si ON si.id = dl.serial_item_id
             WHERE dl.delivery_id = $1 ORDER BY dl.id ASC`,
            [id]
        );
        return { ...d, lines };
    },
    async listDeliveries(storeId, status) {
        const params = [storeId];
        let clause = '';
        if (status) { params.push(status); clause = ` AND d.status = $${params.length}`; }
        return pgDb.all(
            `SELECT d.*, (SELECT COUNT(*) FROM hub_stocks.delivery_lines l WHERE l.delivery_id = d.id)::int AS line_count
             FROM hub_stocks.deliveries d WHERE d.store_id = $1${clause} ORDER BY d.created_at DESC`,
            params
        );
    },
    async setSerialStatus(serialItemId, status) {
        if (!serialItemId) return;
        await pgDb.run(
            `UPDATE hub_stocks.serial_items SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [status, serialItemId]
        );
    },

    // ─── Prêts ───────────────────────────────────────────────
    async createLoan(loan) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.loans
                (store_id, item_id, serial_item_id, borrower_name, borrower_username, borrower_email, quantity, due_date, signature_document_id, delivered_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [loan.store_id, loan.item_id, loan.serial_item_id || null, loan.borrower_name || null,
             loan.borrower_username || null, loan.borrower_email || null, parseInt(loan.quantity, 10) || 1,
             loan.due_date || null, loan.signature_document_id || null, loan.delivered_by || null]
        );
        return r.lastID;
    },
    async getLoan(id) {
        return pgDb.get(`SELECT * FROM hub_stocks.loans WHERE id = $1`, [id]);
    },
    async returnLoan(id) {
        await pgDb.run(
            `UPDATE hub_stocks.loans SET status = 'returned', returned_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );
    },
    async listLoans(storeId, status) {
        const params = [storeId];
        let clause = '';
        if (status) { params.push(status); clause = ` AND l.status = $${params.length}`; }
        return pgDb.all(
            `SELECT l.*, i.label AS item_label, i.reference AS item_reference, si.serial_number,
                    (l.status = 'active' AND l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE) AS overdue
             FROM hub_stocks.loans l
             JOIN hub_stocks.items i ON i.id = l.item_id
             LEFT JOIN hub_stocks.serial_items si ON si.id = l.serial_item_id
             WHERE l.store_id = $1${clause}
             ORDER BY l.loaned_at DESC`,
            params
        );
    },
};
