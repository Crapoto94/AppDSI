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

    // ─── Articles du parc (catalogue stocks = hub_parc.items) ─
    async listParcItems({ search } = {}) {
        const statesStock = ['En stock neuf', 'En stock masterisé', 'En stock'];
        const params = [];
        const conditions = [
            `(LOWER(pi.raw->>'name') LIKE '%stock%' OR pi.raw->>'states_id' = ANY($1))`,
            `pi.is_deleted = false`,
        ];
        params.push(statesStock);
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(LOWER(pi.raw->>'name') LIKE LOWER($${params.length}) OR pi.serial ILIKE $${params.length})`);
        }
        return pgDb.all(
            `SELECT pi.itemtype AS parc_itemtype, pi.glpi_id AS parc_glpi_id,
                    pi.raw->>'name' AS label, pi.serial,
                    pi.raw->>'manufacturers_id' AS brand,
                    pi.raw->>'name' AS model,
                    pi.raw->>'states_id' AS state,
                    pi.itemtype
             FROM hub_parc.items pi
             WHERE ${conditions.join(' AND ')}
             ORDER BY pi.raw->>'name' ASC`,
            params
        );
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
            `SELECT sl.*,
                    COALESCE(pi.raw->>'name', i.label) AS label,
                    pi.raw->>'manufacturers_id' AS brand,
                    pi.raw->>'serial' AS serial_number,
                    pi.itemtype AS parc_itemtype,
                    pi.glpi_id AS parc_glpi_id,
                    i.reference, i.category, i.model, i.unit, i.tracking_mode, i.min_threshold AS item_min_threshold,
                    loc.name AS location_name
             FROM hub_stocks.stock_levels sl
             LEFT JOIN hub_parc.items pi ON pi.itemtype = sl.parc_itemtype AND pi.glpi_id = sl.parc_glpi_id
             LEFT JOIN hub_stocks.items i ON i.id = sl.item_id
             LEFT JOIN hub_stocks.storage_locations loc ON loc.id = sl.location_id
             WHERE sl.store_id = $1${typeClause}
             ORDER BY COALESCE(pi.raw->>'name', i.label) ASC`,
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
            `SELECT m.*,
                    COALESCE(pi.raw->>'name', i.label) AS item_label,
                    i.reference AS item_reference,
                    loc.name AS location_name
             FROM hub_stocks.movements m
             LEFT JOIN hub_parc.items pi ON pi.itemtype = m.parc_itemtype AND pi.glpi_id = m.parc_glpi_id
             LEFT JOIN hub_stocks.items i ON i.id = m.item_id
             LEFT JOIN hub_stocks.storage_locations loc ON loc.id = m.location_id
             WHERE m.store_id = $1${itemClause}
             ORDER BY m.created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );
    },
};
