/**
 * Client de l'API externe "Analyse-mail" (tableau de bord de compromission de
 * boîtes mail). Cette application expose une API en lecture seule protégée par
 * une clé d'API (en-tête `X-API-Key`) — voir son endpoint `GET /api/v1/kpis`.
 *
 * Config : hub.infra_apis WHERE key='analyse_mail'
 *   base_url    : racine de l'app Analyse-mail (ex: https://analyse-mail.ivry.local)
 *   endpoint    : /api/v1/kpis (valeur par défaut si vide)
 *   api_key     : clé d'API générée dans Analyse-mail (/admin/api-keys)
 *   header_name : X-API-Key
 * Renseignable via /admin/infra (page « API externes »).
 */
const { pgDb } = require('./database');

async function getConfig() {
    const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['analyse_mail']);
    if (!cfg || !cfg.base_url) throw new Error('API Analyse-mail non configurée — renseigner base_url/api_key via /admin/infra');
    if (cfg.enabled === false) throw new Error("L'API Analyse-mail est désactivée — l'activer via /admin/infra");
    if (!cfg.api_key) throw new Error('Clé API Analyse-mail manquante — à renseigner via /admin/infra');
    return cfg;
}

function buildUrl(cfg) {
    const base = (cfg.base_url || '').replace(/\/+$/, '');
    const endpoint = cfg.endpoint || '/api/v1/kpis';
    return `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

/**
 * Récupère les KPI du tableau de bord Analyse-mail (mêmes chiffres que sa page
 * d'accueil : incidents, surveillance, connexions 24h, et les points
 * géographiques `connections_geo_world` / `connections_geo_home` utilisés par
 * les cartes).
 * @param {number} timeoutMs
 */
async function getKpis(timeoutMs = 30000) {
    const cfg = await getConfig();
    const headerName = cfg.header_name || 'X-API-Key';
    const url = buildUrl(cfg);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            headers: { [headerName]: cfg.api_key, Accept: 'application/json' },
            signal: ctrl.signal,
        });
        const text = await resp.text().catch(() => '');
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} depuis Analyse-mail${text ? ' — ' + text.slice(0, 300) : ''}`);
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error('Réponse Analyse-mail non JSON');
        }
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { getConfig, getKpis };
