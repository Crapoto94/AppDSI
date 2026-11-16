const express = require('express');
const router = express.Router();
const ctrl = require('./dataquery.controller');

/**
 * Interrogation en lecture seule de toutes les données PostgreSQL (tous modules).
 * Accès : clé API de périmètre `dataquery` uniquement (X-API-Key), avec date
 * d'expiration. L'authentification de la clé est faite par la passerelle
 * apiKeyGate (shared/middleware.js) montée sur /api.
 *
 *   GET  /api/dataquery/health                   état du module et du rôle lecture seule
 *   GET  /api/dataquery/catalog[?schema=xxx]     modules (schémas) et tables accessibles
 *   GET  /api/dataquery/catalog/:schema/:table   colonnes, PK, FK d'une table
 *   POST /api/dataquery/query                    { sql, params?, max_rows? }
 */
router.use(ctrl.guard);
router.get('/health', ctrl.health);
router.get('/catalog', ctrl.catalog);
router.get('/catalog/:schema/:table', ctrl.describe);
router.post('/query', express.json({ limit: '100kb' }), ctrl.query);

module.exports = router;
