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
 *   GET  /api/dataquery/guides[?module=xxx]      guides de modules : tables clés, règles, requêtes types (parc, télécom, contrats, boîtes partagées, vols/pertes)
 *   POST /api/dataquery/query                    { sql, params?, max_rows? }
 *   POST /api/dataquery/actions/{tickets,tasks,reunions}   création (clé read_write + droit d'écriture de l'agent)
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
router.get('/guides', ctrl.guides);
router.get('/catalog/:schema/:table', ctrl.describe);
router.post('/query', express.json({ limit: '100kb' }), ctrl.query);
// Écriture (tickets, tâches, réunions) : clé read_write + droit d'écriture de l'agent, cf. dataquery.actions.js
const actions = require('./dataquery.actions');
router.post('/actions/tickets', express.json({ limit: '50kb' }), actions.createTicket);
router.post('/actions/tasks', express.json({ limit: '50kb' }), actions.createTask);
router.post('/actions/reunions', express.json({ limit: '50kb' }), actions.createReunion);

module.exports = router;
