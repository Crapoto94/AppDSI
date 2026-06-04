const recRepo = require('../repositories/reception.repository');
const stockService = require('./stock.service');

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

            if (line.tracking_mode === 'serial') {
                for (let i = 0; i < qty; i++) {
                    const sid = await recRepo.createSerialItem({
                        parc_itemtype: line.parc_itemtype,
                        parc_glpi_id: line.parc_glpi_id,
                        item_id: line.item_id,
                        store_id: reception.store_id,
                        location_id: line.location_id,
                        serial_number: null,
                        order_number: reception.order_number,
                        reception_id: receptionId,
                        specs: line.specs,
                    });
                    createdSerials.push(sid);
                }
            }

            await stockService.applyMovement({
                parc_itemtype: line.parc_itemtype,
                parc_glpi_id: line.parc_glpi_id,
                item_id: line.item_id,
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
