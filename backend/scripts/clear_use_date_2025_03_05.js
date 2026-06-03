// ── clear_use_date_2025_03_05.js ──────────────────────────────────────────────
// Script one-shot : efface le champ use_date (Mise en service) dans GLPI pour
// tous les Infocoms dont la valeur est exactement "2025-03-05".
//
// Usage :
//   node backend/scripts/clear_use_date_2025_03_05.js          → test (affiche seulement)
//   node backend/scripts/clear_use_date_2025_03_05.js --apply  → efface réellement

'use strict';

const path = require('path');
const axios = require('axios');
const https = require('https');

const ROOT        = path.join(__dirname, '..');
const setupSqlite = require(path.join(ROOT, 'shared', 'sqlite_db'));

const TARGET_DATE = '2025-03-05';
const DRY_RUN     = !process.argv.includes('--apply');
const CONCURRENCY = 10;

// ── Session GLPI ──────────────────────────────────────────────────────────────
async function openSession(db) {
  const s = await db.get('SELECT url, token, user_token FROM glpi10_settings WHERE id = 1');
  if (!s?.url) throw new Error('GLPI 10 non configuré');
  let base = String(s.url).trim().replace(/\/+$/, '');
  if (!base.includes('apirest.php')) base += '/apirest.php';
  const agent = new https.Agent({ rejectUnauthorized: false });
  const r = await axios.get(`${base}/initSession`, {
    headers: { 'App-Token': s.token, 'Authorization': `user_token ${s.user_token}` },
    httpsAgent: agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data?.session_token)
    throw new Error(`Connexion GLPI échouée (HTTP ${r.status})`);
  console.log('  Session GLPI ouverte\n');
  return { base, appToken: s.token, sessionToken: r.data.session_token, agent };
}

async function closeSession(sess) {
  try {
    await axios.get(`${sess.base}/killSession`, {
      headers: { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken },
      httpsAgent: sess.agent, timeout: 5000,
    });
    console.log('  Session GLPI fermée');
  } catch (_) {}
}

function hdrs(sess) {
  return { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken, 'Content-Type': 'application/json' };
}

// ── Récupère tous les Infocoms (paginé) ───────────────────────────────────────
async function fetchAllInfocoms(sess) {
  const all = [];
  const step = 500;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/Infocom`, {
      headers: hdrs(sess),
      params: { range: `${start}-${start + step - 1}`, expand_dropdowns: false },
      httpsAgent: sess.agent, timeout: 30000, validateStatus: () => true,
    });
    if (r.status === 404 || !Array.isArray(r.data)) break;
    all.push(...r.data);
    if (r.data.length < step) break;
    start += step;
    if (start > 500000) break;
  }
  return all;
}

// ── Efface use_date d'un Infocom ──────────────────────────────────────────────
async function clearUseDate(sess, infocomId) {
  const r = await axios.put(
    `${sess.base}/Infocom/${infocomId}`,
    { input: { use_date: null } },
    { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true }
  );
  return r;
}

// ── Concurrence limitée ───────────────────────────────────────────────────────
async function runConcurrent(items, worker, concurrency) {
  let idx = 0;
  async function next() {
    while (idx < items.length) { const i = idx++; await worker(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log(`  clear_use_date_2025_03_05.js`);
  console.log(`  Cible  : use_date = "${TARGET_DATE}"`);
  console.log(`  Mode   : ${DRY_RUN ? 'SIMULATION (--apply pour effacer réellement)' : 'EFFACEMENT RÉEL'}`);
  console.log('='.repeat(60));
  console.log();

  const db   = await setupSqlite();
  const sess = await openSession(db);

  console.log('  Récupération de tous les Infocoms GLPI…');
  const all     = await fetchAllInfocoms(sess);
  const targets = all.filter(ic => ic.use_date === TARGET_DATE);

  console.log(`  Total Infocoms : ${all.length}`);
  console.log(`  Avec use_date = "${TARGET_DATE}" : ${targets.length}\n`);

  if (targets.length === 0) {
    console.log('  Rien à faire.');
    await closeSession(sess);
    return;
  }

  // Aperçu des 5 premiers
  console.log(`  Aperçu (5 premiers) :`);
  targets.slice(0, 5).forEach(ic =>
    console.log(`    Infocom#${ic.id}  ${ic.itemtype}#${ic.items_id}  use_date=${ic.use_date}`)
  );
  if (targets.length > 5) console.log(`    … et ${targets.length - 5} autres`);
  console.log();

  if (DRY_RUN) {
    console.log('  → Simulation terminée. Relancez avec --apply pour effacer.');
    await closeSession(sess);
    return;
  }

  let ok = 0, erreurs = 0;

  await runConcurrent(targets, async (ic) => {
    const r = await clearUseDate(sess, ic.id);
    if (r.status >= 200 && r.status < 300) {
      ok++;
    } else {
      const detail = Array.isArray(r.data) ? r.data.join(' | ') : (r.data?.message || `HTTP ${r.status}`);
      console.log(`  ✗ Infocom#${ic.id} (${ic.itemtype}#${ic.items_id}) — ${detail}`);
      erreurs++;
    }
  }, CONCURRENCY);

  console.log('='.repeat(60));
  console.log(`  Résultat : ${ok} effacés  |  ${erreurs} erreur(s)`);
  console.log('='.repeat(60));

  await closeSession(sess);
}

main().catch(e => { console.error('\n[ERREUR FATALE]', e.message); process.exit(1); });
