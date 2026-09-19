/**
 * Client RH Studio (lecture) — source de vérité des agents de la collectivité.
 *
 * Configuration : hub.infra_apis (clé 'rh_studio_presence', repli sur
 * 'rh_studio_onboarding'). Endpoints disponibles avec la clé API :
 *   - GET {base_url}/agents/presence?email=|q=|nom=&prenom=  → un agent
 *   - GET {base_url}/agents/search?q=                        → ≤10 agents
 *
 * Ne remplace pas les fonctions d'écriture/synchro RH Studio (réservées à sa
 * session admin) : AppDSI consomme uniquement en lecture.
 */
const { pgDb } = require('./database');

async function getConfig() {
    try {
        let cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['rh_studio_presence']);
        if (!cfg || !cfg.base_url || !cfg.api_key || cfg.enabled === false) {
            cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['rh_studio_onboarding']);
        }
        if (!cfg || !cfg.base_url || !cfg.api_key || cfg.enabled === false) return null;
        return cfg;
    } catch (e) {
        return null;
    }
}

function baseUrl(cfg) {
    return (cfg.base_url || '').replace(/\/+$/, '');
}

async function fetchJson(cfg, path, timeoutMs = 8000) {
    const headerName = cfg.header_name || 'x-api-key';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const resp = await fetch(`${baseUrl(cfg)}${path}`, {
            headers: { [headerName]: cfg.api_key, Accept: 'application/json' },
            signal: ctrl.signal,
        });
        if (!resp.ok) return null;
        return await resp.json().catch(() => null);
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Agent RH Studio correspondant à un email (ou null). Champs : nom, prenom,
 *  email, matricule, service, direction, fonction, present, status… */
async function findAgentByEmail(email) {
    const e = String(email || '').trim();
    if (!e) return null;
    const cfg = await getConfig();
    if (!cfg) return null;
    const data = await fetchJson(cfg, `/agents/presence?email=${encodeURIComponent(e)}`);
    return data && data.found && data.agent ? data.agent : null;
}

/** Recherche multi-résultats (nom/prénom/matricule). Renvoie un tableau brut. */
async function searchAgents(q) {
    const query = String(q || '').trim();
    if (query.length < 2) return [];
    const cfg = await getConfig();
    if (!cfg) return [];
    const data = await fetchJson(cfg, `/agents/search?q=${encodeURIComponent(query)}`);
    return Array.isArray(data && data.data) ? data.data : [];
}

/** Email AD interne d'un agent à partir de son identifiant (username). */
function emailFromUsername(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return '';
    return u.includes('@') ? u : `${u}@ivry94.fr`;
}

module.exports = { getConfig, findAgentByEmail, searchAgents, emailFromUsername };
