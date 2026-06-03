// ── inject_mise_en_service.js ──────────────────────────────────────────────────
// Script one-shot : pour chaque équipement du parc, récupère la date à laquelle
// son nom a changé dans l'historique GLPI (Log, id_search_option=1) et l'injecte
// dans le champ use_date (Mise en service) de l'Infocom GLPI.
// Toute use_date existante est écrasée. Les équipements sans changement de nom
// dans l'historique sont ignorés (pas de valeur à injecter).
//
// Usage (depuis la racine c:\dev\AppDSI) :
//   node backend/scripts/inject_mise_en_service.js              → test sur 1 équipement
//   node backend/scripts/inject_mise_en_service.js --name=PO25201 → test ciblé
//   node backend/scripts/inject_mise_en_service.js --all         → injection globale

'use strict';

const path  = require('path');
const axios  = require('axios');
const https  = require('https');

const ROOT         = path.join(__dirname, '..');
const setupSqlite  = require(path.join(ROOT, 'shared', 'sqlite_db'));
const { pool }     = require(path.join(ROOT, 'shared', 'pg_db'));

const TEST_MODE  = !process.argv.includes('--all');
const TARGET_NAME = (() => {
  const arg = process.argv.find(a => a.startsWith('--name='));
  return arg ? arg.slice(7).trim() : null;
})();

const CONCURRENCY = 8; // appels GLPI en parallèle

