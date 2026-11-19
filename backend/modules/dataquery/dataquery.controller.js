/**
 * Module dataquery : interrogation en LECTURE SEULE de toutes les données
 * PostgreSQL de l'application (tous modules), destinée à un assistant IA
 * (Claude) ou à des outils d'analyse.
 *
 * Défense en profondeur :
 *  1. Accès uniquement par clé API de périmètre `dataquery`, avec date
 *     d'expiration obligatoire (les clés `*` existantes n'y ont PAS accès).
 *  2. Module désactivé tant que DATAQUERY_ENABLED !== 'true'.
 *  3. Connexion avec un rôle PostgreSQL dédié sans aucun droit d'écriture,
 *     colonnes/tables sensibles non accordées (cf. applyDataqueryGrants dans
 *     shared/pg_db.js). Le module refuse de tourner si ce rôle peut écrire.
 *  4. Chaque requête s'exécute dans une transaction READ ONLY annulée
 *     (ROLLBACK), en protocole étendu (une seule instruction possible), avec
 *     statement_timeout et un plafond de lignes.
 *  5. Journal d'audit (hub.dataquery_audit) + limitation de débit par clé.
 *  6. Double authentification : clé API + identification personnelle (AD),
 *     cf. dataquery.auth.js. Chaque ligne d'audit porte le username et
 *     l'identifiant de trace transmis par le serveur MCP (X-Trace-Id).
 */
const { pool } = require('../../shared/database');
const { getReadOnlyPool, checkRoleSafety } = require('./dataquery.pool');
const rights = require('./dataquery.rights');

// Schéma PostgreSQL → module fonctionnel de l'application (aide à la navigation).
const SCHEMA_MODULES = {
    hub: 'Socle (utilisateurs, certificats, calendriers, backlog, tâches, automatisations mail, infra)',
    hub_tickets: 'Tickets (système de tickets, suivis, techniciens, live chat)',
    hub_consommables: 'Consommables',
    hub_contrats: 'Contrats',
    hub_copieurs: 'Photocopieurs',
    hub_rencontres: 'Rencontres budgétaires',
    hub_calendrier: 'Calendriers O365',
    hub_budget_prep: 'Préparation budgétaire',
    hub_deploiements: 'Déploiements',
    hub_docs: 'Documents / GED',
    hub_notes: 'Notes',
    hub_parapheur: 'Parapheur électronique',
    hub_parc: 'Parc informatique',
    hub_prets: 'Prêts de matériel',
    hub_reseau: 'Réseau (switchs, VLAN, liens)',
    hub_stocks: 'Stocks',
    hub_telecom: 'Télécom / lignes',
    hub_vols: 'Vols / sinistres',
    finance: 'Finance (budget, commandes, factures, tiers)',
    glpi: 'GLPI (miroir historique, plus synchronisé)',
    magapp: 'MagApp (portail applicatif)',
    oracle: 'Import Oracle',
    projets: 'Projets (portefeuille)',
    transcript: 'Transcript manager (transcriptions de réunions)',
};

const MAX_ROWS_DEFAULT = 500;
const MAX_ROWS_HARD = 5000;
const STATEMENT_TIMEOUT_MS = 15000;
const MAX_SQL_LENGTH = 20000;
const MAX_CELL_CHARS = 20000;

