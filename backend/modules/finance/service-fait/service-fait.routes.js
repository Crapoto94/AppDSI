const express = require('express');
const router = express.Router();
const controller = require('./service-fait.controller');
const { authenticateJWT, authenticateAdmin, authenticateServiceFaitManager } = require('../../../shared/middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Internal API (requires JWT)
// Opérations de modification du service fait : superadmin / admin / finances / compta (rôle résolu comme /api/auth/me)
router.post('/', authenticateServiceFaitManager, controller.createWorkflow);
// Déclaration directe du service fait (sans circuit de validation) — PJ obligatoire
router.post('/self', authenticateServiceFaitManager, upload.array('files', 10), controller.createSelfWorkflow);
// Traitement par lot (circuit ou déclaration directe) : factures d'un même fournisseur, mêmes paramètres pour chacune
router.post('/batch', authenticateServiceFaitManager, upload.array('files', 10), async (req, res) => {
    try {
        const b = req.body || {};
        const mode = b.mode === 'self' ? 'self' : 'circuit';
        let invoices = b.invoices;
        if (typeof invoices === 'string') { try { invoices = JSON.parse(invoices); } catch { invoices = []; } }
        if (!Array.isArray(invoices) || invoices.length < 2) return res.status(400).json({ message: 'Sélectionnez au moins deux factures' });
        if (invoices.length > 50) return res.status(400).json({ message: '50 factures maximum par lot' });
        const suppliers = new Set(invoices.map(i => String(i.invoice_supplier || '').trim().toUpperCase()));
        if (suppliers.size > 1) return res.status(400).json({ message: 'Un lot ne peut contenir que des factures d’un même fournisseur' });
        const items = invoices.map(i => ({
            invoice_ref: String(i.invoice_ref || '').trim(), invoice_number: String(i.invoice_number || i.invoice_ref || ''), invoice_label: String(i.invoice_label || ''),
            invoice_supplier: String(i.invoice_supplier || ''), invoice_amount: i.invoice_amount != null ? String(i.invoice_amount) : '', invoice_section: String(i.invoice_section || ''),
        })).filter(i => i.invoice_ref);
        const common = { service_fait_date: String(b.service_fait_date || ''), comment: String(b.comment || ''), demande_pj_ids: '[]' };
        if (mode === 'circuit') {
            if (!b.verifier_username) return res.status(400).json({ message: 'Vérificateur requis' });
            Object.assign(common, { verifier_username: String(b.verifier_username), director_mode: ['informe', 'visa'].includes(b.director_mode) ? b.director_mode : null, entity_code: b.entity_code });
        }
        res.json({ results: await controller.runBatch(req, items, mode, common) });
    } catch (e) { console.error('[ServiceFait] batch:', e); res.status(500).json({ message: 'Erreur traitement par lot', error: e.message }); }
});
router.post('/statuses', authenticateJWT, controller.getStatuses);
// Directeurs paramétrés (générique) — AVANT /:id.
router.get('/directors', authenticateJWT, controller.getDirectors);
// PJ de la demande de commande associée à la facture (préremplissage de la modale SF) — AVANT /:id.
router.get('/demande-pieces', authenticateJWT, controller.getDemandePieces);
// État de la facture des commandes (pastille FAC sur la liste des commandes)
router.post('/commande-statuses', authenticateJWT, controller.getCommandeFactureStatuses);
// Écritures Sedit (admin) — AVANT /:id pour ne pas être capturé par la route paramétrée.
router.get('/sedit-writes', authenticateAdmin, controller.listSeditWrites);
router.post('/sedit-writes/:logId/undo', authenticateAdmin, controller.undoSeditWrite);
router.get('/:id', authenticateJWT, controller.getWorkflow);
router.post('/:id/cancel', authenticateServiceFaitManager, controller.cancelWorkflow);
router.post('/:id/pieces-jointes', authenticateServiceFaitManager, upload.array('files', 10), controller.addPiecesJointes);
router.delete('/pieces-jointes/:pjId', authenticateServiceFaitManager, controller.deletePieceJointe);

// Public API (no JWT — token-based)
router.get('/public/:token', controller.getPublicByToken);
router.post('/public/:token/decision', controller.submitDecision);
// Pièces jointes déposées par le vérificateur via son lien public (sans JWT).
router.post('/public/:token/pieces-jointes', upload.array('files', 10), controller.addPublicPiecesJointes);
// Pièces jointes Sedit de la facture, consultables par le vérificateur via son lien
// public (avant décision) — remplace l'ancien upload manuel de la facture.
router.get('/public/:token/documents', controller.getPublicDocuments);
router.get('/public/:token/documents/:docId', controller.getPublicDocumentFile);
// Visa du directeur : lien public distinct (token dédié au directeur).
router.get('/public/director/:token', controller.getPublicDirectorByToken);
router.post('/public/director/:token/decision', controller.submitDirectorDecision);

module.exports = router;
