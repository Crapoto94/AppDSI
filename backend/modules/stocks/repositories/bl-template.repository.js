const { pgDb } = require('../../../shared/database');

module.exports = {
    async list(category) {
        if (category) {
            return pgDb.all(`SELECT * FROM hub_stocks.bl_templates WHERE category = $1 ORDER BY is_default DESC, name ASC`, [category]);
        }
        return pgDb.all(`SELECT * FROM hub_stocks.bl_templates ORDER BY is_default DESC, name ASC`);
    },
    async get(id) {
        return pgDb.get(`SELECT * FROM hub_stocks.bl_templates WHERE id = $1`, [id]);
    },
    async getDefault() {
        return pgDb.get(`SELECT * FROM hub_stocks.bl_templates WHERE is_default = TRUE ORDER BY id ASC LIMIT 1`);
    },
    async create({ name, base_document_id, fields, is_default, category, created_by }) {
        if (is_default) await pgDb.run(`UPDATE hub_stocks.bl_templates SET is_default = FALSE`);
        const r = await pgDb.run(
            `INSERT INTO hub_stocks.bl_templates (name, base_document_id, fields, is_default, category, created_by)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
            [name, base_document_id || null, JSON.stringify(fields || []), !!is_default, category || 'bl', created_by || null]
        );
        return r.lastID;
    },
    async update(id, { name, fields, is_default, category }) {
        if (is_default) await pgDb.run(`UPDATE hub_stocks.bl_templates SET is_default = FALSE WHERE id <> $1`, [id]);
        const sets = [];
        const params = [];
        let i = 1;
        if (name !== undefined) { sets.push(`name = $${i++}`); params.push(name); }
        if (fields !== undefined) { sets.push(`fields = $${i++}::jsonb`); params.push(JSON.stringify(fields)); }
        if (category !== undefined) { sets.push(`category = $${i++}`); params.push(category); }
        if (is_default !== undefined) { sets.push(`is_default = $${i++}`); params.push(!!is_default); }
        sets.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);
        await pgDb.run(`UPDATE hub_stocks.bl_templates SET ${sets.join(', ')} WHERE id = $${i}`, params);
    },
    async setBaseDocument(id, baseDocumentId) {
        await pgDb.run(
            `UPDATE hub_stocks.bl_templates SET base_document_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [baseDocumentId, id]
        );
    },
    async remove(id) {
        await pgDb.run(`DELETE FROM hub_stocks.bl_templates WHERE id = $1`, [id]);
    },
};
