/**
 * Client pour l'API IA Ville (APM) — utilisée à la fois par le Transcript
 * Manager (résumés de réunion) et la reformulation de tickets, chacun avec
 * son propre réglage de source IA (apm/local) et son propre modèle par
 * défaut (cf. transcript_apm_default_model / ticket_reformulate_apm_model
 * dans app_settings, /admin section IA).
 *
 * Config : hub.infra_apis WHERE key='apm_ai' (label, base_url, endpoint,
 * api_key, header_name, enabled) — éditable via /admin/infra.
 *   POST {base_url}{endpoint}/query           { prompt, model? }  -> réponse IA
 *   GET  {base_url}{endpoint}/models                                -> modèles actifs
 *   POST {base_url}{endpoint}/query-async     { prompt, model? }  -> { queryId }
 *   GET  {base_url}{endpoint}/query-progress/{queryId}              -> progression en temps réel
 *        (tokensReceived pendant status='running' ; status='completed' -> response ; 'error' -> error)
 */
const { pgDb } = require('./database');

async function getConfig() {
    const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['apm_ai']);
    if (!cfg) throw new Error("Configuration de l'API IA (APM) introuvable — la créer via /admin/infra");
    if (cfg.enabled === false) throw new Error("L'API IA (APM) est désactivée — l'activer via /admin/infra");
    if (!cfg.base_url) throw new Error("URL de base manquante pour l'API IA (APM) — à renseigner via /admin/infra");
    if (!cfg.api_key) throw new Error("Clé API manquante pour l'API IA (APM) — à renseigner via /admin/infra");
    return cfg;
}

function buildUrl(cfg, suffix) {
    const base = (cfg.base_url || '').replace(/\/+$/, '');
    const endpoint = (cfg.endpoint || '/api/v1/ai').replace(/\/+$/, '');
    return `${base}${endpoint}${suffix}`;
}

/**
 * Le fetch() natif de Node (undici) lève un `TypeError: fetch failed` générique pour toute
 * erreur réseau bas niveau (connexion refusée, DNS introuvable, certificat invalide,
 * timeout...) — la vraie cause est dans `error.cause`, jamais dans `error.message`. On la
 * ressort explicitement pour ne pas afficher "fetch failed" tel quel à l'utilisateur.
 */
function describeFetchError(error) {
    if (error?.name === 'AbortError') return 'délai dépassé';
    const cause = error?.cause;
    if (cause) {
        const code = cause.code || cause.errno;
        const detail = cause.message || String(cause);
        return code ? `${detail} (${code})` : detail;
    }
    return error?.message || String(error);
}

/** Exécute fetch(url, options) en remplaçant une erreur réseau bas niveau (TypeError
 * "fetch failed") par un message exploitable — laisse passer toute autre erreur telle quelle. */
async function safeFetch(url, options) {
    try {
        return await fetch(url, options);
    } catch (error) {
        throw new Error(`Impossible de contacter l'API IA (APM) (${url}) — ${describeFetchError(error)}`);
    }
}

/**
 * GET .../models — renvoie la liste des modèles actifs, normalisée en
 * tableau de chaînes (l'API peut répondre un tableau brut, {models:[...]}
 * ou {data:[...]}, avec des entrées string ou {name|id|label}).
 */
async function listModels() {
    const cfg = await getConfig();
    const url = buildUrl(cfg, '/models');
    const headerName = cfg.header_name || 'X-API-KEY';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
        const resp = await safeFetch(url, {
            headers: { [headerName]: cfg.api_key, Accept: 'application/json' },
            signal: ctrl.signal,
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} depuis l'API IA (APM)${text ? ' — ' + text.slice(0, 300) : ''}`);
        }
        const data = await resp.json();
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.models) ? data.models : (Array.isArray(data?.data) ? data.data : []));
        // L'APM renvoie ICI tous les modèles (actifs et désactivés, avec un flag actif/inactif
        // par modèle) — son admin en a besoin pour tout gérer, y compris désactivé. Filtrer aux
        // seuls actifs est notre responsabilité ; sans ce filtre, un modèle désactivé côté APM
        // (ex. un modèle retiré du service) continuait à apparaître dans les sélecteurs de
        // modèle de l'app (Transcript Manager, analyse de contrats...). Une entrée sans champ
        // actif/is_active (chaîne brute, ou forme de réponse minimale) reste incluse par défaut.
        const activeOnly = raw.filter(m => {
            if (typeof m !== 'object' || m === null) return true;
            const flag = m.active !== undefined ? m.active : m.is_active;
            return flag !== false;
        });
        return activeOnly.map(m => (typeof m === 'string' ? m : (m?.name || m?.id || m?.label || String(m)))).filter(Boolean);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * POST .../query { prompt, model? } — renvoie le texte de la réponse IA.
 * La forme exacte du JSON de retour n'étant pas garantie, on essaie les clés
 * usuelles avant de retomber sur le corps brut.
 */
