/**
 * Sélecteur d'adaptateur de stockage documentaire.
 *
 * Choix du backend lu depuis SQLite (setting "documents.backend").
 * Valeurs supportées : 'smb' (défaut), 'alfresco' (stub).
 *
 * L'API exposée par les adaptateurs est volontairement identique, pour que
 * documents.service.js soit totalement agnostique du stockage sous-jacent.
 */
const { getSqlite } = require('../database');
const smbAdapter = require('./smb_adapter');
const alfrescoAdapter = require('./alfresco_adapter');

const SETTING_KEY = 'documents.backend';
let cachedBackend = null;
let cacheExpires = 0;
const CACHE_TTL_MS = 30 * 1000;

async function readBackendFromDb() {
    try {
        const db = getSqlite();
        const row = await db.get('SELECT value FROM settings WHERE key = ?', [SETTING_KEY]);
        return (row && row.value) || 'smb';
    } catch (e) {
        return 'smb';
    }
}

async function getBackendName() {
    if (cachedBackend && Date.now() < cacheExpires) return cachedBackend;
    cachedBackend = await readBackendFromDb();
    cacheExpires = Date.now() + CACHE_TTL_MS;
    return cachedBackend;
}

async function getAdapter() {
    const name = await getBackendName();
    if (name === 'alfresco') return alfrescoAdapter;
    return smbAdapter;
}

/** Récupère l'adaptateur correspondant à un backend nommé (utile pour servir un fichier d'un backend différent du courant). */
function getAdapterByName(name) {
    if (name === 'alfresco') return alfrescoAdapter;
    return smbAdapter;
}

/** Force la relecture du backend (à appeler après changement de configuration). */
function clearCache() {
    cachedBackend = null;
    cacheExpires = 0;
}

module.exports = {
    getAdapter,
    getAdapterByName,
    getBackendName,
    clearCache,
};
