/**
 * Pool PostgreSQL dédié au module dataquery.
 *
 * Il se connecte avec un rôle LECTURE SEULE distinct (par défaut `dq_readonly`,
 * créé par sql/setup_global.sql). La lecture seule est donc garantie
 * par PostgreSQL lui-même (droits SELECT uniquement, colonnes sensibles
 * masquées), pas seulement par le code de ce module.
 *
 * Variables d'environnement :
 *   DATAQUERY_PG_USER      (défaut : dq_readonly)
 *   DATAQUERY_PG_PASSWORD  (obligatoire — sinon le module reste désactivé)
 *   DATAQUERY_PG_HOST / _DB / _PORT (défaut : ceux de la base principale)
 */
const { Pool } = require('pg');

let pool = null;

function getReadOnlyPool() {
    if (pool) return pool;
    if (!process.env.DATAQUERY_PG_PASSWORD) return null;
    pool = new Pool({
        user: process.env.DATAQUERY_PG_USER || 'dq_readonly',
        password: process.env.DATAQUERY_PG_PASSWORD,
        host: process.env.DATAQUERY_PG_HOST || process.env.POSTGRES_HOST || '10.103.130.106',
        database: process.env.DATAQUERY_PG_DB || process.env.POSTGRES_DB || 'ivry_admin',
        port: process.env.DATAQUERY_PG_PORT || process.env.POSTGRES_PORT || 5432,
        max: 4,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        application_name: 'appdsi-dataquery',
    });
    pool.on('error', (e) => console.error('[DATAQUERY] Erreur pool:', e.message));
    return pool;
}

/**
 * Vérifie que le rôle connecté est réellement inoffensif : pas superuser,
 * pas de contournement RLS, pas de création de rôles/bases, et aucun droit
 * d'écriture sur la moindre table. Résultat mis en cache 5 minutes.
 */
let safetyCache = { at: 0, result: null };
async function checkRoleSafety() {
    if (safetyCache.result && Date.now() - safetyCache.at < 5 * 60 * 1000) return safetyCache.result;
    const p = getReadOnlyPool();
    if (!p) return { ok: false, reason: 'DATAQUERY_PG_PASSWORD non défini : rôle lecture seule non configuré' };
    const { rows } = await p.query(`
        SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
               EXISTS (
                 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relkind IN ('r','p','v','m','f')
                   AND n.nspname NOT IN ('pg_catalog','information_schema')
                   AND (has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE')
                     OR has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE'))
               ) AS can_write
        FROM pg_roles r WHERE r.rolname = current_user`);
    const r = rows[0];
    let result;
    if (!r) result = { ok: false, reason: 'Rôle introuvable' };
    else if (r.rolsuper || r.rolbypassrls || r.rolcreaterole || r.rolcreatedb) {
        result = { ok: false, reason: `Le rôle ${r.rolname} a des privilèges d'administration : refus d'exécuter des requêtes avec lui` };
    } else if (r.can_write) {
        result = { ok: false, reason: `Le rôle ${r.rolname} a des droits d'écriture sur au moins une table : refus` };
    } else result = { ok: true, role: r.rolname };
    safetyCache = { at: Date.now(), result };
    return result;
}

module.exports = { getReadOnlyPool, checkRoleSafety };
