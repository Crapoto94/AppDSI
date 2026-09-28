const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const service = require('./sedit-mandat.service');

// Mandatement (Sedit) d'une facture — page « Factures (beta) ».
router.get('/:numero', authenticateJWT, async (req, res) => {
    try {
        res.json(await service.getMandatementByFacture(req.params.numero));
    } catch (e) {
        console.error('[Mandatement] error:', e.message);
        res.status(500).json({ message: 'Erreur lecture mandatement', error: e.message });
    }
});

module.exports = router;
