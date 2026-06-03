// ── fix_mise_en_service.js ────────────────────────────────────────────────────
// Pour chaque ordinateur GLPI, inspecte l'historique et :
//   • Si le 1er événement est AVANT le 2025-03-06 → vide use_date (équipement ancien)
//   • Sinon → met use_date = date du changement de nom (id_search_option=1)
//   • Aucun changement de nom trouvé sur équipement récent → inchangé
//
// Usage (depuis la racine c:\dev\AppDSI) :
//   node backend/scripts/fix_mise_en_service.js              → simulation (rien n'est écrit)
//   node backend/scripts/fix_mise_en_service.js --apply      → applique à tous les ordinateurs
//   node backend/scripts/fix_mise_en_service.js --name=PO20333          → simulation ciblée
//   node backend/scripts/fix_mise_en_service.js --name=PO25202 --apply  → applique ciblée

'use strict';

const path  = require('path');
const axios  = require('axios');
const https  = require('https');

const ROOT        = path.join(__dirname, '..');
const setupSqlite = require(path.join(ROOT, 'shared', 'sqlite_db'));
const { pool }    = require(path.join(ROOT, 'shared', 'pg_db'));

const CUTOFF      = '2025-03-06';   // 1er événement AVANT cette date → on vide use_date
const APPLY       = process.argv.includes('--apply');
const TARGET_NAME = (() => { const a = process.argv.find(x => x.startsWith('--name=')); return a ? a.slice(7).trim() : null; })();
const CONCURRENCY = 8;

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
  return { base, appToken: s.token, sessionToken: r.data.session_token, agent };
}

async function closeSession(sess) {
  try { await axios.get(`${sess.base}/killSession`, { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 5000 }); } catch (_) {}
}

function hdrs(sess) {
  return { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken, 'Content-Type': 'application/json' };
}

