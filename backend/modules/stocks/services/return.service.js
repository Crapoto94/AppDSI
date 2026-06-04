// ─── Retour de matériel (symétrique d'une sortie) ─────────────────────────────
// Réutilise le moteur des sorties (statuts, signatures, génération de fiche via
// gabarit) mais effectue un mouvement d'ENTRÉE : l'appareil rendu par l'agent
// revient en stock (serial_item → 'in_stock'). kind='return' sélectionne le
// gabarit de catégorie « retour ».
const repo = require('../repositories/delivery.repository');
const stockService = require('./stock.service');
const blPdf = require('./bl-pdf.service');
const { saveSignature } = require('./signature.util');

module.exports = {
    /**
     * Phase 1 — préparation du retour : ré-incrémente le stock, signature DSI,
     * génère la fiche retour pré-signée. Statut 'prepared'.
     */
    async prepareReturn(data, user) {
        const {
            store_id, lines = [], template_id, preparer_signature,
            beneficiary_name, beneficiary_username, beneficiary_email, notes, meta,
        } = data;
        if (!Array.isArray(lines) || lines.length === 0) throw new Error('Au moins une ligne est requise');

        const returnId = await repo.createDelivery({
            store_id, beneficiary_name, beneficiary_username, beneficiary_email, notes,
            delivered_by: user?.username, template_id, prepared_by: user?.username,
            kind: 'return', meta,
        });

        try {
            for (const line of lines) {
                if (!line.item_id) throw new Error('item_id requis sur chaque ligne');
                const qty = parseInt(line.quantity, 10) || 1;
                await stockService.applyMovement({
                    item_id: line.item_id, store_id, location_id: line.location_id || null,
                    serial_item_id: line.serial_item_id || null, type: 'in', stock_type: 'normal',
                    quantity: qty, reason: 'Retour de matériel',
                    reference: beneficiary_name || `RETOUR-${returnId}`, created_by: user?.username,
                });
                await repo.addDeliveryLine(returnId, line);
                if (line.serial_item_id) await repo.setSerialStatus(line.serial_item_id, 'in_stock');
            }
        } catch (e) {
            await repo.deleteDelivery(returnId).catch(() => {});
            throw e;
        }

        let preparerSigId = null;
        if (preparer_signature) {
            try {
                preparerSigId = await saveSignature(preparer_signature, {
                    entityType: 'fiche_retour_preparer_signature', entityId: returnId, uploadedBy: user?.username, title: 'Signature-DSI',
                });
            } catch (e) { console.error('[STOCKS] signature retour DSI:', e.message); }
        }
        await repo.setPreparation(returnId, { preparer_signature_document_id: preparerSigId, bl_document_id: null });

        let docId = null;
        try { docId = await blPdf.generateFiche(returnId, { withRecipient: false, user }); }
        catch (e) { console.error('[STOCKS] génération fiche retour:', e.message); }
        if (docId) await repo.setPreparation(returnId, { bl_document_id: docId });

        return repo.getDelivery(returnId);
    },

    /**
     * Phase 2 — l'agent signe la restitution ; on régénère la fiche avec les deux
     * signatures. Statut 'delivered'.
     */
    async confirmReturn(id, storeId, recipientSignature, user) {
        const ret = await repo.getDelivery(id);
        if (!ret) throw new Error('Retour introuvable');
        if (ret.store_id !== storeId) throw new Error('Retour hors de ce magasin');
        if (ret.status === 'delivered') return { already: true, delivery_id: id };

        let recipientSigId = null;
        if (recipientSignature) {
            try {
                recipientSigId = await saveSignature(recipientSignature, {
                    entityType: 'fiche_retour_recipient_signature', entityId: id, uploadedBy: user?.username, title: 'Signature-agent',
                });
            } catch (e) { console.error('[STOCKS] signature retour agent:', e.message); }
        }
        await repo.setDelivered(id, { recipient_signature_document_id: recipientSigId, bl_document_id: null });

        let docId = null;
        try { docId = await blPdf.generateFiche(id, { withRecipient: true, user }); }
        catch (e) { console.error('[STOCKS] régénération fiche retour:', e.message); }
        if (docId) await repo.setDelivered(id, { bl_document_id: docId });

        return repo.getDelivery(id);
    },
};
