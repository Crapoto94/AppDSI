const repo = require('../repositories/delivery.repository');
const stockService = require('./stock.service');
const blPdf = require('./bl-pdf.service');
const { saveSignature } = require('./signature.util');

module.exports = {
    /**
     * Phase 1 — PRÉPARATION.
     * Liste le matériel, décrémente le stock, le préparateur signe à l'écran,
     * génère un BL pré-signé. Statut final : 'prepared'.
     */
    async prepareDelivery(data, user) {
        const {
            store_id, lines = [], template_id, preparer_signature,
            beneficiary_name, beneficiary_username, beneficiary_email, notes,
        } = data;
        if (!Array.isArray(lines) || lines.length === 0) throw new Error('Au moins une ligne est requise');

        const deliveryId = await repo.createDelivery({
            store_id, beneficiary_name, beneficiary_username, beneficiary_email, notes,
            delivered_by: user?.username, template_id, prepared_by: user?.username,
        });

        try {
            for (const line of lines) {
                if (!line.item_id) throw new Error('item_id requis sur chaque ligne');
                const qty = parseInt(line.quantity, 10) || 1;
                await stockService.applyMovement({
                    item_id: line.item_id, store_id, location_id: line.location_id || null,
                    serial_item_id: line.serial_item_id || null, type: 'out', stock_type: 'normal',
                    quantity: qty, reason: 'Préparation livraison',
                    reference: beneficiary_name || `BL-${deliveryId}`, created_by: user?.username,
                });
                await repo.addDeliveryLine(deliveryId, line);
                if (line.serial_item_id) await repo.setSerialStatus(line.serial_item_id, 'delivered');
            }
        } catch (e) {
            await repo.deleteDelivery(deliveryId).catch(() => {});
            throw e;
        }

        // Signature préparateur
        let preparerSigId = null;
        if (preparer_signature) {
            try {
                preparerSigId = await saveSignature(preparer_signature, {
                    entityType: 'bl_preparer_signature', entityId: deliveryId, uploadedBy: user?.username, title: 'Signature-preparateur',
                });
            } catch (e) { console.error('[STOCKS] signature préparateur:', e.message); }
        }

        // Persiste la signature avant génération (le PDF la lit en base)
        await repo.setPreparation(deliveryId, { preparer_signature_document_id: preparerSigId, bl_document_id: null });

        // Génère le BL pré-signé (si gabarit défini)
        let blDocId = null;
        try {
            blDocId = await blPdf.generateBL(deliveryId, { withRecipient: false, user });
        } catch (e) { console.error('[STOCKS] génération BL préparation:', e.message); }
        if (blDocId) await repo.setPreparation(deliveryId, { bl_document_id: blDocId });

        return repo.getDelivery(deliveryId);
    },

    /**
     * Phase 2 — LIVRAISON.
     * Le destinataire signe ; on régénère le BL avec les deux signatures.
     * Statut final : 'delivered'.
     */
    async deliverDelivery(id, storeId, recipientSignature, user) {
        const delivery = await repo.getDelivery(id);
        if (!delivery) throw new Error('Livraison introuvable');
        if (delivery.store_id !== storeId) throw new Error('Livraison hors de ce magasin');
        if (delivery.status === 'delivered') return { already: true, delivery_id: id };
        if (delivery.status !== 'prepared') throw new Error('La livraison doit être préparée avant d\'être remise');

        let recipientSigId = null;
        if (recipientSignature) {
            try {
                recipientSigId = await saveSignature(recipientSignature, {
                    entityType: 'bl_recipient_signature', entityId: id, uploadedBy: user?.username, title: 'Signature-destinataire',
                });
            } catch (e) { console.error('[STOCKS] signature destinataire:', e.message); }
        }

        await repo.setDelivered(id, { recipient_signature_document_id: recipientSigId, bl_document_id: null });

        let blDocId = null;
        try {
            blDocId = await blPdf.generateBL(id, { withRecipient: true, user });
        } catch (e) { console.error('[STOCKS] génération BL livraison:', e.message); }
        if (blDocId) await repo.setDelivered(id, { bl_document_id: blDocId });

        return repo.getDelivery(id);
    },

    getDelivery(id) { return repo.getDelivery(id); },
    listDeliveries(storeId, status) { return repo.listDeliveries(storeId, status); },
};
