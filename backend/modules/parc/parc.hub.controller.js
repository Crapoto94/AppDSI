// ── Module Parc informatique — HUB (données synchronisées hub_parc.items) ──────
// Reproduit à l'identique le mode LIVE en réutilisant le même « cœur » (normalize,
// mergeInfocom, applyListQuery, computeKpis, buildItemResponse, buildFilters), mais
// en lisant les données dans la base au lieu d'interroger l'API GLPI 10.
const { pool, getSqlite } = require('../../shared/database');
const glpi = require('./glpi-client');
const { core } = require('./parc.live.controller');
const { searchADUsersByQuery } = require('../../shared/ad_helper');

// Convertit les lignes stockées (raw + infocom + os) en lignes normalisées & enrichies.
function rowsToNormalized(itemtype, dbRows) {
  const now = new Date();
  return dbRows.map((row) => {
    const it = row.raw || {};
    const n = core.normalize(itemtype, it);
    core.mergeInfocom(n, row.infocom || null, now);
    const os = Array.isArray(row.os) ? row.os : [];
    if (os.length) { n.os = os[0].name; n.os_version = os[0].version; }
    n.doc_count = Array.isArray(row.documents) ? row.documents.length : 0;
    return n;
  });
}

// Cache mémoire des lignes normalisées (les données HUB ne changent qu'à la synchro).
// Évite de relire + parser tout le JSONB à chaque requête (liste, KPIs, filtres).
const _hubCache = new Map(); // itemtype -> { rows, ts }
const HUB_TTL_MS = 5 * 60 * 1000;
function clearHubCache() { _hubCache.clear(); }

async function loadTypeRows(typeKey, { refresh = false } = {}) {
  const t = glpi.typeByKey(typeKey);
  if (!t) return null;
  const hit = _hubCache.get(t.itemtype);
  if (!refresh && hit && (Date.now() - hit.ts) < HUB_TTL_MS) return hit.rows;
  const r = await pool.query(`SELECT raw, infocom, os, documents FROM hub_parc.items WHERE itemtype = $1`, [t.itemtype]);
  const rows = rowsToNormalized(t.itemtype, r.rows);
  await core.enrichAdFound(rows);
  await core.enrichAdComputer(rows);
  _hubCache.set(t.itemtype, { rows, ts: Date.now() });
  return rows;
}

// Charge tous les types fusionnés pour la vue « TOUS ».
async function loadAllTypesHub({ refresh = false } = {}) {
  const keys = Object.keys(glpi.ITEM_TYPES);
  const all = [];
  await Promise.all(keys.map(async (key) => {
    try {
      const rows = await loadTypeRows(key, { refresh });
      if (rows) {
        for (const r of rows) { r.itemtype_label = glpi.ITEM_TYPES[key].label; r.type_key = key; }
        all.push(...rows);
      }
    } catch (e) { /* type indisponible */ }
  }));
  return all;
}

async function lastSync() {
  const r = await pool.query(`SELECT MAX(last_sync) AS last FROM hub_parc.items`);
  return r.rows[0]?.last || null;
}