// ── Log GLPI d'un équipement (toutes les pages) ───────────────────────────────
async function fetchLog(sess, itemtype, glpiId) {
  const all = [];
  const step = 200;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/${itemtype}/${glpiId}/Log`, {
      headers: hdrs(sess),
      params: { range: `${start}-${start + step - 1}` },
      httpsAgent: sess.agent, timeout: 20000, validateStatus: () => true,
    });
    if (r.status === 401) throw Object.assign(new Error('Session expirée'), { __sessionExpired: true });
    if (r.status === 404 || !Array.isArray(r.data) || r.data.length === 0) break;
    all.push(...r.data);
    if (r.data.length < step) break;
    start += step;
    if (start > 20000) break;
  }
  return all;
}

// ── Cherche ou crée un Infocom GLPI (retourne son id) ────────────────────────
async function findInfocomId(sess, itemtype, glpiId) {
  const r = await axios.get(`${sess.base}/Infocom`, {
    headers: hdrs(sess),
    params: { 'searchText[itemtype]': itemtype, 'searchText[items_id]': String(glpiId), expand_dropdowns: false },
    httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) return r.data[0].id;
  return null;
}

async function setUseDate(sess, itemtype, glpiId, infocomIdFromDb, useDate) {
  let infocomId = infocomIdFromDb ? parseInt(infocomIdFromDb, 10) : null;
  if (!infocomId) infocomId = await findInfocomId(sess, itemtype, glpiId);
  const input = { use_date: useDate };   // null vide le champ, "YYYY-MM-DD" le fixe
  if (infocomId) {
    const r = await axios.put(`${sess.base}/Infocom/${infocomId}`, { input }, { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true });
    return { action: 'MIS À JOUR', status: r.status, ok: r.status >= 200 && r.status < 300, data: r.data };
  } else {
    const payload = { input: { itemtype, items_id: glpiId, use_date: useDate } };
    const r = await axios.post(`${sess.base}/Infocom`, payload, { headers: hdrs(sess), httpsAgent: sess.agent, timeout: 15000, validateStatus: () => true });
    return { action: 'CRÉÉ', status: r.status, ok: r.status >= 200 && r.status < 300, data: r.data };
  }
}

// ── Exécution en parallèle limitée ───────────────────────────────────────────
async function runConcurrent(items, worker, concurrency) {
  let idx = 0;
  async function next() { while (idx < items.length) { const i = idx++; await worker(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(64));
  console.log('  fix_mise_en_service.js');
  console.log(`  Seuil     : 1er événement < ${CUTOFF} → vide use_date`);
  console.log(`  Sinon     : use_date = date du changement de nom GLPI`);
  if (TARGET_NAME) console.log(`  Filtre    : "${TARGET_NAME}"`);
  console.log(`  Mode      : ${APPLY ? 'APPLIQUE (écriture dans GLPI)' : 'SIMULATION (lecture seule)'}`);
  console.log('='.repeat(64));
  console.log();

  const db = await setupSqlite();

  // Récupère les ordinateurs depuis la base locale
  let q, params;
  if (TARGET_NAME) {
    q = `SELECT itemtype, glpi_id, name, infocom->>'id' AS infocom_id, infocom->>'use_date' AS use_date_actuel
         FROM hub_parc.items WHERE itemtype = 'Computer' AND LOWER(name) = LOWER($1) AND is_deleted = false`;
    params = [TARGET_NAME];
  } else {
    q = `SELECT itemtype, glpi_id, name, infocom->>'id' AS infocom_id, infocom->>'use_date' AS use_date_actuel
         FROM hub_parc.items WHERE itemtype = 'Computer' AND is_deleted = false ORDER BY name`;
    params = [];
  }
  const { rows: computers } = await pool.query(q, params);
  console.log(`  ${computers.length} ordinateur(s) à analyser\n`);

  if (computers.length === 0) { await pool.end(); return; }

  const sess = await openSession(db);
  console.log(`  Session GLPI ouverte\n`);

  let cleared = 0, fixed = 0, skipped = 0, errors = 0;
  const preview = !APPLY; // mode simulation

  await runConcurrent(computers, async (pc) => {
    const log = await fetchLog(sess, pc.itemtype, pc.glpi_id);

    if (log.length === 0) {
      console.log(`  SKIP  ${pc.name} — log vide`);
      skipped++;
      return;
    }

    // Date du 1er événement (le plus ancien)
    const sorted    = [...log].sort((a, b) => (a.date_mod < b.date_mod ? -1 : 1));
    const firstDate = sorted[0].date_mod.substring(0, 10);

    // Changement de nom : id_search_option=1, linked_action=0
    const nameChanges = log.filter(e => e.id_search_option === 1 && e.linked_action === 0);
    nameChanges.sort((a, b) => (a.date_mod < b.date_mod ? -1 : 1)); // plus ancien en premier
    const nameChangeDate = nameChanges.length > 0 ? nameChanges[0].date_mod.substring(0, 10) : null;

    if (firstDate < CUTOFF) {
      // Équipement ancien → vide use_date
      console.log(`  VIDE  ${pc.name}  (1er événement ${firstDate} < ${CUTOFF})  use_date actuel: ${pc.use_date_actuel || '(vide)'}`);
      if (APPLY) {
        const res = await setUseDate(sess, pc.itemtype, pc.glpi_id, pc.infocom_id, null);
        if (res.ok) { cleared++; }
        else {
          const detail = Array.isArray(res.data) ? res.data.join(' | ') : (res.data?.message || `HTTP ${res.status}`);
          console.log(`        ✗ ERREUR ${detail}`);
          errors++;
        }
      } else { cleared++; } // simulation compte comme prévu
    } else if (nameChangeDate) {
      // Équipement récent avec changement de nom → fixe use_date
      const same = pc.use_date_actuel === nameChangeDate;
      if (same) {
        console.log(`  OK    ${pc.name}  use_date déjà correct : ${nameChangeDate}`);
        skipped++;
        return;
      }
      console.log(`  FIX   ${pc.name}  (1er événement ${firstDate})  ${pc.use_date_actuel || '(vide)'} → ${nameChangeDate}`);
      if (APPLY) {
        const res = await setUseDate(sess, pc.itemtype, pc.glpi_id, pc.infocom_id, nameChangeDate);
        if (res.ok) { fixed++; }
        else {
          const detail = Array.isArray(res.data) ? res.data.join(' | ') : (res.data?.message || `HTTP ${res.status}`);
          console.log(`        ✗ ERREUR ${detail}`);
          errors++;
        }
      } else { fixed++; }
    } else {
      // Équipement récent sans changement de nom dans le log
      console.log(`  SKIP  ${pc.name}  (1er événement ${firstDate}) — aucun changement de nom dans le log`);
      skipped++;
    }
  }, CONCURRENCY);

  await closeSession(sess);

  console.log();
  console.log('='.repeat(64));
  if (preview) {
    console.log(`  SIMULATION — rien n'a été écrit dans GLPI`);
    console.log(`  Prévu : ${cleared} vidés  |  ${fixed} corrigés  |  ${skipped} inchangés  |  ${errors} erreurs`);
    console.log();
    console.log(`  → Relancez avec --apply pour appliquer.`);
  } else {
    console.log(`  Résultat : ${cleared} vidés  |  ${fixed} corrigés  |  ${skipped} inchangés  |  ${errors} erreur(s)`);
  }
  console.log('='.repeat(64));

  await pool.end();
}

main().catch(e => { console.error('\n[ERREUR FATALE]', e.message); process.exit(1); });
