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

function buildUrl(cfg, minutes) {
    const base = (cfg.base_url || '').replace(/\/+$/, '');
    const endpoint = cfg.endpoint || '/api/v1/kpis';
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    if (minutes !== undefined && minutes !== null && minutes !== '') {
        return `${url}${url.includes('?') ? '&' : '?'}minutes=${encodeURIComponent(minutes)}`;
    }
    return url;
}

function qs(params) {
    const parts = [];
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') parts.push(`${k}=${encodeURIComponent(v)}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
}

async function fetchJson(cfg, url, timeoutMs) {
    const headerName = cfg.header_name || 'X-API-Key';
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

async function postJson(cfg, url, body, timeoutMs) {
    const headerName = cfg.header_name || 'X-API-Key';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { [headerName]: cfg.api_key, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            signal: ctrl.signal,
        });
        const text = await resp.text().catch(() => '');
        if (!resp.ok) {
            let msg = `HTTP ${resp.status} depuis Analyse-mail`;
            try { const j = JSON.parse(text); if (j && j.error) msg += ` — ${j.error}`; }
            catch { if (text) msg += ' — ' + text.slice(0, 300); }
            throw new Error(msg);
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

/**
 * Déclenche un scan à la demande d'une boîte mail (endpoint amont POST /api/v1/scan)
 * et attend son résultat (score, verdict, signaux détectés). Le scan tourne en tâche
 * de fond côté Analyse-mail : on interroge son job jusqu'à complétion (ou expiration).
 * @param {object} opts
 * @param {string} opts.email  adresse de la boîte à analyser
 * @param {number|string} [opts.days]  profondeur d'analyse en jours (1-90, défaut 7)
 * @param {number} [opts.timeoutMs]  délai max d'attente du scan (défaut 180 s)
 */
async function scanMailbox({ email, days = 7, timeoutMs = 180000, pollIntervalMs = 1500 } = {}) {
    if (!email || !String(email).includes('@')) throw new Error('Adresse email invalide pour le scan');
    const cfg = await getConfig();
    const base = (cfg.base_url || '').replace(/\/+$/, '');
    const { job_id } = await postJson(cfg, `${base}/api/v1/scan`, { email, days }, 30000);
    if (!job_id) throw new Error("Analyse-mail n'a pas renvoyé de job_id");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        const job = await fetchJson(cfg, `${base}/api/v1/jobs/${encodeURIComponent(job_id)}`, 30000);
        if (job.status === 'error') throw new Error(job.error || 'Échec du scan Analyse-mail');
        if (job.status === 'done') {
            if (!job.result) throw new Error('Scan Analyse-mail terminé sans résultat');
            return job.result;
        }
    }
    throw new Error('Délai dépassé : le scan Analyse-mail est trop long (relancez)');
}

/**
 * Récupère les KPI du tableau de bord Analyse-mail (mêmes chiffres que sa page
 * d'accueil : incidents, surveillance, connexions, et les points
 * géographiques `connections_geo_world` / `connections_geo_home` utilisés par
 * les cartes).
 * @param {object} [opts]
 * @param {number|string} [opts.minutes] fenêtre glissante des statistiques de
 *   connexions, en minutes (1, 10, 60, 240, 480, 1440, 2880, 10080). Omis =
 *   fenêtre par défaut de l'API amont (24h).
 * @param {number} [opts.timeoutMs]
 */
async function getKpis(opts = {}) {
    const { minutes = null, timeoutMs = 30000 } = opts;
    const cfg = await getConfig();
    return fetchJson(cfg, buildUrl(cfg, minutes), timeoutMs);
}

/**
 * Récupère les dernières connexions en échec du tenant (endpoint amont
 * `GET /api/v1/signins/failed`), avec le détail complet : utilisateur, IP,
 * localisation, application, code/raison d'échec, résultat MFA, réputation IP.
 * @param {object} [opts]
 * @param {number|string} [opts.minutes] fenêtre glissante, en minutes (même liste blanche).
 * @param {number|string} [opts.limit] nombre maximum de lignes.
 * @param {number} [opts.timeoutMs]
 */
async function getFailedSignins(opts = {}) {
    const { minutes = null, limit = 50, timeoutMs = 30000 } = opts;
    const cfg = await getConfig();
    const base = (cfg.base_url || '').replace(/\/+$/, '');
    const url = `${base}/api/v1/signins/failed${qs({ minutes, limit })}`;
    return fetchJson(cfg, url, timeoutMs);
}

module.exports = { getConfig, getKpis, getFailedSignins, scanMailbox };
