/**
 * Client pour l'API IA Ville (APM) — utilisée à la fois par le Transcript
 * Manager (résumés de réunion) et la reformulation de tickets, chacun avec
 * son propre réglage de source IA (apm/local) et son propre modèle par
 * défaut (cf. transcript_apm_default_model / ticket_reformulate_apm_model
 * dans app_settings, /admin section IA).
 *
 * Config : hub.infra_apis WHERE key='apm_ai' (label, base_url, endpoint,
 * api_key, header_name, enabled) — éditable via /admin/infra.
 *   POST {base_url}{endpoint}/query   { prompt, model? }  -> réponse IA
 *   GET  {base_url}{endpoint}/models                       -> modèles actifs
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
        const resp = await fetch(url, {
            headers: { [headerName]: cfg.api_key, Accept: 'application/json' },
            signal: ctrl.signal,
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} depuis l'API IA (APM)${text ? ' — ' + text.slice(0, 300) : ''}`);
        }
        const data = await resp.json();
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.models) ? data.models : (Array.isArray(data?.data) ? data.data : []));
        return raw.map(m => (typeof m === 'string' ? m : (m?.name || m?.id || m?.label || String(m)))).filter(Boolean);
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
        const resp = await fetch(url, {
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

module.exports = { getConfig, listModels, queryAi };
