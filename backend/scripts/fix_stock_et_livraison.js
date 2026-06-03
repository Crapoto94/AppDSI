// ── fix_stock_et_livraison.js ─────────────────────────────────────────────────
// Opération A : vide use_date pour tous les ordinateurs en statut "En stock neuf"
//               (local DB + GLPI)
// Opération B : déplace warranty_date → delivery_date pour tout ordinateur ayant
//               une date de début de garantie (local DB + GLPI)
//
// Usage :
//   node backend/scripts/fix_stock_et_livraison.js         → simulation
//   node backend/scripts/fix_stock_et_livraison.js --apply → applique

'use strict';
const path  = require('path');
const axios  = require('axios');
const https  = require('https');
const ROOT   = path.join(__dirname, '..');
const setupSqlite = require(path.join(ROOT, 'shared', 'sqlite_db'));
const { pool }    = require(path.join(ROOT, 'shared', 'pg_db'));

const APPLY       = process.argv.includes('--apply');
const CONCURRENCY = 10;

// ── Session GLPI ──────────────────────────────────────────────────────────────
async function openSession(db) {
  const s = await db.get('SELECT url, token, user_token FROM glpi10_settings WHERE id = 1');
  let base = String(s.url).trim().replace(/\/+$/, '');
  if (!base.includes('apirest.php')) base += '/apirest.php';
  const agent = new https.Agent({ rejectUnauthorized: false });
  const r = await axios.get(`${base}/initSession`, {
    headers: { 'App-Token': s.token, 'Authorization': `user_token ${s.user_token}` },
    httpsAgent: agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data?.session_token)
    throw new Error(`Connexion GLPI échouée (HTTP ${r.status})`);
  return { base, appToken: s.token, sessionToken: r.data.session_token, agent };
}
async function closeSession(sess) {
  try { await axios.get(`${sess.base}/killSession`, { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 5000 }); } catch (_) {}
}
function hdrs(sess) {
  return { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken, 'Content-Type': 'application/json' };
}

// ── Récupère tous les Infocoms Computer depuis GLPI ──────────────────────────
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
    if (r.status === 404 || !Array.isArray(r.data) || r.data.length === 0) break;
    all.push(...r.data);
    if (r.data.length < step) break;
    start += step;
    if (start > 500000) break;
  }
  return all.filter(ic => ic.itemtype === 'Computer');
}

