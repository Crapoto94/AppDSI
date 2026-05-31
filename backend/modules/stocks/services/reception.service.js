const recRepo = require('../repositories/reception.repository');
const itemRepo = require('../repositories/stock.repository');
const stockService = require('./stock.service');

/**
 * Résout l'article d'une ligne : utilise item_id, sinon retrouve par référence/EAN,
 * sinon crée un nouvel article au catalogue.
 * @returns {Promise<number>} item_id
 */
async function resolveItem(line) {
    if (line.item_id) return line.item_id;
    const existing = await recRepo.findItemByReferenceOrEan(line.reference, line.ean);
    if (existing) return existing.id;
    // Création auto au catalogue
    return itemRepo.createItem({
        reference: line.reference || null,
        label: line.label || line.reference || line.ean || 'Article sans nom',
        ean: line.ean || null,
        category: line.category || (line.specs && line.specs.category) || null,
        brand: line.brand || (line.specs && line.specs.brand) || null,
        model: line.model || (line.specs && line.specs.model) || null,
        specs: line.specs || {},
        tracking_mode: line.tracking_mode || 'batch',
        unit: line.unit || 'unité',
    });
}

module.exports = {
    async createReception(data) {
        const id = await recRepo.createReception(data);
        return recRepo.getReception(id);
    },

    async getReceptionDetail(id) {
        const reception = await recRepo.getReception(id);
        if (!reception) return null;
        const lines = await recRepo.listLines(id);
        return { ...reception, lines };
    },

    async listReceptions(storeId) {
        return recRepo.listReceptions(storeId);
    },

    async addLine(receptionId, line) {
        const id = await recRepo.addLine(receptionId, line);
        return { id };
    },

    async deleteLine(receptionId, lineId) {
        await recRepo.deleteLine(lineId, receptionId);
    },

    /**
     * Valide la réception : pour chaque ligne, intègre le stock.
     * - batch  : +quantité dans stock_levels (mouvement 'in').
     * - serial : crée N serial_items (n° série différé) + +N dans stock_levels.
     * Idempotent : ne re-traite pas une réception déjà 'received'.
     */
    async validateReception(receptionId, user) {
        const reception = await recRepo.getReception(receptionId);
        if (!reception) throw new Error('Réception introuvable');
        if (reception.status === 'received') {
            return { already: true, reception_id: receptionId };
        }
        const lines = await recRepo.listLines(receptionId);
        if (lines.length === 0) throw new Error('Aucune ligne à réceptionner');

        const createdSerials = [];
        for (const line of lines) {
            const qty = parseInt(line.quantity_received, 10) || 0;
            if (qty <= 0) continue;
            const itemId = await resolveItem(line);

            if (line.tracking_mode === 'serial') {
                for (let i = 0; i < qty; i++) {
                    const sid = await recRepo.createSerialItem({
                        item_id: itemId,
                        store_id: reception.store_id,
                        location_id: line.location_id,
                        serial_number: null, // saisie différée
                        order_number: reception.order_number,
                        reception_id: receptionId,
                        specs: line.specs,
                    });
                    createdSerials.push(sid);
                }
            }

            // Incrément du niveau de stock agrégé (batch ET serial) + mouvement d'entrée
            await stockService.applyMovement({
                item_id: itemId,
                store_id: reception.store_id,
                location_id: line.location_id,
                type: 'in',
                stock_type: 'normal',
                quantity: qty,
                reason: 'Réception de commande',
                reference: reception.order_number || `RECEPTION-${receptionId}`,
                created_by: user?.username,
            });
        }

        await recRepo.setReceptionStatus(receptionId, 'received', user?.username);
        return { reception_id: receptionId, serials_created: createdSerials.length };
    },

    listSerialItems(params) {
        return recRepo.listSerialItems(params);
    },

    async setSerialNumber(id, storeId, serialNumber) {
        await recRepo.updateSerialNumber(id, storeId, serialNumber);
        return { ok: true };
    },
};