// ── Session GLPI ──────────────────────────────────────────────────────────────
async function openSession(db) {
  const s = await db.get(
    'SELECT url, token, user_token FROM glpi10_settings WHERE id = 1'
  );
  if (!s?.url) throw new Error('GLPI 10 non configuré (URL manquante dans SQLite)');

  let base = String(s.url).trim().replace(/\/+$/, '');
  if (!base.includes('apirest.php')) base += '/apirest.php';
  const appToken  = String(s.token      || '').trim();
  const userToken = String(s.user_token || '').trim();
  if (!appToken)  throw new Error('App-Token GLPI manquant');
  if (!userToken) throw new Error('User-Token GLPI manquant');

  const agent = new https.Agent({ rejectUnauthorized: false });
  const r = await axios.get(`${base}/initSession`, {
    headers: { 'App-Token': appToken, 'Authorization': `user_token ${userToken}` },
    httpsAgent: agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data?.session_token) {
    const detail = Array.isArray(r.data) ? r.data.join(' — ') : (r.data?.message || `HTTP ${r.status}`);
    throw new Error(`Connexion GLPI échouée : ${detail}`);
  }
  console.log('  Session GLPI ouverte\n');
  return { base, appToken, sessionToken: r.data.session_token, agent };
}

async function closeSession(sess) {
  if (!sess) return;
  try {
    await axios.get(`${sess.base}/killSession`, {
      headers: { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken },
      httpsAgent: sess.agent, timeout: 5000,
    });
    console.log('  Session GLPI fermée');
  } catch (_) { /* ignore */ }
}

function hdrs(sess) {
  return { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken, 'Content-Type': 'application/json' };
}

// ── Récupère la date du dernier changement de nom dans l'historique GLPI ──────
// id_search_option=1 → champ "Nom". On prend l'entrée la plus récente.
async function fetchNameChangeDate(sess, itemtype, glpiId) {
  // Récupère tous les logs (pagination si besoin ; les logs de nom sont rares)
  const entries = [];
  const step = 100;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/${itemtype}/${glpiId}/Log`, {
      headers: hdrs(sess),
      params: { range: `${start}-${start + step - 1}` },
      httpsAgent: sess.agent, timeout: 20000, validateStatus: () => true,
    });
    if (r.status === 401) throw Object.assign(new Error('Session expirée'), { __sessionExpired: true });
    if (r.status === 404 || !Array.isArray(r.data)) break;
    entries.push(...r.data);
    if (r.data.length < step) break;
    start += step;
    if (start > 10000) break; // garde-fou
  }

  // Filtre les entrées de changement de nom (id_search_option=1, linked_action=0)
  const nameChanges = entries.filter(e => e.id_search_option === 1 && e.linked_action === 0);
  if (nameChanges.length === 0) return null;

  // Prend la plus récente
  nameChanges.sort((a, b) => (a.date_mod > b.date_mod ? -1 : 1));
  return nameChanges[0].date_mod.substring(0, 10); // YYYY-MM-DD
}

// ── Cherche un Infocom dans GLPI (absent de la base locale) ───────────────────
async function findInfocomId(sess, itemtype, glpiId) {
  const r = await axios.get(`${sess.base}/Infocom`, {
    headers: hdrs(sess),
    params: { 'searchText[itemtype]': itemtype, 'searchText[items_id]': String(glpiId), expand_dropdowns: false },
    httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) return r.data[0].id;
  return null;
}

// ── Mise à jour ou création de l'Infocom ──────────────────────────────────────
async function setUseDate(sess, item, useDate) {
  let infocomId = item.infocom_id ? parseInt(item.infocom_id, 10) : null;

  if (!infocomId) {
    infocomId = await findInfocomId(sess, item.itemtype, item.glpi_id);
  }

  let r;
  if (infocomId) {
    r = await axios.put(
      `${sess.base}/Infocom/${infocomId}`,
      { input: { use_date: useDate } },
      { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true }
    );
    return { action: 'MIS À JOUR', status: r.status, ok: r.status >= 200 && r.status < 300, data: r.data };
  } else {
    r = await axios.post(
      `${sess.base}/Infocom`,
      { input: { itemtype: item.itemtype, items_id: item.glpi_id, use_date: useDate } },
      { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true }
    );
    return { action: 'CRÉÉ', status: r.status, ok: r.status >= 200 && r.status < 300, data: r.data };
  }
}

// ── Équipements depuis hub_parc.items ─────────────────────────────────────────
async function fetchItems(testMode, targetName) {
  let q, params;
  if (targetName) {
    q = `SELECT itemtype, glpi_id, name, infocom->>'id' AS infocom_id, infocom->>'use_date' AS use_date_actuel
         FROM hub_parc.items WHERE LOWER(name) = LOWER($1) AND is_deleted = false LIMIT 1`;
    params = [targetName];
  } else {
    q = `SELECT itemtype, glpi_id, name, infocom->>'id' AS infocom_id, infocom->>'use_date' AS use_date_actuel
         FROM hub_parc.items WHERE is_deleted = false
         ${testMode ? 'LIMIT 1' : ''}`;
    params = [];
  }
  const res = await pool.query(q, params);
  return res.rows;
}

// ── Exécution en parallèle avec limite de concurrence ─────────────────────────
async function runConcurrent(items, worker, concurrency) {
  const results = [];
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, next);
  await Promise.all(workers);
  return results;
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(62));
  console.log('  inject_mise_en_service.js — date du changement de nom');
  if (TARGET_NAME) {
    console.log(`  Mode : TEST CIBLÉ sur "${TARGET_NAME}"`);
  } else {
    console.log(`  Mode : ${TEST_MODE ? 'TEST (1 équipement)' : 'GLOBAL (tous les équipements)'}`);
  }
  console.log('='.repeat(62));
  console.log();

  const db    = await setupSqlite();
  const items = await fetchItems(TEST_MODE, TARGET_NAME);

  if (items.length === 0) {
    console.log('  Aucun équipement trouvé.');
    await pool.end(); return;
  }

  console.log(`  ${items.length} équipement(s) à traiter`);
  if (!TEST_MODE && !TARGET_NAME) {
    console.log(`  Récupération des historiques GLPI (${CONCURRENCY} en parallèle)…`);
    console.log(`  Cela peut prendre quelques minutes.\n`);
  } else {
    console.log();
  }

  const sess = await openSession(db);

  let ok = 0, skipped = 0, erreurs = 0;

  await runConcurrent(items, async (item, i) => {
    const label = `${item.itemtype}#${item.glpi_id} "${item.name}"`;

    // 1) Historique GLPI → date du dernier changement de nom
    const nameDate = await fetchNameChangeDate(sess, item.itemtype, item.glpi_id);

    if (!nameDate) {
      console.log(`  SKIP  ${label} — aucun changement de nom dans l'historique`);
      skipped++;
      return;
    }

    console.log(`  ▶ ${label}`);
    console.log(`      use_date actuel : ${item.use_date_actuel || '(vide)'}`);
    console.log(`      → date nom GLPI : ${nameDate}`);

    // 2) Mise à jour Infocom
    const result = await setUseDate(sess, item, nameDate);

    if (result.ok) {
      console.log(`      ✓ Infocom ${result.action} (HTTP ${result.status})\n`);
      ok++;
    } else {
      const detail = Array.isArray(result.data) ? result.data.join(' | ') : (result.data?.message || JSON.stringify(result.data));
      console.log(`      ✗ ERREUR HTTP ${result.status} : ${detail}\n`);
      erreurs++;
    }
  }, CONCURRENCY);

  console.log('='.repeat(62));
  console.log(`  Résultat : ${ok} OK  |  ${skipped} ignorés (pas d'historique)  |  ${erreurs} erreur(s)`);
  if (TEST_MODE && ok > 0) {
    console.log();
    console.log('  → Vérifiez dans GLPI que la date est correcte,');
    console.log('    puis relancez avec --all pour généraliser.');
  }
  console.log('='.repeat(62));

  await closeSession(sess);
  await pool.end();
}

main().catch((e) => {
  console.error('\n[ERREUR FATALE]', e.message);
  process.exit(1);
});
