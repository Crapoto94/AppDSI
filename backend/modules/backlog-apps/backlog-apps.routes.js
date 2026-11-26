const express = require('express');
const router = express.Router();
const { authenticateAdmin, authenticateApiKey, requireApiScope } = require('../../shared/middleware');
const c = require('./backlog-apps.controller');

// Demandes et bugs des applications de la DSI (DSI Hub, MagApp, VibeLocatif, VibeDélib, ODP, iAmbassadeurs, Mandat) — administrateurs.
// La liste vient de la table centrale hub.demandes_apps ; seules les applications ayant adopté le contrat « décision » (VibeLocatif) se traitent depuis le hub.
router.get('/', authenticateAdmin, c.list);
router.post('/sync', authenticateAdmin, c.synchroniser);
router.put('/:id/decision', authenticateAdmin, c.decider);

// API des applications (clé API du hub, périmètre « backlog-apps », nom de la clé = code de l'application : locatif, delib, odp, iambassadeurs, mandat…)
// — pour celles dont la base n'est PAS partagée avec le hub : elles déposent leurs demandes et appliquent les décisions sans accès SQL.
const appKey = [authenticateApiKey, requireApiScope('backlog-apps')];
router.post('/depot', ...appKey, c.depot);
router.get('/decisions', ...appKey, c.decisionsEnAttente);
router.post('/decisions/:id/ack', ...appKey, c.accuse);

module.exports = router;
