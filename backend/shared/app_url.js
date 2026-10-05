/**
 * Résolution canonique de l'URL publique de DSI Hub (source unique pour tous les
 * liens de mails, SMS et pages partagées).
 *
 * Ordre de priorité :
 *   1. SQLite `app_settings.app_base_url` (Admin → Paramètres) — réglages de la prod
 *   2. variables d'environnement `APP_BASE_URL`, `APP_URL`, `FRONTEND_URL`
 *   3. valeur de secours `http://localhost:5173` (dev uniquement)
 *
 * Avant ce module, chaque module dupliquait sa propre copie de cette logique et
 * l'une d'elles (tickets/services/notification.service.js) lisait directement
 * `process.env.APP_URL || 'http://localhost:5173'` sans jamais consulter SQLite :
 * en prod (aucune variable APP_URL définie) les liens des mails de notification
 * partaient donc sur `http://localhost:5173`.
 */

const FALLBACK = 'http://localhost:5173';
const CACHE_TTL_MS = 60_000;

let cached = null;
let cachedAt = 0;

// require paresseux : évite tout cycle avec shared/database.js
function getSqliteSafe() {
    try {
        return require('./database').getSqlite();
    } catch {
        return null;
    }
}

/** Normalise une base URL : espaces, slash final, schéma absent (`dsihub.ivry.local` → `https://…`). */
function normalizeAppBaseUrl(raw) {
    if (raw === null || raw === undefined) return null;
    let value = String(raw).trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    return value.replace(/\/+$/, '');
}

function fromEnv() {
    return normalizeAppBaseUrl(process.env.APP_BASE_URL)
        || normalizeAppBaseUrl(process.env.APP_URL)
        || normalizeAppBaseUrl(process.env.FRONTEND_URL)
        || FALLBACK;
}

/**
 * URL publique de l'application. Asynchrone : lit SQLite une fois puis sert le
 * cache pendant CACHE_TTL_MS.
 * @returns {Promise<string>} ex. `https://dsihub.ivry.local`
 */
async function getAppBaseUrl() {
    if (cached && (Date.now() - cachedAt) < CACHE_TTL_MS) return cached;

    let resolved = null;
    try {
        const db = getSqliteSafe();
        if (db) {
            const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
            resolved = normalizeAppBaseUrl(row?.setting_value);
        }
    } catch (e) {
        // SQLite indisponible (script standalone, init en cours) → repli env
    }

    resolved = resolved || fromEnv();
    cached = resolved;
    cachedAt = Date.now();
    return resolved;
}

/**
 * Variante synchrone : renvoie la dernière valeur résolue (ou le repli env si
 * `getAppBaseUrl()` n'a jamais été appelé). À utiliser uniquement dans du code
 * synchrone qui ne peut pas attendre (ex. remplissage de templates) — le cache
 * est alimenté par les appels asynchrones voisins.
 */
function getAppBaseUrlSync() {
    return cached || fromEnv();
}

/** À appeler après une écriture dans `app_settings` (Admin → Paramètres). */
function invalidateAppBaseUrlCache() {
    cached = null;
    cachedAt = 0;
}

module.exports = {
    getAppBaseUrl,
    getAppBaseUrlSync,
    invalidateAppBaseUrlCache,
    normalizeAppBaseUrl,
    APP_BASE_URL_FALLBACK: FALLBACK,
};