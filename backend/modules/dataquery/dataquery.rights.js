/**
 * Droits d'interrogation du MCP, par agent (table hub.dataquery_rights).
 *
 *  mode 'all'        : tous les modules (schémas) accessibles au rôle lecture seule
 *  mode 'restricted' : uniquement les schémas listés dans `schemas`
 *  mode 'blocked'    : aucune interrogation (connexion refusée)
 *
 * La ligne `username = '*'` porte les droits par défaut, appliqués aux agents sans
 * ligne propre. Sans ligne `*`, le défaut est 'all' (comportement historique).
 * Les droits sont relus au plus toutes les 30 s (cache) et vidés à chaque modification.
 */
const { pool } = require('../../shared/database');

const DEFAULT_KEY = '*';
const CACHE_MS = 30000;
const MODES = ['all', 'restricted', 'blocked'];
let cache = { at: 0, map: new Map() };

async function loadAll() {
    if (Date.now() - cache.at < CACHE_MS) return cache.map;
    const { rows } = await pool.query('SELECT username, mode, schemas, write_actions, note, updated_by, updated_at FROM hub.dataquery_rights');
    const map = new Map();
    for (const r of rows) map.set(r.username, { ...r, schemas: r.schemas || [], write_actions: r.write_actions || [] });
    cache = { at: Date.now(), map };
    return map;
}

function clearCache() { cache = { at: 0, map: new Map() }; }

/** Droits effectifs d'un agent : { mode, schemas, source: 'agent' | 'defaut' | 'historique' }. */
async function rightsFor(username) {
    const map = await loadAll();
    const own = map.get(username);
    if (own) return { mode: own.mode, schemas: own.schemas, write_actions: own.write_actions, source: 'agent' };
    const def = map.get(DEFAULT_KEY);
    if (def) return { mode: def.mode, schemas: def.schemas, write_actions: def.write_actions, source: 'defaut' };
    return { mode: 'all', schemas: [], write_actions: [], source: 'historique' };
}

/** Le schéma est-il autorisé pour ces droits ? */
function schemaAllowed(rights, schema) {
    if (rights.mode === 'all') return true;
    if (rights.mode === 'blocked') return false;
    return rights.schemas.includes(schema);
}

const WRITE_ACTIONS = ['tickets', 'tasks', 'reunions'];

async function setRights(username, { mode, schemas, note, write_actions }, by) {
    if (!MODES.includes(mode)) throw new Error('Mode invalide');
    const list = mode === 'restricted'
        ? [...new Set((Array.isArray(schemas) ? schemas : []).map(s => String(s).trim()).filter(s => /^[a-z_][a-z0-9_]*$/i.test(s)))]
        : [];
    // write_actions non transmis : les droits d'écriture existants sont conservés.
    const hasW = Array.isArray(write_actions);
    const wlist = hasW ? [...new Set(write_actions.map(String).filter(a => WRITE_ACTIONS.includes(a)))] : [];
    await pool.query(
        `INSERT INTO hub.dataquery_rights (username, mode, schemas, write_actions, note, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (username) DO UPDATE
           SET mode = EXCLUDED.mode, schemas = EXCLUDED.schemas, note = EXCLUDED.note,
               write_actions = CASE WHEN $7 THEN EXCLUDED.write_actions ELSE hub.dataquery_rights.write_actions END,
               updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [username, mode, list, wlist, note ? String(note).slice(0, 500) : null, by || null, hasW]
    );
    clearCache();
}

async function deleteRights(username) {
    await pool.query('DELETE FROM hub.dataquery_rights WHERE username = $1', [username]);
    clearCache();
}

module.exports = { DEFAULT_KEY, MODES, WRITE_ACTIONS, loadAll, rightsFor, schemaAllowed, setRights, deleteRights, clearCache };