// ── Mise à jour d'un Infocom dans GLPI ───────────────────────────────────────
async function patchInfocom(sess, id, input) {
  const r = await axios.put(`${sess.base}/Infocom/${id}`, { input },
    { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, data: r.data };
}

// ── Mise à jour du champ infocom en base locale ───────────────────────────────
async function patchLocalInfocom(glpiId, patch) {
  // patch = objet JS à merger dans le JSONB infocom
  const assignments = Object.entries(patch)
    .map(([k, v]) => `'${k}'::text, ${v === null ? 'null::jsonb' : `to_jsonb(${typeof v === 'string' ? `'${v.replace(/'/g, "''")}'::text` : v})`}`)
    .join(', ');
  await pool.query(
    `UPDATE hub_parc.items
     SET infocom = COALESCE(infocom, '{}') || jsonb_build_object(${assignments})
     WHERE itemtype = 'Computer' AND glpi_id = $1`,
    [glpiId]
  );
}

// ── Concurrence limitée ───────────────────────────────────────────────────────
async function runConcurrent(items, worker, n) {
  let idx = 0;
  async function next() { while (idx < items.length) { const i = idx++; await worker(items[i]); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, next));
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(66));
  console.log('  fix_stock_et_livraison.js');
  console.log(`  Mode : ${APPLY ? 'APPLIQUE (écriture GLPI + base locale)' : 'SIMULATION (lecture seule)'}`);
  console.log('='.repeat(66));
  console.log();

  const db = await setupSqlite();

  // État "En stock neuf" par glpi_id (depuis base locale, post-synchro)
  const { rows: stockRows } = await pool.query(`
    SELECT glpi_id FROM hub_parc.items
    WHERE itemtype = 'Computer' AND is_deleted = false
      AND raw->>'states_id' = 'En stock neuf'
  `);
  const stockIds = new Set(stockRows.map(r => r.glpi_id));
  console.log(`  ${stockIds.size} ordinateurs "En stock neuf" en base locale`);

  // Récupère tous les Infocoms Computer depuis GLPI
  console.log('  Récupération des Infocoms depuis GLPI…');
  const sess = await openSession(db);
  const infocoms = await fetchAllInfocoms(sess);
  console.log(`  ${infocoms.length} Infocoms Computer dans GLPI\n`);

  // ── Opération A : vide use_date pour les "En stock neuf" ──────────────────
  const opA = infocoms.filter(ic =>
    stockIds.has(ic.items_id) &&
    ic.use_date && ic.use_date !== '' && ic.use_date !== '0000-00-00'
  );

  console.log(`  ┌─ Opération A : ${opA.length} PC "En stock neuf" avec use_date à vider`);
  opA.slice(0, 5).forEach(ic => console.log(`  │  Infocom#${ic.id}  Computer#${ic.items_id}  use_date=${ic.use_date}`));
  if (opA.length > 5) console.log(`  │  … et ${opA.length - 5} autres`);
  console.log('  └─────────────────────────────────────\n');

  // ── Opération B : déplace warranty_date → delivery_date ───────────────────
  const opB = infocoms.filter(ic =>
    ic.warranty_date && ic.warranty_date !== '' && ic.warranty_date !== '0000-00-00'
  );

  console.log(`  ┌─ Opération B : ${opB.length} PC avec warranty_date à déplacer vers delivery_date`);
  opB.slice(0, 5).forEach(ic => console.log(`  │  Infocom#${ic.id}  Computer#${ic.items_id}  warranty_date=${ic.warranty_date}  delivery_date_actuel=${ic.delivery_date || '(vide)'}`));
  if (opB.length > 5) console.log(`  │  … et ${opB.length - 5} autres`);
  console.log('  └─────────────────────────────────────\n');

  if (!APPLY) {
    console.log('  → Simulation terminée. Relancez avec --apply pour appliquer.');
    await closeSession(sess); await pool.end(); return;
  }

  // ── Application ───────────────────────────────────────────────────────────
  let okA = 0, errA = 0, okB = 0, errB = 0;

  console.log('  Application Opération A…');
  await runConcurrent(opA, async (ic) => {
    const res = await patchInfocom(sess, ic.id, { use_date: null });
    if (res.ok) {
      // Base locale : vide use_date dans infocom JSONB
      await pool.query(
        `UPDATE hub_parc.items
         SET infocom = COALESCE(infocom, '{}') || '{"use_date": null}'::jsonb
         WHERE itemtype = 'Computer' AND glpi_id = $1`,
        [ic.items_id]
      );
      okA++;
    } else {
      console.log(`  ✗ A  Infocom#${ic.id}  HTTP ${res.status}`);
      errA++;
    }
  }, CONCURRENCY);

  console.log('  Application Opération B…');
  await runConcurrent(opB, async (ic) => {
    const res = await patchInfocom(sess, ic.id, {
      delivery_date: ic.warranty_date,
      warranty_date: null,
    });
    if (res.ok) {
      // Base locale : met delivery_date, vide warranty_date
      await pool.query(
        `UPDATE hub_parc.items
         SET infocom = COALESCE(infocom, '{}')
           || jsonb_build_object('delivery_date', $1::text, 'warranty_date', null::text)
         WHERE itemtype = 'Computer' AND glpi_id = $2`,
        [ic.warranty_date, ic.items_id]
      );
      okB++;
    } else {
      console.log(`  ✗ B  Infocom#${ic.id}  HTTP ${res.status}`);
      errB++;
    }
  }, CONCURRENCY);

  await closeSession(sess);

  console.log();
  console.log('='.repeat(66));
  console.log(`  Op A (use_date vidé)         : ${okA} OK  |  ${errA} erreur(s)`);
  console.log(`  Op B (warranty → delivery)   : ${okB} OK  |  ${errB} erreur(s)`);
  console.log('='.repeat(66));

  await pool.end();
}

main().catch(e => { console.error('\n[ERREUR FATALE]', e.message); process.exit(1); });