async function queryAi(prompt, model) {
    const cfg = await getConfig();
    const url = buildUrl(cfg, '/query');
    const headerName = cfg.header_name || 'X-API-KEY';
    const ctrl = new AbortController();
    // APM (query_timeout_ms, /admin de l'APM) borne sa propre attente à 20 min max —
    // on reste volontairement au-dessus (25 min) pour ne jamais couper nous-mêmes
    // avant que l'APM n'ait eu la chance de répondre ou d'échouer proprement.
    // NB : un HTTP 504 reçu ici (page d'erreur "openresty") ne vient PAS de ce délai
    // (un abort produit une AbortError, pas une vraie réponse HTTP) — c'est le
    // reverse-proxy externe devant l'APM qui a coupé la connexion avant l'APM
    // lui-même ; son propre timeout (indépendant de query_timeout_ms) doit être
    // relevé côté infra (ex. Nginx Proxy Manager : proxy_read_timeout/proxy_send_timeout).
    const timer = setTimeout(() => ctrl.abort(), 1500000);
    try {
        const resp = await safeFetch(url, {
            method: 'POST',
            headers: { [headerName]: cfg.api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify(model ? { prompt, model } : { prompt }),
            signal: ctrl.signal,
        });
        const rawText = await resp.text();
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} depuis l'API IA (APM)${rawText ? ' — ' + rawText.slice(0, 300) : ''}`);
        }
        let data;
        try { data = JSON.parse(rawText); } catch { return rawText; }
        if (typeof data === 'string') return data;
        return data?.response ?? data?.result ?? data?.answer ?? data?.text ?? data?.content ?? data?.message ?? rawText;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * POST .../query-async { prompt, model? } — démarre la génération côté APM et renvoie
 * immédiatement un queryId, à suivre via getQueryProgress. Contrairement à queryAi() (qui
 * attend la réponse complète en une seule requête HTTP potentiellement très longue),
 * cet appel-ci est court : c'est le polling de getQueryProgress qui suit la génération.
 */
async function queryAiAsync(prompt, model) {
    const cfg = await getConfig();
    const url = buildUrl(cfg, '/query-async');
    const headerName = cfg.header_name || 'X-API-KEY';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
        const resp = await safeFetch(url, {
            method: 'POST',
            headers: { [headerName]: cfg.api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify(model ? { prompt, model } : { prompt }),
            signal: ctrl.signal,
        });
        const rawText = await resp.text();
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} depuis l'API IA (APM)${rawText ? ' — ' + rawText.slice(0, 300) : ''}`);
        }
        let data;
        try { data = JSON.parse(rawText); } catch { throw new Error("Réponse invalide de l'API IA (APM) lors du démarrage de la requête asynchrone"); }
        if (!data?.queryId) {
            throw new Error("L'API IA (APM) n'a pas renvoyé de queryId — endpoint /query-async peut-être indisponible sur cette version de l'APM");
        }
        return data.queryId;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * GET .../query-progress/{queryId} — état courant d'une génération démarrée via
 * queryAiAsync : { status: 'running'|'completed'|'error', tokensReceived, charsReceived,
 * response? (si completed), error? (si error) }.
 */
async function getQueryProgress(queryId) {
    const cfg = await getConfig();
    const url = buildUrl(cfg, `/query-progress/${encodeURIComponent(queryId)}`);
    const headerName = cfg.header_name || 'X-API-KEY';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
        const resp = await safeFetch(url, {
            headers: { [headerName]: cfg.api_key, Accept: 'application/json' },
            signal: ctrl.signal,
        });
        const rawText = await resp.text();
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} depuis l'API IA (APM)${rawText ? ' — ' + rawText.slice(0, 300) : ''}`);
        }
        try { return JSON.parse(rawText); } catch { throw new Error("Réponse invalide de l'API IA (APM) pour la progression"); }
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Interroge l'API Ville en asynchrone (queryAiAsync + polling de getQueryProgress) plutôt qu'en
 * un seul appel bloquant (queryAi) — remonte en direct dans `job` (optionnel) le nombre de
 * tokens/caractères reçus et le texte partiel pendant que l'IA génère sa réponse, pour qu'un
 * endpoint de statut déjà pollé par le front (ex. GET /jobs/:jobId, /summarize-status/:jobId)
 * puisse afficher une progression en temps réel plutôt qu'un seul état "en cours" statique.
 * Partagé par l'analyse de contrats et la génération de résumé du Transcript Manager — mêmes
 * deux appelants, mêmes deux besoins, d'où la factorisation ici plutôt que la duplication.
 */
async function queryApmWithProgress(prompt, model, job) {
    const queryId = await queryAiAsync(prompt, model);
    const POLL_MS = 1500;
    const MAX_WAIT_MS = 20 * 60 * 1000; // même borne que l'appel synchrone (query_timeout_ms max côté APM)
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
        const progress = await getQueryProgress(queryId);
        if (job) {
            job.tokensReceived = progress.tokensReceived || 0;
            job.charsReceived = progress.charsReceived || 0;
            // Texte partiel de la réponse IA, mis à jour en direct pendant la génération
            // (status='running') — permet au front d'afficher le résultat au fil de l'eau
            // plutôt qu'attendre la fin.
            if (progress.status === 'running' && progress.response) job.partialText = progress.response;
            job.aiProvider = progress.provider_label || null;
            job.aiModel = progress.model || null;
        }
        if (progress.status === 'completed') return progress.response;
        if (progress.status === 'error') throw new Error(progress.error || "Erreur lors de l'interrogation de l'IA");
        if (Date.now() - start > MAX_WAIT_MS) {
            throw new Error("Toujours aucune réponse de l'IA après un long délai — la génération a probablement échoué.");
        }
    }
}

module.exports = { getConfig, listModels, queryAi, queryAiAsync, getQueryProgress, queryApmWithProgress };
