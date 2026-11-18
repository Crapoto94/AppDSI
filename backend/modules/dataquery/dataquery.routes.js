const express = require('express');
const router = express.Router();
const ctrl = require('./dataquery.controller');

/**
 * Interrogation en lecture seule de toutes les données PostgreSQL (tous modules).
 * Double authentification :
 *   1. clé API de périmètre `dataquery`, avec date d'expiration (X-API-Key),
 *      vérifiée par la passerelle apiKeyGate (shared/middleware.js) montée sur /api ;
 *   2. session personnelle (X-DQ-Session) obtenue par POST /auth/login (AD).
 *
 *   POST /api/dataquery/auth/login               { username, password } → { session }
 *   POST /api/dataquery/auth/logout              révoque la session
 *   GET  /api/dataquery/health                   état du module et du rôle lecture seule
 *   GET  /api/dataquery/catalog[?schema=xxx]     modules (schémas) et tables accessibles
 *   GET  /api/dataquery/catalog/:schema/:table   colonnes, PK, FK d'une table
 *   POST /api/dataquery/query                    { sql, params?, max_rows? }
 */
const auth = require('./dataquery.auth')(ctrl.audit, ctrl.clientIp);

// 1er facteur (clé API) pour toutes les routes.
router.use(ctrl.guard);
// Ouverture de session personnelle : clé API + identifiants AD.
router.post('/auth/login', express.json({ limit: '10kb' }), auth.login);
// 2e facteur (session personnelle) pour tout le reste.
router.use(auth.requireSession);
router.post('/auth/logout', auth.logout);
router.get('/health', ctrl.health);
router.get('/catalog', ctrl.catalog);
router.get('/catalog/:schema/:table', ctrl.describe);
router.post('/query', express.json({ limit: '100kb' }), ctrl.query);

module.exports = router;