async function list(req, res) {
  try {
    const key = (req.params.type || req.query.type || 'ordinateurs').toLowerCase();
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (key === 'tous') {
      const rows = await loadAllTypesHub({ refresh });
      const out = core.applyListQuery(rows, req.query);
      return res.json({ source: 'hub', type: 'tous', label: 'Tous les équipements', ...out, cache: { cached: true, synced_at: await lastSync() } });
    }
    const t = glpi.typeByKey(key);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const rows = await loadTypeRows(key, { refresh });
    const out = core.applyListQuery(rows, req.query);
    res.json({ source: 'hub', type: key, label: t.label, ...out, cache: { cached: true, synced_at: await lastSync() } });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function item(req, res) {
  try {
    const t = glpi.typeByKey(req.params.type);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'ID invalide' });
    const r = await pool.query(
      `SELECT raw, infocom, os, network, documents, software_count FROM hub_parc.items WHERE itemtype = $1 AND glpi_id = $2`,
      [t.itemtype, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Équipement introuvable (non synchronisé)' });
    const row = r.rows[0];
    const resp = core.buildItemResponse(t.itemtype, t.label, row.raw || {}, {
      infocom: row.infocom || null,
      network: Array.isArray(row.network) ? row.network : [],
      os: Array.isArray(row.os) ? row.os : [],
      documents: Array.isArray(row.documents) ? row.documents : [],
      software_count: row.software_count || 0,
    });
    await core.attachUsagerEmails(resp.summary, { skipAdEnrich: true });
    res.json({ ...resp, source: 'hub', type: req.params.type });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function kpis(req, res) {
  try {
    const keys = Object.keys(glpi.ITEM_TYPES);
    const lists = {};
    await Promise.all(keys.map(async (key) => {
      lists[key] = (await loadTypeRows(key)).filter((r) => !r.is_deleted);
    }));
    const [mob, deployParAn, deployParMois] = await Promise.all([core.loadMobiliteCounts(), core.loadDeploiementsParAnnee(), core.loadDeploiementsParMois()]);
    const k = core.computeKpis(lists, mob);
    k.ordinateurs.deploiementsParAnnee = deployParAn;
    k.ordinateurs.deploiementsParMois = deployParMois;
    res.json({ source: 'hub', ...k, cache: { synced_at: await lastSync() } });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function filters(req, res) {
  try {
    const key = (req.params.type || req.query.type || 'ordinateurs').toLowerCase();
    if (key === 'tous') {
      const rows = await loadAllTypesHub({});
      return res.json(core.buildFilters(rows));
    }
    const t = glpi.typeByKey(key);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const rows = await loadTypeRows(key);
    res.json(core.buildFilters(rows));
  } catch (error) { res.status(500).json({ message: error.message }); }
}

// Équipements associés à un email — recherche sur contact ET user (Utilisateur GLPI) ────
async function byEmail(req, res) {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'email requis' });
  try {
    // Collecte tous les noms possibles (contact texte libre + login GLPI)
    const possibleNames = new Set();
    const login = email.split('@')[0].toLowerCase(); // ex. 'fplichart'
    if (login) possibleNames.add(login); // toujours présent — matche users_id GLPI directement

    try {
      // hub_parc.usagers : résolution par email
      const r1 = await pool.query(
        `SELECT source_name FROM hub_parc.usagers WHERE LOWER(email) = $1`, [email]
      );
      for (const row of r1.rows) if (row.source_name) possibleNames.add(row.source_name.trim().toLowerCase());

      // hub_parc.usagers : résolution par login AD
      const r2 = await pool.query(
        `SELECT source_name FROM hub_parc.usagers WHERE LOWER(ad_username) = $1`, [login]
      );
      for (const row of r2.rows) if (row.source_name) possibleNames.add(row.source_name.trim().toLowerCase());
    } catch (e) { /* table absente → on continue avec le login seul */ }

    // Filtre sur contact (usager texte libre) OU user (Utilisateur GLPI)
    const allRows = await loadAllTypesHub({});
    const filtered = allRows.filter(row =>
      !row.is_deleted && (
        (row.contact && possibleNames.has(row.contact.trim().toLowerCase())) ||
        (row.user    && possibleNames.has(row.user.trim().toLowerCase()))
      )
    );

    // Nom d'affichage : préférer le source_name résolu, sinon le login
    const displayName = [...possibleNames].find(n => n !== login) || login;
    res.json({ total: filtered.length, contact: displayName, rows: filtered.slice(0, 100) });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function usagersEquip(req, res) {
  try {
    const rows = await loadAllTypesHub({});
    res.json({ source: 'hub', usagers: core.computeUsagersEquip(rows) });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function updateContactNum(req, res) {
  try {
    const t = glpi.typeByKey(req.params.type);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'ID invalide' });
    const { contact_num } = req.body;
    if (contact_num === undefined || contact_num === null) {
      return res.status(400).json({ message: 'contact_num requis' });
    }
    // Base locale
    const r = await pool.query(
      `UPDATE hub_parc.items SET raw = jsonb_set(COALESCE(raw, '{}'), '{contact_num}', to_jsonb($1::text)) WHERE itemtype = $2 AND glpi_id = $3`,
      [contact_num, t.itemtype, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ message: 'Équipement introuvable' });
    // GLPI
    const glpiRes = await glpi.updateItem(t.itemtype, id, { contact_num });
    clearHubCache();
    res.json({ success: true, contact_num, glpi_ok: glpiRes.ok });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function stockSummary(req, res) {
  try {
    const rows = await loadAllTypesHub({});
    res.json({ source: 'hub', groups: core.computeStockSummary(rows) });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function health(req, res) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int n, MAX(last_sync) AS last FROM hub_parc.items`);
    if (!r.rows[0].n) return res.status(503).json({ ok: false, message: 'Aucune donnée synchronisée — lancez une synchronisation GLPI' });
    res.json({ ok: true, message: `HUB : ${r.rows[0].n} équipements`, synced_at: r.rows[0].last });
  } catch (error) { res.status(503).json({ ok: false, message: error.message }); }
}

// ── Inversion contact ↔ contact_num (local + GLPI + tentative AD) ─────────────
async function swapContact(req, res) {
  try {
    const t = glpi.typeByKey(req.params.type);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'ID invalide' });

    const r = await pool.query(
      `SELECT raw->>'contact' AS contact, raw->>'contact_num' AS contact_num
       FROM hub_parc.items WHERE itemtype = $1 AND glpi_id = $2`,
      [t.itemtype, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Équipement introuvable' });

    const cur = r.rows[0];
    const newContact    = cur.contact_num || '';
    const newContactNum = cur.contact     || '';

    // Mise à jour base locale
    await pool.query(
      `UPDATE hub_parc.items
       SET raw = COALESCE(raw, '{}') || jsonb_build_object('contact', $1::text, 'contact_num', $2::text)
       WHERE itemtype = $3 AND glpi_id = $4`,
      [newContact, newContactNum, t.itemtype, id]
    );

    // Mise à jour GLPI
    const glpiRes = await glpi.updateItem(t.itemtype, id, { contact: newContact, contact_num: newContactNum });

    // Tentative AD sur le nouveau contact
    let adEmail = null, adFound = false;
    if (newContact) {
      try {
        const db = getSqlite();
        const adCfg = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
        if (adCfg && adCfg.host) {
          const results = await searchADUsersByQuery(newContact, adCfg);
          const match = results[0];
          if (match && match.email) {
            adEmail = match.email; adFound = true;
            await pool.query(
              `INSERT INTO hub_parc.usagers (key, source_name, ad_username, display_name, email, service, found, last_sync)
               VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
               ON CONFLICT (key) DO UPDATE SET ad_username=$3, display_name=$4, email=$5, service=$6, found=true, last_sync=NOW()`,
              [newContact.trim().toLowerCase(), newContact, match.username || null, match.displayName || null, match.email, match.service || null]
            );
          }
        }
      } catch (_) { /* AD indisponible */ }
    }

    clearHubCache();
    res.json({ success: true, contact: newContact, contact_num: newContactNum, ad_email: adEmail, ad_found: adFound, glpi_ok: glpiRes.ok });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

// ── Recherche AD (renvoie les candidats sans rien écrire) ─────────────────────
async function adLookup(req, res) {
  const query = ((req.body || {}).query || '').trim();
  if (!query) return res.status(400).json({ message: 'query requis' });
  try {
    const db = getSqlite();
    const adCfg = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
    if (!adCfg || !adCfg.host) return res.status(503).json({ message: 'Active Directory non configuré' });
    const results = await searchADUsersByQuery(query, adCfg);
    res.json({ results });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

// ── Applique un usager AD : met à jour contact local + GLPI + stocke l'email ──
async function updateContact(req, res) {
  try {
    const t = glpi.typeByKey(req.params.type);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'ID invalide' });

    const { contact, email, ad_username, display_name, service } = req.body || {};
    if (contact === undefined || contact === null) return res.status(400).json({ message: 'contact requis' });

    // Base locale
    const r = await pool.query(
      `UPDATE hub_parc.items
       SET raw = COALESCE(raw, '{}') || jsonb_build_object('contact', $1::text)
       WHERE itemtype = $2 AND glpi_id = $3`,
      [contact, t.itemtype, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ message: 'Équipement introuvable' });

    // GLPI
    const glpiRes = await glpi.updateItem(t.itemtype, id, { contact });

    // Email en base locale
    if (contact && email) {
      await pool.query(
        `INSERT INTO hub_parc.usagers (key, source_name, ad_username, display_name, email, service, found, last_sync)
         VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
         ON CONFLICT (key) DO UPDATE SET ad_username=$3, display_name=$4, email=$5, service=$6, found=true, last_sync=NOW()`,
        [contact.trim().toLowerCase(), contact, ad_username || null, display_name || null, email, service || null]
      );
    }

    clearHubCache();
    res.json({ success: true, contact, glpi_ok: glpiRes.ok });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

module.exports = { list, item, kpis, filters, health, usagersEquip, byEmail, clearHubCache, updateContactNum, stockSummary, swapContact, adLookup, updateContact };
