const express = require('express');
const router = express.Router();
const swr = require('../../shared/swr-cache');
// Toute écriture (opérations, affectations de commandes…) invalide le cache des lectures /budget
router.use((req, res, next) => { if (req.method !== 'GET') res.on('finish', () => swr.clear()); next(); });
const financeController = require('./finance.controller');
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');

// Debug routes
router.get('/debug/invoices-count', authenticateJWT, async (req, res) => {
    try {
        const result = await require('../../shared/database').pool.query('SELECT COUNT(*) FROM oracle.gf_oracle_facture');
        res.json({ count: result.rows[0].count, message: 'Factures en base' });
    } catch (e) {
        res.json({ error: e.message, message: 'Erreur vérification factures' });
    }
});

router.get('/debug/orders-count', authenticateJWT, async (req, res) => {
    try {
        const result = await require('../../shared/database').pool.query('SELECT COUNT(*) FROM oracle.gf_oracle_commande');
        res.json({ count: result.rows[0].count, message: 'Commandes en base' });
    } catch (e) {
        res.json({ error: e.message, message: 'Erreur vérification commandes' });
    }
});

router.get('/debug/orders-sample', authenticateJWT, async (req, res) => {
    try {
        const result = await require('../../shared/database').pool.query('SELECT "COMMANDE_COMMANDE", "COMMANDE_CMD_DATECOMMANDE", "COMMANDE_MONTANT_TTC" FROM oracle.gf_oracle_commande LIMIT 5');
        res.json({ rows: result.rows, message: 'Sample de 5 commandes' });
    } catch (e) {
        res.json({ error: e.message, message: 'Erreur lecture sample' });
    }
});

// Demande de virement de crédits (historique, parapheur, envoi au budget)
const virements = require('./virement-credits.controller');
router.get('/virement-credits/settings', authenticateJWT, virements.getSettings);
router.put('/virement-credits/settings', authenticateJWT, virements.saveSettings);
router.get('/virement-credits/lines', authenticateJWT, virements.liveLines);
router.get('/virement-credits', authenticateJWT, virements.list);
router.post('/virement-credits', authenticateJWT, virements.save);
router.get('/virement-credits/:id/pdf', authenticateJWT, virements.pdf);
router.post('/virement-credits/:id/parapheur', authenticateJWT, virements.sendToParapheur);
router.post('/virement-credits/:id/send-budget', authenticateJWT, virements.sendToBudget);
router.delete('/virement-credits/:id', authenticateJWT, virements.remove);

// Operations CRUD
router.get('/operations', authenticateJWT, swr.wrap('budget-operations', financeController.getOperations));
router.get('/operations/:id/orders', authenticateJWT, financeController.getOperationOrders);
router.post('/operations', authenticateAdminOrFinances, financeController.createOperation);
router.put('/operations/:id', authenticateAdminOrFinances, financeController.updateOperation);
router.delete('/operations/:id', authenticateAdminOrFinances, financeController.deleteOperation);

// Invoices & Lines
router.get('/invoices', authenticateJWT, swr.wrap('budget-invoices', financeController.getInvoices));
router.get('/lines', authenticateJWT, swr.wrap('budget-lines', financeController.getLines));
// Synthèse budgétaire lue en direct dans Sedit (Oracle FI)
router.get('/synthese-sedit', authenticateJWT, async (req, res) => {
    try {
        res.json(await require('./sedit-budget-synthese.service').getBudgetSynthese({ exercice: req.query.fiscalYear, scope: req.query.budgetScope, budget: req.query.budget }));
    } catch (e) {
        console.error('[Finance] synthese-sedit error:', e);
        res.status(500).json({ message: 'Erreur lecture Sedit', error: e.message });
    }
});
router.get('/engagements/years', authenticateJWT, financeController.getEngagementYears);
router.get('/engagements', authenticateJWT, swr.wrap('budget-engagements', financeController.getEngagements));

// Orders
router.get('/orders', authenticateJWT, swr.wrap('budget-orders', financeController.getOrders));
router.get('/orders/years', authenticateJWT, financeController.getOrderYears);
router.post('/orders/bulk-assign', authenticateJWT, financeController.bulkAssign);
router.post('/orders/:id/assign-operation', authenticateJWT, financeController.assignOperation);
router.post('/orders/:id/assign-app', authenticateJWT, financeController.assignApp);

// ── Préchauffage : /budget charge ces 5 listes (Sedit en direct) à chaque ouverture ; le serveur les garde au chaud et les
// recalcule en arrière-plan (démarrage puis toutes les 4 min), pour que la page s'affiche sans attendre Sedit.
const WARM = [
    ['budget-lines', financeController.getLines], ['budget-engagements', financeController.getEngagements],
    ['budget-invoices', financeController.getInvoices], ['budget-orders', financeController.getOrders],
    ['budget-operations', financeController.getOperations],
];
let warming = false;
async function warmBudget() {
    if (warming) return;
    warming = true;
    const t0 = Date.now();
    try {
        const year = new Date().getFullYear();
        for (const budgetScope of ['Ville', 'All']) {
            for (const [name, handler] of WARM) {
                await swr.warm(name, handler, { fiscalYear: String(year), budgetScope }).catch((e) => console.warn(`[BUDGET WARM] ${name}/${budgetScope} :`, e.message));
            }
        }
        console.log(`[BUDGET WARM] cache /budget préchauffé en ${Math.round((Date.now() - t0) / 1000)} s`);
    } finally { warming = false; }
}
if (process.env.BUDGET_WARMUP !== '0') {
    setTimeout(() => { warmBudget(); setInterval(warmBudget, 4 * 60 * 1000).unref(); }, 25 * 1000).unref();
}

module.exports = router;
