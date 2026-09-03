const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const { authenticateTicketAdmin } = require('../tickets/middleware/ticket-permissions');
const ctrl = require('./mailboxes.controller');

// Lecture ouverte à tout utilisateur connecté (module public).
router.get('/', authenticateJWT, ctrl.list);

// Écriture réservée aux superviseurs/admins tickets (même pattern que
// request-forms.routes.js) — l'inventaire des boîtes partagées est une
// donnée de gestion DSI, pas librement modifiable par tous.
router.post('/', authenticateTicketAdmin, ctrl.create);
router.put('/:id', authenticateTicketAdmin, ctrl.update);
router.delete('/:id', authenticateTicketAdmin, ctrl.remove);

module.exports = router;
