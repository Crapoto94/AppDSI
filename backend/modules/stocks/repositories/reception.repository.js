const { pgDb } = require('../../../shared/database');

module.exports = {
    // ─── Réceptions ──────────────────────────────────────────
    async createReception({ order_number, store_id, supplier, notes, received_by }) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.receptions (order_number, store_id, supplier, notes, received_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [order_number || null, store_id, supplier || null, notes || null, received_by || null]
        );
        return r.lastID;
    },
    async getReception(id) {
        return pgDb.get(`SELECT * FROM hub_stocks.receptions WHERE id = $1`, [id]);
    },
    async listReceptions(storeId) {
        return pgDb.all(
            `SELECT r.*, (SELECT COUNT(*) FROM hub_stocks.reception_lines l WHERE l.reception_id = r.id)::int AS line_count
             FROM hub_stocks.receptions r WHERE r.store_id = $1 ORDER BY r.created_at DESC`,
            [storeId]
        );
    },
    async setReceptionStatus(id, status, received_by) {
        await pgDb.run(
            `UPDATE hub_stocks.receptions SET status = $1, received_by = COALESCE($2, received_by),
                received_at = CASE WHEN $1 = 'received' THEN CURRENT_TIMESTAMP ELSE received_at END
             WHERE id = $3`,
            [status, received_by || null, id]
        );
    },

    // ─── Lignes de réception ─────────────────────────────────
    async addLine(receptionId, line) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.reception_lines
                (reception_id, item_id, reference, label, ean, quantity_received, tracking_mode, location_id, specs)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                receptionId, line.item_id || null, line.reference || null, line.label || null,
                line.ean || null, parseInt(line.quantity_received, 10) || 0,
                line.tracking_mode || 'batch', line.location_id || null,
                JSON.stringify(line.specs || {}),
            ]
        );
        return r.lastID;
    },
    async listLines(receptionId) {
        return pgDb.all(
            `SELECT * FROM hub_stocks.reception_lines WHERE reception_id = $1 ORDER BY id ASC`,
            [receptionId]
        );
    },
    async deleteLine(id, receptionId) {
        await pgDb.run(`DELETE FROM hub_stocks.reception_lines WHERE id = $1 AND reception_id = $2`, [id, receptionId]);
    },

    // ─── Résolution / création d'article ─────────────────────
    async findItemByReferenceOrEan(reference, ean) {
        if (reference) {
            const byRef = await pgDb.get(`SELECT * FROM hub_stocks.items WHERE reference = $1 LIMIT 1`, [reference]);
            if (byRef) return byRef;
        }
        if (ean) {
            const byEan = await pgDb.get(`SELECT * FROM hub_stocks.items WHERE ean = $1 LIMIT 1`, [ean]);
            if (byEan) return byEan;
        }
        return null;
    },

    // ─── Articles sérialisés ─────────────────────────────────
    async createSerialItem({ item_id, store_id, location_id, serial_number, order_number, reception_id, specs }) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.serial_items
                (item_id, store_id, location_id, serial_number, order_number, reception_id, specs)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [item_id, store_id, location_id || null, serial_number || null, order_number || null, reception_id || null, JSON.stringify(specs || {})]
        );
        return r.lastID;
    },
    async listSerialItems({ store_id, status, missing_serial }) {
        const params = [store_id];
        const where = ['si.store_id = $1'];
        if (status) { params.push(status); where.push(`si.status = $${params.length}`); }
        if (missing_serial) { where.push(`(si.serial_number IS NULL OR si.serial_number = '')`); }
        return pgDb.all(
            `SELECT si.*, i.label AS item_label, i.reference AS item_reference, i.brand, i.model
             FROM hub_stocks.serial_items si
             JOIN hub_stocks.items i ON i.id = si.item_id
             WHERE ${where.join(' AND ')}
             ORDER BY si.created_at DESC`,
            params
        );
    },
    async updateSerialNumber(id, store_id, serial_number) {
        await pgDb.run(
            `UPDATE hub_stocks.serial_items SET serial_number = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND store_id = $3`,
            [serial_number || null, id, store_id]
        );
    },
};
