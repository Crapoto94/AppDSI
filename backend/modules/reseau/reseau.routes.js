const express = require('express');
const router = express.Router();
const ctrl = require('./reseau.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');

router.use(authenticateJWT);

// ── Référentiel sites ──────────────────────────────────────────────
router.get('/sites',   ctrl.getSites);

// ── Liens réseau ───────────────────────────────────────────────────
router.get('/links',          ctrl.getLinks);
router.post('/links',         authenticateAdmin, ctrl.createLink);
router.put('/links/:id',      authenticateAdmin, ctrl.updateLink);
router.delete('/links/:id',   authenticateAdmin, ctrl.deleteLink);

// ── Accès réseau (WAN/opérateurs) ──────────────────────────────────
router.get('/access',         ctrl.getAccess);
router.post('/access',        authenticateAdmin, ctrl.createAccess);

// ── Fourreaux ──────────────────────────────────────────────────────
router.get('/ducts',          ctrl.getDucts);
router.post('/ducts',         authenticateAdmin, ctrl.createDuct);

// ── IRF Stacks ─────────────────────────────────────────────────────
router.get('/irf-stacks',       ctrl.getIrfStacks);
router.post('/irf-stacks',      authenticateAdmin, ctrl.createIrfStack);
router.put('/irf-stacks/:id',   authenticateAdmin, ctrl.updateIrfStack);

// ── Équipements ────────────────────────────────────────────────────
router.get('/equipements',          ctrl.getEquipements);
router.post('/equipements',         authenticateAdmin, ctrl.createEquipement);
router.put('/equipements/:id',      authenticateAdmin, ctrl.updateEquipement);
router.delete('/equipements/:id',   authenticateAdmin, ctrl.deleteEquipement);

// ── VLANs ──────────────────────────────────────────────────────────
router.get('/vlans',          ctrl.getVlans);
router.post('/vlans',         authenticateAdmin, ctrl.createVlan);
router.put('/vlans/:id',      authenticateAdmin, ctrl.updateVlan);

// ── Liaisons FO ────────────────────────────────────────────────────
router.get('/liaisons-fo',         ctrl.getLiaisonsFO);
router.post('/liaisons-fo',        authenticateAdmin, ctrl.createLiaisonFO);

// ── Sites avec état des switchs ─────────────────────────────────────
router.get('/sites-with-switches',   ctrl.getSitesWithSwitches);

// ── Liens switchs (API Infra) ──────────────────────────────────────
router.get('/switch-links',   ctrl.getSwitchLinks);

// ── Agrégat topologie ──────────────────────────────────────────────
router.get('/topologie',      ctrl.getTopologie);
router.get('/stats',          ctrl.getStats);

module.exports = router;
