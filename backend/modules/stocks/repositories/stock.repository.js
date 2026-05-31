const { pgDb } = require('../../../shared/database');

module.exports = {
    // ─── Magasins ────────────────────────────────────────────
    async listStores() {
        return pgDb.all(`SELECT * FROM hub_stocks.stores ORDER BY name ASC`);
    },
    async getStore(id) {
        return pgDb.get(`SELECT * FROM hub_stocks.stores WHERE id = $1`, [id]);
    },
    async createStore({ code, name, address, is_active = true }) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.stores (code, name, address, is_active) VALUES ($1, $2, $3, $4)`,
            [code || null, name, address || null, is_active]
        );
        return r.lastID;
    },
    async updateStore(id, { code, name, address, is_active }) {
        await pgDb.run(
            `UPDATE hub_stocks.stores SET code = $1, name = $2, address = $3, is_active = $4 WHERE id = $5`,
            [code || null, name, address || null, is_active !== undefined ? is_active : true, id]
        );
    },
    async deleteStore(id) {
        await pgDb.run(`DELETE FROM hub_stocks.stores WHERE id = $1`, [id]);
    },

    // ─── Membres / droits ────────────────────────────────────
    async listMembers(storeId) {
        return pgDb.all(
            `SELECT * FROM hub_stocks.store_members WHERE store_id = $1 ORDER BY username ASC`,
            [storeId]
        );
    },
    async upsertMember(storeId, username, role) {
        await pgDb.run(
            `INSERT INTO hub_stocks.store_members (store_id, username, role) VALUES ($1, $2, $3)
             ON CONFLICT (store_id, username) DO UPDATE SET role = EXCLUDED.role`,
            [storeId, username, role]
        );
    },
    async removeMember(storeId, memberId) {
        await pgDb.run(
            `DELETE FROM hub_stocks.store_members WHERE id = $1 AND store_id = $2`,
            [memberId, storeId]
        );
    },

    // ─── Lieux de stockage ───────────────────────────────────
    async listLocations(storeId) {
        return pgDb.all(
            `SELECT * FROM hub_stocks.storage_locations WHERE store_id = $1 ORDER BY name ASC`,
            [storeId]
        );
    },
    async createLocation({ store_id, code, name, parent_id, description, is_active = true }) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.storage_locations (store_id, code, name, parent_id, description, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [store_id, code || null, name, parent_id || null, description || null, is_active]
        );
        return r.lastID;
    },
    async updateLocation(id, { code, name, parent_id, description, is_active }) {
        await pgDb.run(
            `UPDATE hub_stocks.storage_locations
             SET code = $1, name = $2, parent_id = $3, description = $4, is_active = $5 WHERE id = $6`,
            [code || null, name, parent_id || null, description || null, is_active !== undefined ? is_active : true, id]
        );
    },
    async deleteLocation(id) {
        await pgDb.run(`DELETE FROM hub_stocks.storage_locations WHERE id = $1`, [id]);
    },

    // ─── Catalogue articles ──────────────────────────────────
    async listItems({ search, category } = {}) {
        const where = [];
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            where.push(`(label ILIKE $${params.length} OR reference ILIKE $${params.length} OR ean ILIKE $${params.length})`);
        }
        if (category) {
            params.push(category);
            where.push(`category = $${params.length}`);
        }
        const sql = `SELECT * FROM hub_stocks.items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY label ASC`;
        return pgDb.all(sql, params);
    },
    async getItem(id) {
        return pgDb.get(`SELECT * FROM hub_stocks.items WHERE id = $1`, [id]);
    },
    async getItemByEan(ean) {
        return pgDb.get(`SELECT * FROM hub_stocks.items WHERE ean = $1 LIMIT 1`, [ean]);
    },
    async createItem(data) {
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.items (reference, label, category, brand, model, ean, specs, tracking_mode, unit, min_threshold, photo_document_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                data.reference || null, data.label, data.category || null, data.brand || null,
                data.model || null, data.ean || null, JSON.stringify(data.specs || {}),
                data.tracking_mode || 'batch', data.unit || 'unité', data.min_threshold || 0,
                data.photo_document_id || null,
            ]
        );
        return r.lastID;
    },
    async updateItem(id, data) {
        await pgDb.run(
            `UPDATE hub_stocks.items SET
                reference = $1, label = $2, category = $3, brand = $4, model = $5, ean = $6,
                specs = $7, tracking_mode = $8, unit = $9, min_threshold = $10, photo_document_id = $11,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $12`,
            [
                data.reference || null, data.label, data.category || null, data.brand || null,
                data.model || null, data.ean || null, JSON.stringify(data.specs || {}),
                data.tracking_mode || 'batch', data.unit || 'unité', data.min_threshold || 0,
                data.photo_document_id || null, id,
            ]
        );
    },
    async deleteItem(id) {
        await pgDb.run(`DELETE FROM hub_stocks.items WHERE id = $1`, [id]);
    },

    // ─── Niveaux de stock ────────────────────────────────────
    async getStockLevels(storeId, { stock_type } = {}) {
        const params = [storeId];
        let typeClause = '';
        if (stock_type) {
            params.push(stock_type);
            typeClause = ` AND sl.stock_type = $${params.length}`;
        }
        return pgDb.all(
            `SELECT sl.*, i.reference, i.label, i.category, i.brand, i.model, i.unit,
                    i.tracking_mode, i.min_threshold AS item_min_threshold,
                    loc.name AS location_name
             FROM hub_stocks.stock_levels sl
             JOIN hub_stocks.items i ON i.id = sl.item_id
             LEFT JOIN hub_stocks.storage_locations loc ON loc.id = sl.location_id
             WHERE sl.store_id = $1${typeClause}
             ORDER BY i.label ASC`,
            params
        );
    },
    async updateLevelThreshold(id, storeId, min_threshold) {
        await pgDb.run(
            `UPDATE hub_stocks.stock_levels SET min_threshold = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND store_id = $3`,
            [min_threshold, id, storeId]
        );
    },

    // ─── Mouvements (lecture) ────────────────────────────────
    async listMovements(storeId, { item_id, limit = 100, offset = 0 } = {}) {
        const params = [storeId];
        let itemClause = '';
        if (item_id) {
            params.push(item_id);
            itemClause = ` AND m.item_id = $${params.length}`;
        }
        params.push(limit);
        const limitIdx = params.length;
        params.push(offset);
        const offsetIdx = params.length;
        return pgDb.all(
            `SELECT m.*, i.label AS item_label, i.reference AS item_reference,
                    loc.name AS location_name
             FROM hub_stocks.movements m
             JOIN hub_stocks.items i ON i.id = m.item_id
             LEFT JOIN hub_stocks.storage_locations loc ON loc.id = m.location_id
             WHERE m.store_id = $1${itemClause}
             ORDER BY m.created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );
    },
};
