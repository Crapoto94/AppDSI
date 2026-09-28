const express = require('express');
const router = express.Router();
const rhController = require('./rh.controller');
const encadrantsCtrl = require('./encadrants.controller');
const { authenticateAdmin, authenticateJWT } = require('../../shared/middleware');

// Organisation : lecture ouverte à tout utilisateur connecté.
// Le référentiel agents / la synchro AD-Azure / les propositions sont désormais
// gérés par RH Studio (cf. /api/infra/rh-studio/*) — ces endpoints AppDSI ont été retirés.
router.get('/organisation-chart', authenticateJWT, rhController.getOrganisationChart);
router.get('/services-tree', authenticateJWT, rhController.getServicesTree);

// Encadrants (directeurs + resp. service) — lecture et téléphones : tout utilisateur connecté
router.get('/encadrants', authenticateJWT, encadrantsCtrl.getEncadrants);
router.put('/encadrants/:matricule/telephone', authenticateJWT, encadrantsCtrl.updateTelephone);
router.get('/encadrants/parc-phones', authenticateJWT, encadrantsCtrl.parcPhones);
router.post('/encadrants/parc-phones/apply', authenticateJWT, encadrantsCtrl.parcPhonesApply);
router.get('/encadrants/ad-search', authenticateJWT, encadrantsCtrl.searchAD);
router.put('/encadrants/:matricule/ad-link', authenticateJWT, encadrantsCtrl.linkAD);
router.get('/encadrants/ad-groups-list', authenticateJWT, encadrantsCtrl.listADGroups);
router.get('/encadrants/ad-group', authenticateJWT, encadrantsCtrl.getADGroup);

// Groupes particuliers (bases sur une liste de diffusion AD) — lecture ouverte
// à tout utilisateur connecté (nécessaire pour peupler les cases "public
// autorisé" côté formulaires de demande), écriture réservée aux admins.
router.get('/encadrants/custom-groups', authenticateJWT, encadrantsCtrl.listCustomGroups);
router.post('/encadrants/custom-groups', authenticateAdmin, encadrantsCtrl.createCustomGroup);
router.put('/encadrants/custom-groups/:id', authenticateAdmin, encadrantsCtrl.updateCustomGroup);
router.delete('/encadrants/custom-groups/:id', authenticateAdmin, encadrantsCtrl.deleteCustomGroup);
router.get('/encadrants/custom-groups/:id/members', authenticateJWT, encadrantsCtrl.getCustomGroupMembers);

module.exports = router;