// Limitation de débit en mémoire : N requêtes par fenêtre glissante, par clé.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 300;
const rateBuckets = new Map();
function rateLimited(keyId) {
    const now = Date.now();
    const arr = (rateBuckets.get(keyId) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (arr.length >= RATE_MAX) { rateBuckets.set(keyId, arr); return true; }
    arr.push(now);
    rateBuckets.set(keyId, arr);
    return false;
}

// Fonctions refusées même si le rôle n'y a de toute façon pas accès
// (défense en profondeur : effets de bord serveur, accès fichiers, DoS).
const FORBIDDEN_FUNCTIONS = /\b(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|lo_import|lo_export|lo_\w+|dblink\w*|pg_sleep\w*|set_config|pg_advisory\w*|pg_notify|nextval|setval|txid_current|pg_current_xact_id|pg_switch_wal|pg_create_\w+|pg_drop_\w+|pg_logical_\w+|pg_replication_\w+)\s*\(/i;
const ALLOWED_START = /^\s*(select|with|table|values|explain)\b/i;

function stripComments(sql) {
    return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function clientIp(req) {
    // X-Real-IP est posé par le nginx DMZ (non falsifiable par le client, contrairement
    // au premier élément de X-Forwarded-For).
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || null;
}

function traceId(req) {
    const t = req.headers['x-trace-id'];
    return typeof t === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(t) ? t : null;
}

async function audit(req, { action, sql, rowCount, durationMs, error }) {
    try {
        await pool.query(
            `INSERT INTO hub.dataquery_audit (api_key_id, api_key_name, username, trace_id, ip, action, sql_text, row_count, duration_ms, error)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [req.apiKey?.id || null, req.apiKey?.name || null, req.dqUser?.username || null, traceId(req), clientIp(req), action,
             sql ? String(sql).slice(0, MAX_SQL_LENGTH) : null, rowCount ?? null, durationMs ?? null,
             error ? String(error).slice(0, 2000) : null]
        );
    } catch (e) {
        console.error('[DATAQUERY] Audit impossible:', e.message);
    }
}

function sanitizeValue(v) {
    if (v === null || v === undefined) return v;
    if (Buffer.isBuffer(v)) return `<binaire ${v.length} octets>`;
    if (typeof v === 'string' && v.length > MAX_CELL_CHARS) {
        return v.slice(0, MAX_CELL_CHARS) + `… <tronqué, ${v.length} caractères>`;
    }
    return v;
}

/**
 * Exécute une requête dans une transaction READ ONLY toujours annulée.
 * `queryMode: 'extended'` force le protocole étendu : PostgreSQL refuse alors
 * plusieurs instructions dans un même appel ("cannot insert multiple commands
 * into a prepared statement"), ce qui empêche un `; COMMIT; ...` d'évasion.
 */
async function runReadOnly(text, values = [], rowMode) {
    const ro = getReadOnlyPool();
    const client = await ro.connect();
    try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await client.query(`SET LOCAL lock_timeout = 3000`);
        await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${STATEMENT_TIMEOUT_MS * 2}`);
        return await client.query({ text, values, queryMode: 'extended', rowMode });
    } finally {
        try { await client.query('ROLLBACK'); } catch (_) { /* connexion déjà invalide */ }
        client.release();
    }
}

/** Schémas (et tables) réellement lus par une requête, d'après son plan (EXPLAIN JSON). */
function relationsInPlan(node, out = []) {
    if (Array.isArray(node)) { node.forEach(n => relationsInPlan(n, out)); return out; }
    if (node && typeof node === 'object') {
        if (node['Relation Name']) out.push({ schema: node['Schema'] || 'public', table: node['Relation Name'] });
        for (const v of Object.values(node)) if (v && typeof v === 'object') relationsInPlan(v, out);
    }
    return out;
}

module.exports = {
    SCHEMA_MODULES,
    audit,
    clientIp,
    runReadOnly,

    /** Garde « clé » : module activé, clé dataquery valide et non expirable, rôle sûr. */
    async guard(req, res, next) {
        if (process.env.DATAQUERY_ENABLED !== 'true') {
            return res.status(503).json({ error: 'Module dataquery désactivé (DATAQUERY_ENABLED != true)' });
        }
        if (!req.apiKey) {
            return res.status(401).json({ error: 'Clé API de périmètre « dataquery » requise (X-API-Key)' });
        }
        if (req.apiKey.scope !== 'dataquery') {
            return res.status(403).json({ error: 'Cette clé n\'a pas le périmètre « dataquery » (les clés « tous modules » sont refusées ici)' });
        }
        try {
            const { rows } = await pool.query('SELECT expires_at FROM hub.api_keys WHERE id = $1', [req.apiKey.id]);
            if (!rows[0]?.expires_at) {
                return res.status(403).json({ error: 'Une clé dataquery doit avoir une date d\'expiration' });
            }
            const safety = await checkRoleSafety();
            if (!safety.ok) return res.status(503).json({ error: safety.reason });
        } catch (e) {
            return res.status(503).json({ error: `Base lecture seule indisponible : ${e.message}` });
        }
        if (rateLimited(req.apiKey.id)) {
            return res.status(429).json({ error: `Limite atteinte : ${RATE_MAX} requêtes par ${RATE_WINDOW_MS / 60000} min` });
        }
        next();
    },

    // GET /api/dataquery/health
    async health(req, res) {
        const safety = await checkRoleSafety().catch(e => ({ ok: false, reason: e.message }));
        res.json({
            enabled: process.env.DATAQUERY_ENABLED === 'true',
            readonly_role: safety,
            limits: { max_rows_default: MAX_ROWS_DEFAULT, max_rows_hard: MAX_ROWS_HARD, statement_timeout_ms: STATEMENT_TIMEOUT_MS, rate: `${RATE_MAX}/${RATE_WINDOW_MS / 60000}min` },
            key: { name: req.apiKey?.name, scope: req.apiKey?.scope },
            user: req.dqUser ? { username: req.dqUser.username, displayName: req.dqUser.displayName } : null,
        });
    },

    // GET /api/dataquery/catalog[?schema=hub_tickets]
    // Liste les modules (schémas) et leurs tables LISIBLES par le rôle lecture seule.
    async catalog(req, res) {
        const schema = req.query.schema ? String(req.query.schema) : null;
        try {
            const myRights = await rights.rightsFor(req.dqUser.username);
            const { rows: allRows } = await runReadOnly(`
                SELECT n.nspname AS schema, c.relname AS table,
                       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'vue'
                                      WHEN 'm' THEN 'vue matérialisée' WHEN 'f' THEN 'table externe' END AS kind,
                       GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
                       obj_description(c.oid, 'pg_class') AS comment,
                       has_table_privilege(c.oid, 'SELECT') AS full_access
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r','p','v','m','f')
                  AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%'
                  AND ($1::text IS NULL OR n.nspname = $1)
                  AND has_any_column_privilege(c.oid, 'SELECT')
                ORDER BY n.nspname, c.relname`, [schema]);
            // Droits par agent : un agent restreint ne voit que ses modules.
            const rows = allRows.filter(r => rights.schemaAllowed(myRights, r.schema));
            const modules = {};
            for (const r of rows) {
                if (!modules[r.schema]) modules[r.schema] = { schema: r.schema, module: SCHEMA_MODULES[r.schema] || null, tables: [] };
                modules[r.schema].tables.push({
                    table: r.table, kind: r.kind, estimated_rows: Number(r.estimated_rows),
                    comment: r.comment, columns_masked: !r.full_access,
                });
            }
            await audit(req, { action: 'catalog', sql: schema, rowCount: rows.length });
            res.json({ modules: Object.values(modules) });
        } catch (e) {
            await audit(req, { action: 'catalog', sql: schema, error: e.message });
            res.status(400).json({ error: e.message });
        }
    },

    // GET /api/dataquery/catalog/:schema/:table
    // Colonnes lisibles, types, clé primaire, clés étrangères.
    async describe(req, res) {
        const { schema, table } = req.params;
        try {
            if (!rights.schemaAllowed(await rights.rightsFor(req.dqUser.username), schema)) {
                await audit(req, { action: 'describe', sql: `${schema}.${table}`, error: 'module non autorisé pour cet agent' });
                return res.status(403).json({ error: `Vous n'avez pas accès au module « ${schema} »` });
            }
            const cols = await runReadOnly(`
                SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
                       NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS default,
                       col_description(c.oid, a.attnum) AS comment,
                       EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS primary_key
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
                WHERE n.nspname = $1 AND c.relname = $2
                  AND has_column_privilege(c.oid, a.attnum, 'SELECT')
                ORDER BY a.attnum`, [schema, table]);
            if (cols.rows.length === 0) {
                return res.status(404).json({ error: `Table ${schema}.${table} introuvable ou non accessible` });
            }
            const fks = await runReadOnly(`
                SELECT conname AS name, pg_get_constraintdef(oid) AS definition
                FROM pg_constraint
                WHERE contype = 'f' AND conrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass`, [schema, table]);
            const masked = await runReadOnly(`
                SELECT count(*)::int AS n FROM pg_attribute a
                WHERE a.attrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
                  AND a.attnum > 0 AND NOT a.attisdropped
                  AND NOT has_column_privilege(a.attrelid, a.attnum, 'SELECT')`, [schema, table]);
            await audit(req, { action: 'describe', sql: `${schema}.${table}`, rowCount: cols.rows.length });
            res.json({
                schema, table, module: SCHEMA_MODULES[schema] || null,
                columns: cols.rows, foreign_keys: fks.rows,
                masked_columns_count: masked.rows[0].n,
            });
        } catch (e) {
            await audit(req, { action: 'describe', sql: `${schema}.${table}`, error: e.message });
            res.status(400).json({ error: e.message });
        }
    },

    // POST /api/dataquery/query  { sql, params?: [], max_rows?: number }
    async query(req, res) {
        const { sql, params } = req.body || {};
        const maxRows = Math.min(Math.max(parseInt(req.body?.max_rows, 10) || MAX_ROWS_DEFAULT, 1), MAX_ROWS_HARD);
        if (typeof sql !== 'string' || !sql.trim()) return res.status(400).json({ error: 'Champ « sql » requis' });
        if (sql.length > MAX_SQL_LENGTH) return res.status(400).json({ error: `Requête trop longue (max ${MAX_SQL_LENGTH} caractères)` });
        if (params !== undefined && !Array.isArray(params)) return res.status(400).json({ error: '« params » doit être un tableau' });

        // `cleaned` (sans commentaires) sert uniquement aux contrôles ; on exécute le texte
        // d'origine pour ne pas altérer des littéraux contenant « -- ». Les instructions
        // multiples sont bloquées par PostgreSQL lui-même (protocole étendu, cf. runReadOnly).
        const cleaned = stripComments(sql).trim();
        const reject = async (error) => {
            await audit(req, { action: 'query_refusee', sql, error });
            return res.status(400).json({ error });
        };
        if (!ALLOWED_START.test(cleaned)) {
            return reject('Seules les requêtes SELECT / WITH / TABLE / VALUES / EXPLAIN sont acceptées');
        }
        if (FORBIDDEN_FUNCTIONS.test(cleaned)) {
            return reject('Requête refusée : fonction système non autorisée');
        }
        const body = sql.trim().replace(/;\s*$/, '');
        // Plafond de lignes : on enveloppe la requête (sauf EXPLAIN) et on lit max_rows + 1
        // pour savoir si le résultat a été tronqué.
        const isExplain = /^\s*explain\b/i.test(cleaned);
        const text = isExplain ? body : `SELECT * FROM (\n${body}\n) AS _dq LIMIT ${maxRows + 1}`;

        // Droits par agent : on lit le plan (EXPLAIN) pour connaître les tables réellement
        // touchées (vues et jointures comprises) et on refuse si l'une est hors de ses modules.
        // Les catalogues système (pg_catalog, information_schema) comptent comme hors module.
        try {
            const myRights = await rights.rightsFor(req.dqUser.username);
            if (myRights.mode === 'blocked') return reject('Accès bloqué pour cet agent');
            if (myRights.mode === 'restricted') {
                if (isExplain) return reject('EXPLAIN n\'est pas disponible avec des droits restreints');
                const plan = await runReadOnly(`EXPLAIN (FORMAT JSON) ${body}`, params || [], 'array');
                const refused = [...new Set(relationsInPlan(plan.rows[0][0])
                    .filter(r => !rights.schemaAllowed(myRights, r.schema)).map(r => r.schema))];
                if (refused.length) {
                    return reject(`Accès refusé : vous n'avez pas les droits sur le(s) module(s) ${refused.join(', ')}`);
                }
            }
        } catch (e) {
            await audit(req, { action: 'query', sql, error: `contrôle des droits : ${e.message}` });
            return res.status(400).json({ error: e.message });
        }

        const t0 = Date.now();
        try {
            // rowMode 'array' : on reconstruit les objets nous-mêmes pour ne pas perdre
            // les colonnes homonymes (SELECT a.id, b.id → id, id_2).
            const result = await runReadOnly(text, params || [], 'array');
            const durationMs = Date.now() - t0;
            const seen = {};
            const columns = result.fields.map(f => {
                seen[f.name] = (seen[f.name] || 0) + 1;
                return seen[f.name] === 1 ? f.name : `${f.name}_${seen[f.name]}`;
            });
            const truncated = !isExplain && result.rows.length > maxRows;
            const rows = (truncated ? result.rows.slice(0, maxRows) : result.rows).map(r => {
                const o = {};
                columns.forEach((c, i) => { o[c] = sanitizeValue(r[i]); });
                return o;
            });
            await audit(req, { action: 'query', sql, rowCount: rows.length, durationMs });
            res.json({
                columns,
                rows, row_count: rows.length, truncated, max_rows: maxRows, duration_ms: durationMs,
            });
        } catch (e) {
            const durationMs = Date.now() - t0;
            await audit(req, { action: 'query', sql, durationMs, error: e.message });
            const hint = /permission denied/i.test(e.message)
                ? 'Table ou colonne non exposée (données sensibles masquées). Consultez GET /api/dataquery/catalog/:schema/:table pour les colonnes accessibles.'
                : undefined;
            res.status(400).json({ error: e.message, hint });
        }
    },
};
