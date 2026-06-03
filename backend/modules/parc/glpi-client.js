// ── Client apirest GLPI 10 (LIVE) ──────────────────────────────────────────────
// Interrogation directe de l'API GLPI 10 (apirest.php) sans aucune persistance.
// Authentification : App-Token + User-Token (cf. glpi10_settings).
//
// Session PARTAGÉE et maintenue ouverte : une seule session apirest est ouverte
// puis réutilisée pour toutes les requêtes (évite l'erreur « Session expirée ou
// invalide » causée par l'ouverture/fermeture en rafale, et limite les initSession).
// La session est renouvelée automatiquement après inactivité ou si GLPI la rejette.
// Un cache mémoire à TTL court évite de marteler GLPI à chaque chargement de page.

const axios = require('axios');
const https = require('https');
const { getSqlite } = require('../../shared/database');

// Types d'équipements exposés par le module parc (clé front → itemtype GLPI + libellé).
const ITEM_TYPES = {
  ordinateurs:   { itemtype: 'Computer',         label: 'Ordinateurs' },
  moniteurs:     { itemtype: 'Monitor',          label: 'Moniteurs' },
  peripheriques: { itemtype: 'Peripheral',       label: 'Périphériques' },
  imprimantes:   { itemtype: 'Printer',          label: 'Imprimantes' },
  reseau:        { itemtype: 'NetworkEquipment', label: 'Équipements réseau' },
  telephones:    { itemtype: 'Phone',            label: 'Téléphones' },
};

function typeByKey(key) {
  return ITEM_TYPES[String(key || '').toLowerCase()] || null;
}

