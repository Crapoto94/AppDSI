// ── Parc informatique — Active Directory en DIRECT ────────────────────────────
// Énumération LDAP des objets « computer » à la demande, sans passer par la copie
// locale hub_parc.ad_computers. Cache mémoire très court (60 s) pour éviter de
// marteler le contrôleur de domaine quand l'utilisateur enchaîne les filtres ;
// `refresh = true` force une nouvelle énumération.
//
// Partagé par :
//  - parc.ad.controller.js  → onglet AD en mode Live (stats / liste / par OS) ;
//  - parc.live.controller.js → enrichissement « dernier contact AD » du parc GLPI.
const { getSqlite } = require('../../shared/database');
const { searchADComputers } = require('../../shared/ad_helper');

const LIVE_AD_TTL_MS = 60 * 1000;
let _cache = { rows: null, ts: 0 };
let _inflight = null;

async function getADConfig() {
  const db = getSqlite();
  if (!db) return null;
  return db.get('SELECT * FROM ad_settings WHERE id = 1');
}

async function getLiveADComputers({ refresh = false } = {}) {
  if (!refresh && _cache.rows && Date.now() - _cache.ts < LIVE_AD_TTL_MS) {
    return { rows: _cache.rows, fetchedAt: _cache.ts, cached: true };
  }
  // Une énumération est déjà en cours (rafraîchissement manuel + stats/liste
  // demandés en parallèle) : on la partage au lieu de lancer deux scans LDAP.
  if (_inflight) {
    const rows = await _inflight;
    return { rows, fetchedAt: _cache.ts || Date.now(), cached: true };
  }
  const cfg = await getADConfig();
  if (!cfg || !cfg.host) {
    const e = new Error('Active Directory non configuré (ad_settings).');
    e.status = 503;
    throw e;
  }
  _inflight = searchADComputers(cfg);
  try {
    const rows = await _inflight;
    _cache = { rows, ts: Date.now() };
    return { rows, fetchedAt: _cache.ts, cached: false };
  } finally {
    _inflight = null;
  }
}

function invalidateLiveAD() {
  _cache = { rows: null, ts: 0 };
}

module.exports = { getLiveADComputers, invalidateLiveAD, LIVE_AD_TTL_MS };
