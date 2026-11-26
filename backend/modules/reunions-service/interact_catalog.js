/**
 * Catalogue des formats d'interaction proposés par Interact'Ivry.
 *
 * Lecture SEULE : on ne crée rien dans Interact'Ivry. DSIHub récupère la
 * liste des formats (choix unique, nuage de mots, boîte à idées…) pour que
 * tout nouveau format ajouté côté Interact'Ivry apparaisse automatiquement
 * dans le composeur d'INTERACT, sans redéploiement de DSIHub.
 *
 * Contrat : GET {INTERACTIVRY_API_URL}/api/formats
 *   → { success, data: { format, version, updatedAt, groups[], types[] } }
 *
 * Chaque type expose une `family` (contrat de rendu stable). DSIHub ne
 * connaît que les familles qu'il sait afficher ; les autres sont listées
 * comme « mise à jour de DSIHub requise » au lieu d'être silencieusement
 * absentes.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function readRootEnv(key) {
    if (process.env[key]) return process.env[key];
    try {
        const envPath = path.join(__dirname, '..', '..', '..', '.env');
        const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.trim().startsWith(`${key}=`));
        if (line) return line.split('=').slice(1).join('=').trim();
    } catch { /* pas de .env */ }
    return '';
}

function baseUrl() {
    return String(readRootEnv('INTERACTIVRY_API_URL') || '').replace(/\/+$/, '');
}

// Familles Interact'Ivry → types de sondage natifs DSIHub.
// Ajouter une famille ici = nouveau format immédiatement utilisable dans
// les réunions (si son rendu natif existe bien côté interface).
const FAMILY_TO_POLL_TYPE = {
    single_choice: 'single',
    multiple_choice: 'multiple',
    boolean: 'truefalse',
    scale: 'stars',
    slider: 'slider',
    text: 'open',
    wordcloud: 'wordcloud',
    idea: 'idea',
    ordering: 'ordering',
};

/** Types de sondage DSIHub acceptés par `createPoll` (contrat stable). */
const SUPPORTED_POLL_TYPES = Array.from(new Set(Object.values(FAMILY_TO_POLL_TYPE)));

/** Repli local : DSIHub reste utilisable si Interact'Ivry est injoignable. */
const FALLBACK_TYPES = [
    { id: 'single', label: 'Choix unique', icon: '🎯', group: 'choix', family: 'single_choice', hasOptions: true, canScore: true },
    { id: 'multiple', label: 'Choix multiples', icon: '☑️', group: 'choix', family: 'multiple_choice', hasOptions: true, canScore: true },
    { id: 'true_false', label: 'Vrai ou Faux', icon: '✅', group: 'choix', family: 'boolean', hasOptions: true, canScore: true },
    { id: 'ordering', label: 'Puzzle / classement', icon: '🧩', group: 'choix', family: 'ordering', hasOptions: true, canScore: true },
    { id: 'slider', label: 'Curseur (estimation)', icon: '🎚️', group: 'choix', family: 'slider', hasOptions: false, canScore: true },
    { id: 'scale', label: 'Échelle d’avis (étoiles)', icon: '⭐', group: 'libre', family: 'scale', hasOptions: false, canScore: false },
    { id: 'text', label: 'Réponse ouverte', icon: '💬', group: 'libre', family: 'text', hasOptions: false, canScore: false },
    { id: 'wordcloud', label: 'Nuage de mots', icon: '☁️', group: 'libre', family: 'wordcloud', hasOptions: false, canScore: false },
    { id: 'idea', label: 'Boîte à idées', icon: '💡', group: 'libre', family: 'idea', hasOptions: false, canScore: false },
];

const FALLBACK_GROUPS = [
    { id: 'choix', label: '🎲 Quiz & connaissances' },
    { id: 'libre', label: '✍️ Contributions libres & avis' },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

function normalizeTypes(types) {
    return (Array.isArray(types) ? types : []).map((t) => {
        const family = String(t.family || '');
        const pollType = FAMILY_TO_POLL_TYPE[family] || null;
        return {
            id: String(t.id || ''),
            label: String(t.label || t.id || ''),
            icon: String(t.icon || '•'),
            group: String(t.group || 'choix'),
            family,
            note: String(t.note || ''),
            hasOptions: !!t.hasOptions,
            canScore: !!t.canScore,
            defaultTime: Number(t.defaultTime) || 0,
            defaultPoints: Number(t.defaultPoints) || 0,
            supported: !!pollType,
            pollType,
        };
    }).filter((t) => t.id);
}

function normalizeCatalog(catalog, source) {
    const types = normalizeTypes(catalog?.types);
    const knownGroups = new Set((catalog?.groups || []).map((g) => String(g.id)));
    for (const t of types) if (!knownGroups.has(t.group)) knownGroups.add(t.group);
    const groups = (Array.isArray(catalog?.groups) ? catalog.groups : [])
        .map((g) => ({ id: String(g.id), label: String(g.label || g.id) }));
    for (const id of knownGroups) {
        if (!groups.some((g) => g.id === id)) groups.push({ id, label: id });
    }
    return {
        format: String(catalog?.format || 'interactivry.interaction-catalog'),
        version: Number(catalog?.version) || 0,
        updatedAt: catalog?.updatedAt || null,
        source,
        groups,
        types,
    };
}

function fallbackCatalog(reason) {
    return {
        ...normalizeCatalog({ groups: FALLBACK_GROUPS, types: FALLBACK_TYPES }, 'fallback'),
        error: reason || null,
    };
}

/**
 * Catalogue courant (cache 5 min). En cas d'échec réseau, on ressert le
 * dernier catalogue connu ; sinon le repli local.
 */
async function getCatalog({ force = false } = {}) {
    if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) {
        return cache.data;
    }
    const base = baseUrl();
    if (!base) return cache.data || fallbackCatalog('INTERACTIVRY_API_URL non configuré');
    try {
        const res = await axios.get(`${base}/api/formats`, { timeout: 3000 });
        const payload = res.data?.data;
        if (!payload || !Array.isArray(payload.types)) {
            throw new Error('Réponse Interact\'Ivry invalide (catalogue)');
        }
        const result = normalizeCatalog(payload, "Interact'Ivry");
        cache = { at: Date.now(), data: result };
        return result;
    } catch (e) {
        if (cache.data) return { ...cache.data, stale: true };
        return fallbackCatalog(e.response?.data?.error || e.message);
    }
}

/** Vrai si le type de sondage est natif DSIHub (contrat de `createPoll`). */
function isSupportedPollType(type) {
    return SUPPORTED_POLL_TYPES.includes(String(type || ''));
}

module.exports = {
    getCatalog,
    isSupportedPollType,
    SUPPORTED_POLL_TYPES,
    FAMILY_TO_POLL_TYPE,
};
