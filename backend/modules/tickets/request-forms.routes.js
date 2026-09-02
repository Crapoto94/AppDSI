const express = require('express');
const router = express.Router();
const ctrl = require('./request-forms.controller');
const { authenticateJWT } = require('../../shared/middleware');
const { authenticateTicketAdmin } = require('./middleware/ticket-permissions');

// ── Administration (Admin Tickets -> "Formulaires de demande") ────────────
router.get('/admin', authenticateTicketAdmin, ctrl.listAdmin);
router.post('/admin', authenticateTicketAdmin, ctrl.createForm);
router.put('/admin/:id', authenticateTicketAdmin, ctrl.updateForm);
router.delete('/admin/:id', authenticateTicketAdmin, ctrl.deleteForm);

// ── Portail public (magapp) — tout utilisateur connecté ────────────────────
router.get('/published', authenticateJWT, ctrl.listPublished);
router.get('/:id', authenticateJWT, ctrl.getOne);
router.post('/:id/submit', authenticateJWT, ctrl.submit);

module.exports = router;
