/**
 * Sélecteur d'adaptateur de stockage documentaire.
 *
 * Le backend est déterminé PAR MODULE via la table PostgreSQL
 * `hub_docs.module_storage_config(module, backend, ged_root_path, …)` :
 *   - 'filesystem' : stockage local / SMB (storage.js)
 *   - 'alfresco'   : GED Alfresco uniquement
 *   - 'both'       : double écriture (local principal + copie Alfresco)
 *
 * En l'absence de ligne pour un module, on retombe sur le réglage global
 * historique `documents.backend` (app_settings), puis sur 'filesystem'.
 *
 * L'API exposée par les adaptateurs est identique, pour que documents.service.js
 * soit agnostique du stockage sous-jacent.
 */
const { pgDb, getSqlite } = require('../database');
const smbAdapter = require('./smb_adapter');
const alfrescoAdapter = require('./alfresco_adapter');

const VALID_BACKENDS = ['filesystem', 'alfresco', 'both'];
const LEGACY_SETTING_KEY = 'documents.backend';
const CACHE_TTL_MS = 30 * 1000;

/** @type {Map<string, {backend:string, expires:number}>} */
const moduleCache = new Map();
let legacyCache = { backend: null, expires: 0 };

/** Normalise une valeur de backend (alias 'smb' → 'filesystem'). */
function normalizeBackend(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'smb' || v === 'filesystem' || v === 'fs') return 'filesystem';
    if (v === 'alfresco' || v === 'ged') return 'alfresco';
    if (v === 'both' || v === 'les-deux') return 'both';
    return null;
}

async function readLegacyBackend() {
    if (legacyCache.backend && Date.now() < legacyCache.expires) return legacyCache.backend;
    let backend = 'filesystem';
    try {
        const db = getSqlite();
        if (db) {
            const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [LEGACY_SETTING_KEY]);
            backend = normalizeBackend(row && row.setting_value) || 'filesystem';
        }
    } catch { backend = 'filesystem'; }
    legacyCache = { backend, expires: Date.now() + CACHE_TTL_MS };
    return backend;
}

/** Backend configuré pour un module ('filesystem' | 'alfresco' | 'both'). */
async function getBackendForModule(moduleName, { force = false } = {}) {
    const key = String(moduleName || '').trim();
    if (key) {
        const cached = moduleCache.get(key);
        if (!force && cached && Date.now() < cached.expires) return cached.backend;
        try {
            const row = await pgDb.get(
                'SELECT backend FROM hub_docs.module_storage_config WHERE module = $1',
                [key]
            );
            const backend = normalizeBackend(row && row.backend);
            if (backend) {
                moduleCache.set(key, { backend, expires: Date.now() + CACHE_TTL_MS });
                return backend;
            }
        } catch { /* table absente ou PG indisponible : on retombe sur le global */ }
    }
    return await readLegacyBackend();
}

/** Renvoie l'adaptateur principal d'écriture/lecture pour un module. */
async function getAdapterForModule(moduleName) {
    const backend = await getBackendForModule(moduleName);
    return backend === 'alfresco' ? alfrescoAdapter : smbAdapter;
}

/** Adaptateur correspondant à un backend nommé (lecture d'une version stockée). */
function getAdapterByName(name) {
    return normalizeBackend(name) === 'alfresco' ? alfrescoAdapter : smbAdapter;
}

/** Vrai si la référence désigne un nœud Alfresco (« alf:<nodeId> »). */
function isAlfrescoRef(ref) {
    return typeof ref === 'string' && ref.startsWith('alf:');
}

async function getAdapter() {
    const backend = await readLegacyBackend();
    return backend === 'alfresco' ? alfrescoAdapter : smbAdapter;
}

async function getBackendName() {
    return await readLegacyBackend();
}

/** Force la relecture (après changement de configuration). */
function clearCache() {
    moduleCache.clear();
    legacyCache = { backend: null, expires: 0 };
}

module.exports = {
    VALID_BACKENDS,
    normalizeBackend,
    getAdapter,
    getAdapterForModule,
    getAdapterByName,
    getBackendForModule,
    getBackendName,
    isAlfrescoRef,
    clearCache,
    smbAdapter,
    alfrescoAdapter,
};
