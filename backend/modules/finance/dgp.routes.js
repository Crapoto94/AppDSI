const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdminOrFinances } = require('../../shared/middleware');
const service = require('./dgp.service');

// Statistiques DGP (délai global de paiement) des factures — widget dashboard.
router.get('/stats', authenticateJWT, async (req, res) => {
    try {
        res.json(await service.getDgpStats({ fiscalYear: req.query.fiscal_year }));
    } catch (e) {
        console.error('[DGP] error:', e.message);
        res.status(500).json({ message: 'Erreur calcul DGP', error: e.message });
    }
});

// DGP par facture (chargement progressif) : { roos: [...] } -> { [roo]: { dgp, def, refuse } }.
router.post('/factures', authenticateJWT, async (req, res) => {
    try {
        const roos = Array.isArray(req.body?.roos) ? req.body.roos : [];
        res.json(await service.getFacturesDgp(roos));
    } catch (e) {
        console.error('[DGP] factures error:', e.message);
        res.status(500).json({ message: 'Erreur calcul DGP', error: e.message });
    }
});

// Recalcul manuel du cache DGP (admin/finances) — sinon cron quotidien à 05h00.
router.post('/refresh', authenticateAdminOrFinances, async (req, res) => {
    try {
        res.json(await service.refreshFacturesDgpCache({ year: req.body?.year }));
    } catch (e) {
        console.error('[DGP] refresh error:', e.message);
        res.status(500).json({ message: 'Erreur recalcul DGP', error: e.message });
    }
});

module.exports = router;
