/**
 * Client de l'API Sedit Finances (projet API-Nova, port 3420).
 *
 * Lecture seule. La clé et l'URL sont stockées dans SQLite `app_settings`
 * (paramétrage /admin/databases > API Sedit) avec repli sur les variables
 * d'environnement SEDITGF_API_URL / SEDITGF_API_KEY.
 */
const axios = require('axios');
const { getSqlite } = require('../../shared/database');

const DEFAULT_URL = process.env.SEDITGF_API_URL || 'http://10.103.130.106:3420';
const DEFAULT_KEY = process.env.SEDITGF_API_KEY || '';
const DEFAULT_TIMEOUT_MS = 30000;
const PAGE_SIZE = 500;

const SETTING_URL = 'finance.sedit_api_url';
const SETTING_KEY = 'finance.sedit_api_key';
const SETTING_TIMEOUT = 'finance.sedit_api_timeout_ms';

function normalizeUrl(raw) {
    let url = String(raw || '').trim().replace(/\/+$/, '');
    if (!url) url = DEFAULT_URL;
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    return url.replace(/\/api\/v1$/i, '');
}

async function readSetting(db, key) {
    try {
        const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        return row?.setting_value != null ? String(row.setting_value) : '';
    } catch {
        return '';
    }
}

async function getConfig() {
    let url = DEFAULT_URL;
    let key = DEFAULT_KEY;
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    const db = getSqlite();
    if (db) {
        const [u, k, t] = await Promise.all([
            readSetting(db, SETTING_URL), readSetting(db, SETTING_KEY), readSetting(db, SETTING_TIMEOUT),
        ]);
        if (u) url = u;
        if (k) key = k;
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n >= 1000 && n <= 120000) timeoutMs = n;
    }
    return { url: normalizeUrl(url), key: String(key || '').trim(), timeoutMs };
}

async function request(path, params = {}, opts = {}) {
    const cfg = await getConfig();
    if (!cfg.key) throw new Error('Clé API Sedit Finances non configurée (Paramétrage > API Sedit).');
    const url = `${cfg.url}/api/v1${path.startsWith('/') ? path : '/' + path}`;
    const actor = opts.actor || {};
    const headers = { Authorization: `Bearer ${cfg.key}` };
    if (opts.clientApp) headers['X-Client-App'] = String(opts.clientApp);
    if (actor.username) headers['X-User-Username'] = String(actor.username);
    if (actor.email) headers['X-User-Email'] = String(actor.email);
    if (actor.displayName || actor.name) headers['X-User-Name'] = String(actor.displayName || actor.name);
    const r = await axios.get(url, {
        params,
        headers,
        timeout: opts.timeoutMs || cfg.timeoutMs,
        validateStatus: () => true,
    });
    if (r.status >= 400) {
        const d = r.data || {};
        const msg = d.detail || d.title || d.message || `HTTP ${r.status}`;
        throw new Error(`API Sedit ${r.status} : ${msg}`);
    }
    return r.data;
}

async function listAll(path, params = {}, opts = {}) {
    let offset = 0;
    const rows = [];
    const maxPages = opts.maxPages || 100;
    for (let page = 0; page < maxPages; page++) {
        const data = await request(path, { ...params, limit: PAGE_SIZE, offset }, opts);
        const batch = Array.isArray(data?.data) ? data.data : [];
        rows.push(...batch);
        if (!data?.meta?.has_more) return rows;
        offset = Number(data.meta.next_offset);
        if (!Number.isFinite(offset)) return rows;
    }
    throw new Error('API Sedit : trop de pages à parcourir.');
}

async function moi() { return request('/moi'); }

async function factures(year, { budget, actor, clientApp } = {}) {
    const opts = { actor, clientApp };
    const y = Number(year);
    const params = { service: 'BF*' };
    if (budget) params.budget = budget;
    // L'API filtre sur l'année d'entrée. AppDSI retient aussi les factures dont
    // l'échéance tombe dans l'exercice : on lit donc l'année et la précédente,
    // puis on filtre comme la lecture directe.
    const all = [];
    for (const yy of [y, y - 1]) all.push(...await listAll('/factures', { ...params, exercice: yy }, opts));
    const uniq = new Map(all.map(r => [String(r.id || r.numero), r]));
    return [...uniq.values()].filter(r => {
        const de = String(r.date_entree || '').slice(0, 4);
        const dp = String(r.date_paiement_prevue || '').slice(0, 4);
        return de === String(y) || dp === String(y);
    });
}

async function commandes(year, { budget, actor, clientApp } = {}) {
    const opts = { actor, clientApp };
    const params = { exercice: Number(year), service: 'BF*' };
    if (budget) params.budget = budget;
    return listAll('/commandes', params, opts);
}

async function engagements(year, { budget, actor, clientApp } = {}) {
    const opts = { actor, clientApp };
    const params = { exercice: Number(year), service: 'BF*' };
    if (budget) params.budget = budget;
    const rows = await listAll('/engagements', params, opts);
    // L'API joint les lignes de commande/facture : une même ligne d'engagement
    // peut revenir plusieurs fois. On déduplique par identifiant technique.
    return [...new Map(rows.map(r => [String(r.id), r])).values()];
}

async function lignesBudgetaires(year, { budget, service = 'BF*', sens = 'D', actor, clientApp } = {}) {
    const opts = { actor, clientApp };
    const params = { exercice: Number(year) };
    if (service) params.service = service;
    if (sens) params.sens = sens;
    if (budget) params.budget = budget;
    return listAll('/lignes-budgetaires', params, opts);
}

async function droits({ email, username, code } = {}, opts = {}) {
    const data = await request('/utilisateurs/droits', { email, username, code }, opts);
    return data?.data || { user: null, services: [] };
}

async function tiers(params = {}, { actor, clientApp } = {}) { return listAll('/tiers', params, { actor, clientApp }); }

module.exports = {
    getConfig, normalizeUrl, request, listAll, moi, droits,
    factures, commandes, engagements, lignesBudgetaires, tiers,
    SETTING_URL, SETTING_KEY, SETTING_TIMEOUT,
};
