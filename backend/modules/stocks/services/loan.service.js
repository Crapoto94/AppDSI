const repo = require('../repositories/delivery.repository');
const stockService = require('./stock.service');
const { saveSignature } = require('./signature.util');

module.exports = {
    /**
     * Crée un prêt : sort une quantité du stock de prêt (stock_type='loan'),
     * marque l'unité sérialisée comme 'loaned', enregistre la signature si fournie.
     */
    async createLoan(data, user) {
        const { store_id, item_id, serial_item_id, quantity = 1, signature } = data;
        if (!item_id) throw new Error('item_id requis');

        // Décrément du stock de prêt
        await stockService.applyMovement({
            item_id, store_id, serial_item_id: serial_item_id || null,
            type: 'loan_out', quantity: parseInt(quantity, 10) || 1,
            reason: 'Prêt', reference: data.borrower_name || null, created_by: user?.username,
        });

        let signatureDocId = null;
        const loanId = await repo.createLoan({ ...data, delivered_by: user?.username });
        if (signature) {
            try {
                signatureDocId = await saveSignature(signature, {
                    entityType: 'loan_signature', entityId: loanId, uploadedBy: user?.username, title: 'Pret',
                });
                if (signatureDocId) {
                    const { pgDb } = require('../../../shared/database');
                    await pgDb.run(`UPDATE hub_stocks.loans SET signature_document_id = $1 WHERE id = $2`, [signatureDocId, loanId]);
                }
            } catch (e) {
                console.error('[STOCKS] Échec enregistrement signature prêt:', e.message);
            }
        }
        if (serial_item_id) await repo.setSerialStatus(serial_item_id, 'loaned');

        return repo.getLoan(loanId);
    },

    /** Retour de prêt : ré-incrémente le stock de prêt, remet l'unité en stock. */
    async returnLoan(loanId, storeId, user) {
        const loan = await repo.getLoan(loanId);
        if (!loan) throw new Error('Prêt introuvable');
        if (loan.store_id !== storeId) throw new Error('Prêt hors de ce magasin');
        if (loan.status === 'returned') return { already: true, loan_id: loanId };

        await stockService.applyMovement({
            item_id: loan.item_id, store_id: storeId, serial_item_id: loan.serial_item_id || null,
            type: 'loan_return', quantity: loan.quantity,
            reason: 'Retour de prêt', reference: loan.borrower_name || null, created_by: user?.username,
        });
        if (loan.serial_item_id) await repo.setSerialStatus(loan.serial_item_id, 'in_stock');
        await repo.returnLoan(loanId);
        return { loan_id: loanId };
    },

    listLoans(storeId, status) { return repo.listLoans(storeId, status); },
};