// ── Ouverture d'une session apirest (App-Token + User-Token) ───────────────────
async function openSession() {
  const db = getSqlite();
  const s = await db.get('SELECT url, token, user_token, is_enabled FROM glpi10_settings WHERE id = 1');
  if (!s || !s.url) throw new Error('GLPI 10 non configuré (URL manquante)');
  let base = String(s.url).trim().replace(/\/+$/, '');
  if (!base.includes('apirest.php')) base += '/apirest.php';
  const appToken = String(s.token || '').trim();
  const userToken = String(s.user_token || '').trim();
  if (!appToken) throw new Error('App-Token GLPI 10 manquant');
  if (!userToken) throw new Error('User-Token GLPI 10 manquant — renseignez-le dans la config GLPI 10');
  const agent = new https.Agent({ rejectUnauthorized: false });
  const r = await axios.get(`${base}/initSession`, {
    headers: { 'App-Token': appToken, 'Authorization': `user_token ${userToken}` },
    httpsAgent: agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data || !r.data.session_token) {
    const detail = Array.isArray(r.data) ? r.data.join(' — ') : (r.data?.message || JSON.stringify(r.data));
    throw new Error(`Connexion GLPI 10 échouée (HTTP ${r.status}) : ${detail}`);
  }
  return { base, appToken, sessionToken: r.data.session_token, agent, ts: Date.now() };
}

async function closeSession(sess) {
  if (!sess) return;
  try {
    await axios.get(`${sess.base}/killSession`, {
      headers: { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken },
      httpsAgent: sess.agent, timeout: 5000,
    });
  } catch (e) { /* ignore */ }
}

// ── Session partagée maintenue ouverte ─────────────────────────────────────────
const SESSION_MAX_MS = 10 * 60 * 1000; // renouvelle la session après 10 min
let _shared = null;     // session courante { base, appToken, sessionToken, agent, ts }
let _initPromise = null; // verrou : une seule initSession concurrente

async function getSharedSession(force = false) {
  const now = Date.now();
  if (!force && _shared && (now - _shared.ts) < SESSION_MAX_MS) return _shared;
  if (_initPromise) return _initPromise; // une init est déjà en cours → on l'attend
  _initPromise = (async () => {
    const previous = _shared;
    const s = await openSession();
    _shared = s;
    if (previous) closeSession(previous).catch(() => {}); // ferme l'ancienne en arrière-plan
    return s;
  })();
  try { return await _initPromise; }
  finally { _initPromise = null; }
}

// GLPI signale une session invalide par un 401 ou un message ERROR_SESSION_*
function isSessionError(status, data) {
  if (status === 401) return true;
  if (status < 400) return false;
  const txt = Array.isArray(data) ? data.join(' ') : (typeof data === 'string' ? data : JSON.stringify(data || ''));
  return /SESSION_TOKEN_INVALID|ERROR_SESSION|session.*(expir|invalid)/i.test(txt);
}

// Exécute fn(sess) avec la session partagée ; réessaie une fois si GLPI rejette la session.
async function withSession(fn) {
  let sess = await getSharedSession();
  try {
    return await fn(sess);
  } catch (e) {
    if (e && e.__sessionExpired) {
      sess = await getSharedSession(true); // force une nouvelle session
      return await fn(sess);
    }
    throw e;
  }
}

function expired() { const e = new Error('Session GLPI expirée'); e.__sessionExpired = true; return e; }

function headersFor(sess) {
  return { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken };
}

// ── Récupère tous les items d'un type (pagination via Content-Range) ───────────
async function fetchAll(sess, itemtype, { expand = true } = {}) {
  const items = [];
  const step = 200;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/${itemtype}`, {
      headers: headersFor(sess),
      params: { ...(expand ? { expand_dropdowns: true } : {}), range: `${start}-${start + step - 1}` },
      httpsAgent: sess.agent, timeout: 30000,
      validateStatus: () => true,
    });
    if (isSessionError(r.status, r.data)) throw expired();
    if (r.status === 404) break;
    if (r.status !== 200 && r.status !== 206) {
      const detail = Array.isArray(r.data) ? r.data.join(' — ') : (r.data?.message || `HTTP ${r.status}`);
      throw new Error(`GLPI ${itemtype} : ${detail}`);
    }
    const batch = Array.isArray(r.data) ? r.data : [];
    items.push(...batch);
    const cr = r.headers['content-range']; // "items 0-199/1234"
    if (batch.length < step) break;
    if (cr) { const total = parseInt(cr.split('/')[1], 10); if (!isNaN(total) && start + step >= total) break; }
    start += step;
    if (start > 200000) break; // garde-fou
  }
  return items;
}

// ── Récupère une fiche complète (dropdowns étendus + infocoms) ─────────────────
async function fetchItem(sess, itemtype, id) {
  const r = await axios.get(`${sess.base}/${itemtype}/${id}`, {
    headers: headersFor(sess),
    params: { expand_dropdowns: true, with_devices: true, with_infocoms: true },
    httpsAgent: sess.agent, timeout: 20000, validateStatus: () => true,
  });
  if (isSessionError(r.status, r.data)) throw expired();
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`GLPI ${itemtype}/${id} : HTTP ${r.status}`);
  return r.data;
}

// ── Sous-éléments liés (ports réseau, OS, logiciels, documents…) ──────────────
async function fetchSub(sess, itemtype, id, subtype, { expand = true } = {}) {
  const r = await axios.get(`${sess.base}/${itemtype}/${id}/${subtype}`, {
    headers: headersFor(sess),
    params: expand ? { expand_dropdowns: true } : {},
    httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true,
  });
  if (isSessionError(r.status, r.data)) throw expired();
  return Array.isArray(r.data) ? r.data : [];
}

// ── Téléchargement du binaire d'un document GLPI (via apirest) ─────────────────
async function downloadDocument(id) {
  return withSession(async (sess) => {
    const r = await axios.get(`${sess.base}/Document/${id}`, {
      headers: { ...headersFor(sess), Accept: 'application/octet-stream' },
      httpsAgent: sess.agent, timeout: 30000, responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (isSessionError(r.status, r.data)) throw expired();
    if (r.status !== 200) { const e = new Error(`Document ${id} indisponible (HTTP ${r.status})`); e.status = r.status; throw e; }
    return { data: Buffer.from(r.data), contentType: r.headers['content-type'] || 'application/octet-stream' };
  });
}

// ── Variantes « session partagée » (pour le module live) ───────────────────────
async function getItem(itemtype, id) {
  return withSession((sess) => fetchItem(sess, itemtype, id));
}
async function getSub(itemtype, id, subtype, opts) {
  return withSession((sess) => fetchSub(sess, itemtype, id, subtype, opts)).catch(() => []);
}

// ── Cache mémoire (TTL) par itemtype : { data, ts } ───────────────────────────
const CACHE_TTL_MS = 120000; // 2 min
const _cache = new Map();

// Renvoie la liste complète d'un type, via cache + session partagée.
// expand=false préserve les IDs numériques (notamment items_id) ; ne pas utiliser
// avec les types principaux (Computer, Monitor…) où on veut les labels lisibles.
async function getAll(itemtype, { refresh = false, expand = true } = {}) {
  const now = Date.now();
  const cacheKey = expand ? itemtype : `${itemtype}_raw`;
  const hit = _cache.get(cacheKey);
  if (!refresh && hit && (now - hit.ts) < CACHE_TTL_MS) return hit.data;
  const data = await withSession((sess) => fetchAll(sess, itemtype, { expand }));
  _cache.set(cacheKey, { data, ts: now });
  return data;
}

function cacheInfo(itemtype) {
  const hit = _cache.get(itemtype);
  if (!hit) return { cached: false, age_ms: null };
  return { cached: true, age_ms: Date.now() - hit.ts, ttl_ms: CACHE_TTL_MS };
}

function clearCache() { _cache.clear(); }

// ── Mise à jour d'une fiche GLPI (PUT /{itemtype}/{id}) ───────────────────────
async function updateItem(itemtype, id, input) {
  return withSession(async (sess) => {
    const r = await axios.put(`${sess.base}/${itemtype}/${id}`, { input }, {
      headers: { ...headersFor(sess), 'Content-Type': 'application/json' },
      httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true,
    });
    if (isSessionError(r.status, r.data)) throw expired();
    return { status: r.status, data: r.data, ok: r.status >= 200 && r.status < 300 };
  });
}

module.exports = {
  ITEM_TYPES, typeByKey,
  openSession, closeSession, fetchAll, fetchItem, fetchSub, downloadDocument,
  getItem, getSub, getAll, cacheInfo, clearCache, CACHE_TTL_MS,
  updateItem,
};
