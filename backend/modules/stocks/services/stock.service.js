const { pool } = require('../../../shared/database');

// Types qui augmentent le stock vs le diminuent
const INBOUND = new Set(['in', 'loan_return']);
const OUTBOUND = new Set(['out', 'loan_out']);

/**
 * Upsert transactionnel d'une ligne stock_levels (gère location_id NULL).
 * delta peut être négatif. Verrou FOR UPDATE pour éviter les courses.
 */
async function adjustLevel(client, { item_id, store_id, location_id, stock_type, delta }) {
    const sel = await client.query(
        `SELECT id, quantity FROM hub_stocks.stock_levels
         WHERE item_id = $1 AND store_id = $2
           AND location_id IS NOT DISTINCT FROM $3 AND stock_type = $4
         FOR UPDATE`,
        [item_id, store_id, location_id || null, stock_type]
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
        `INSERT INTO hub_stocks.stock_levels (item_id, store_id, location_id, stock_type, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [item_id, store_id, location_id || null, stock_type, delta]
    );
    return delta;
}

/**
 * Applique un mouvement et met à jour les niveaux de stock dans une transaction.
 * @param {Object} mv
 * @param {number} mv.item_id
 * @param {number} mv.store_id
 * @param {number} [mv.location_id]
 * @param {number} [mv.counterpart_store_id]  (requis pour transfer)
 * @param {number} [mv.serial_item_id]
 * @param {'in'|'out'|'transfer'|'loan_out'|'loan_return'|'adjust'} mv.type
 * @param {'normal'|'loan'} [mv.stock_type]
 * @param {number} mv.quantity   (entier > 0 ; pour 'adjust' peut être négatif)
 * @param {string} [mv.reason]
 * @param {string} [mv.reference]
 * @param {string} [mv.created_by]
 * @returns {Promise<{movementId:number}>}
 */
async function applyMovement(mv) {
    const {
        item_id, store_id, location_id = null, counterpart_store_id = null,
        serial_item_id = null, type, reason = null, reference = null, created_by = null,
    } = mv;
    let { stock_type = 'normal', quantity } = mv;

    if (!item_id || !store_id || !type) throw new Error('item_id, store_id et type sont requis');
    quantity = parseInt(quantity, 10);
    if (Number.isNaN(quantity) || quantity === 0) throw new Error('Quantité invalide');

    // Les mouvements de prêt opèrent sur le stock de prêt
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
            await adjustLevel(client, { item_id, store_id, location_id, stock_type, delta: quantity });
        } else if (OUTBOUND.has(type)) {
            await adjustLevel(client, { item_id, store_id, location_id, stock_type, delta: -quantity });
        } else if (type === 'transfer') {
            await adjustLevel(client, { item_id, store_id, location_id, stock_type, delta: -quantity });
            await adjustLevel(client, { item_id, store_id: counterpart_store_id, location_id: null, stock_type, delta: quantity });
        } else if (type === 'adjust') {
            // quantity peut être négatif (correction d'inventaire)
            await adjustLevel(client, { item_id, store_id, location_id, stock_type, delta: quantity });
        }

        const ins = await client.query(
            `INSERT INTO hub_stocks.movements
                (item_id, serial_item_id, store_id, location_id, counterpart_store_id, type, stock_type, quantity, reason, reference, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [item_id, serial_item_id, store_id, location_id, counterpart_store_id, type, stock_type, Math.abs(quantity), reason, reference, created_by]
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
