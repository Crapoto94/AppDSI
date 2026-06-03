const { pool } = require('../../../shared/database');

const INBOUND = new Set(['in', 'loan_return']);
const OUTBOUND = new Set(['out', 'loan_out']);

async function adjustLevel(client, { parc_itemtype, parc_glpi_id, item_id, store_id, location_id, stock_type, delta }) {
    const sel = await client.query(
        `SELECT id, quantity FROM hub_stocks.stock_levels
         WHERE (parc_itemtype IS NOT NULL AND parc_itemtype = $1 AND parc_glpi_id = $2
            OR item_id IS NOT NULL AND item_id = $6)
           AND store_id = $3
           AND location_id IS NOT DISTINCT FROM $4 AND stock_type = $5
         FOR UPDATE`,
        [parc_itemtype || null, parc_glpi_id || null, store_id, location_id || null, stock_type, item_id || null]
    );
    if (sel.rows[0]) {
        const newQty = sel.rows[0].quantity + delta;
        if (newQty < 0) {
            const err = new Error('Stock insuffisant pour cette opération');
            err.code = 'INSUFFICIENT_STOCK';
            throw err;
        }
        await client.query(
            `UPDATE hub_stocks.stock_levels SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newQty, sel.rows[0].id]
        );
        return newQty;
    }
    if (delta < 0) {
        const err = new Error('Stock insuffisant pour cette opération');
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
    }
    await client.query(
        `INSERT INTO hub_stocks.stock_levels (parc_itemtype, parc_glpi_id, item_id, store_id, location_id, stock_type, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [parc_itemtype || null, parc_glpi_id || null, item_id || null, store_id, location_id || null, stock_type, delta]
    );
    return delta;
}

async function applyMovement(mv) {
    const {
        parc_itemtype, parc_glpi_id, item_id, store_id, location_id = null, counterpart_store_id = null,
        serial_item_id = null, type, reason = null, reference = null, created_by = null,
    } = mv;
    let { stock_type = 'normal', quantity } = mv;

    if ((!parc_itemtype && !item_id) || !store_id || !type) throw new Error('parc_itemtype (ou item_id), store_id et type sont requis');
    quantity = parseInt(quantity, 10);
    if (Number.isNaN(quantity) || quantity === 0) throw new Error('Quantité invalide');

    if (type === 'loan_out' || type === 'loan_return') stock_type = 'loan';

    if (type === 'transfer' && !counterpart_store_id) {
        throw new Error('counterpart_store_id requis pour un transfert');
    }
    if (type !== 'adjust' && quantity < 0) {
        throw new Error('Quantité doit être positive');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (INBOUND.has(type)) {
            await adjustLevel(client, { parc_itemtype, parc_glpi_id, item_id, store_id, location_id, stock_type, delta: quantity });
        } else if (OUTBOUND.has(type)) {
            await adjustLevel(client, { parc_itemtype, parc_glpi_id, item_id, store_id, location_id, stock_type, delta: -quantity });
        } else if (type === 'transfer') {
            await adjustLevel(client, { parc_itemtype, parc_glpi_id, item_id, store_id, location_id, stock_type, delta: -quantity });
            await adjustLevel(client, { parc_itemtype, parc_glpi_id, item_id, store_id: counterpart_store_id, location_id: null, stock_type, delta: quantity });
        } else if (type === 'adjust') {
            await adjustLevel(client, { parc_itemtype, parc_glpi_id, item_id, store_id, location_id, stock_type, delta: quantity });
        }

        const ins = await client.query(
            `INSERT INTO hub_stocks.movements
                (parc_itemtype, parc_glpi_id, item_id, serial_item_id, store_id, location_id, counterpart_store_id, type, stock_type, quantity, reason, reference, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [parc_itemtype || null, parc_glpi_id || null, item_id || null, serial_item_id, store_id, location_id, counterpart_store_id, type, stock_type, Math.abs(quantity), reason, reference, created_by]
        );

        await client.query('COMMIT');
        return { movementId: ins.rows[0].id };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { applyMovement };
