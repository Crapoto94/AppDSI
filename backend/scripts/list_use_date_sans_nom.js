// ── list_use_date_sans_nom.js ─────────────────────────────────────────────────
// Liste (puis efface si --apply) les ordinateurs dont la use_date est renseignée
// dans GLPI mais dont le log ne contient AUCUN événement de changement de nom
// (id_search_option=1, linked_action=0).
//
// Usage :
//   node backend/scripts/list_use_date_sans_nom.js         → liste uniquement
//   node backend/scripts/list_use_date_sans_nom.js --apply → efface les use_date

'use strict';
const path  = require('path');
const axios  = require('axios');
const https  = require('https');
const ROOT   = path.join(__dirname, '..');
const setupSqlite = require(path.join(ROOT, 'shared', 'sqlite_db'));
const { pool }    = require(path.join(ROOT, 'shared', 'pg_db'));

const APPLY       = process.argv.includes('--apply');
const CONCURRENCY = 8;

async function openSession(db) {
  const s = await db.get('SELECT url, token, user_token FROM glpi10_settings WHERE id = 1');
  let base = String(s.url).trim().replace(/\/+$/, '');
  if (!base.includes('apirest.php')) base += '/apirest.php';
  const agent = new https.Agent({ rejectUnauthorized: false });
  const r = await axios.get(`${base}/initSession`, {
    headers: { 'App-Token': s.token, 'Authorization': `user_token ${s.user_token}` },
    httpsAgent: agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data?.session_token) throw new Error(`Connexion GLPI échouée (HTTP ${r.status})`);
  return { base, appToken: s.token, sessionToken: r.data.session_token, agent };
}

async function closeSession(sess) {
  try { await axios.get(`${sess.base}/killSession`, { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 5000 }); } catch (_) {}
}

function hdrs(sess) {
  return { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken, 'Content-Type': 'application/json' };
}

async function fetchLog(sess, glpiId) {
  const all = [];
  const step = 200;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/Computer/${glpiId}/Log`, {
      headers: hdrs(sess), params: { range: `${start}-${start + step - 1}` },
      httpsAgent: sess.agent, timeout: 20000, validateStatus: () => true,
    });
    if (r.status === 404 || !Array.isArray(r.data) || r.data.length === 0) break;
    all.push(...r.data);
    if (r.data.length < step) break;
    start += step;
    if (start > 20000) break;
  }
  return all;
}

async function clearUseDate(sess, infocomId) {
  const r = await axios.put(`${sess.base}/Infocom/${infocomId}`,
    { input: { use_date: null } },
    { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true }
  );
  return r;
}

async function findInfocomId(sess, glpiId) {
  const r = await axios.get(`${sess.base}/Infocom`, {
    headers: hdrs(sess),
    params: { 'searchText[itemtype]': 'Computer', 'searchText[items_id]': String(glpiId), expand_dropdowns: false },
    httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) return r.data[0].id;
  return null;
}

async function runConcurrent(items, worker, n) {
  let idx = 0;
  async function next() { while (idx < items.length) { const i = idx++; await worker(items[i]); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, next));
}

async function main() {
  console.log('='.repeat(68));
  console.log('  list_use_date_sans_nom.js');
  console.log(`  Mode : ${APPLY ? 'EFFACE les use_date incriminées' : 'LISTE UNIQUEMENT (--apply pour effacer)'}`);
  console.log('='.repeat(68));
  console.log();

  const db = await setupSqlite();
  const sess = await openSession(db);

  // Récupère tous les Infocoms Computer directement depuis GLPI (source de vérité)
  console.log('  Récupération des Infocoms Computer depuis GLPI...');
  const allInfocoms = [];
  const step = 500;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/Infocom`, {
      headers: hdrs(sess),
      params: { range: `${start}-${start + step - 1}`, expand_dropdowns: false },
      httpsAgent: sess.agent, timeout: 30000, validateStatus: () => true,
    });
    if (r.status === 404 || !Array.isArray(r.data) || r.data.length === 0) break;
    allInfocoms.push(...r.data);
    if (r.data.length < step) break;
    start += step;
    if (start > 500000) break;
  }

  // Filtre : Infocom de type Computer avec une use_date renseignée
  const withUseDate = allInfocoms.filter(ic =>
    ic.itemtype === 'Computer' && ic.use_date && ic.use_date !== '0000-00-00'
  );

  // Enrichit avec le nom depuis la base locale (pour l'affichage)
  const nameMap = new Map();
  const { rows: localRows } = await pool.query(
    `SELECT glpi_id, name FROM hub_parc.items WHERE itemtype = 'Computer'`
  );
  for (const r of localRows) nameMap.set(r.glpi_id, r.name);

  const rows = withUseDate.map(ic => ({
    glpi_id: ic.items_id,
    infocom_id: String(ic.id),
    use_date: ic.use_date,
    name: nameMap.get(ic.items_id) || `(glpi#${ic.items_id})`,
  }));

  console.log(`  ${rows.length} ordinateurs avec une use_date dans GLPI\n`);

  console.log('  Récupération des logs GLPI (peut prendre quelques minutes)...\n');

  const toFix = [];   // { glpi_id, name, use_date, infocom_id, firstNonNameEvent }
  const mutex = [];

  await runConcurrent(rows, async (pc) => {
    const log = await fetchLog(sess, pc.glpi_id);
    const nameChanges = log.filter(e => e.id_search_option === 1 && e.linked_action === 0);
    if (nameChanges.length === 0) {
      // Aucun changement de nom → use_date incorrecte
      // On cherche l'événement qui a probablement déclenché le mauvais réglage
      const otherEvents = log.filter(e => e.linked_action === 0 && e.id_search_option !== 0)
                             .sort((a, b) => (a.date_mod < b.date_mod ? -1 : 1));
      const culprit = otherEvents[0];
      mutex.push({ ...pc, culprit });
    }
  }, CONCURRENCY);

  // Tri alphabétique pour affichage stable
  mutex.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  console.log(`  ┌─ ${mutex.length} ordinateur(s) avec use_date SANS changement de nom dans le log ─`);
  console.log('  │');
  for (const pc of mutex) {
    const culprit = pc.culprit
      ? `  événement suspect : [opt=${pc.culprit.id_search_option}] "${pc.culprit.old_value}" → "${pc.culprit.new_value}" le ${pc.culprit.date_mod}`
      : '  (log vide ou aucun événement tracé)';
    console.log(`  │  glpi_id=${pc.glpi_id}  name=${pc.name || '(sans nom)'}  use_date=${pc.use_date}`);
    console.log(`  │  ${culprit}`);
    console.log('  │');
  }
  console.log('  └─────────────────────────────────────────────────────────────────\n');

  if (!APPLY) {
    console.log('  → Vérifiez la liste ci-dessus, puis relancez avec --apply pour effacer.');
    await closeSession(sess);
    await pool.end(); return;
  }

  // Effacement
  let ok = 0, err = 0;
  for (const pc of mutex) {
    let infocomId = pc.infocom_id ? parseInt(pc.infocom_id, 10) : null;
    if (!infocomId) infocomId = await findInfocomId(sess, pc.glpi_id);
    if (!infocomId) { console.log(`  SKIP  ${pc.name} — Infocom introuvable`); err++; continue; }
    const r = await clearUseDate(sess, infocomId);
    if (r.status >= 200 && r.status < 300) {
      console.log(`  ✓ Vidé  ${pc.name} (Infocom#${infocomId})`);
      ok++;
    } else {
      console.log(`  ✗ Erreur ${pc.name} HTTP ${r.status}`);
      err++;
    }
  }
  console.log(`\n  Résultat : ${ok} vidés  |  ${err} erreurs`);

  await closeSession(sess);
  await pool.end();
}

main().catch(e => { console.error('\n[ERREUR FATALE]', e.message); process.exit(1); });
