// ── Module Parc informatique — LIVE (API GLPI 10) ─────────────────────────────
// Source LIVE : interrogation directe de l'API GLPI 10 (session partagée + cache court).
//
// La logique de normalisation, de filtrage/tri/pagination, de calcul des KPIs et de
// construction des fiches est isolée dans la section « CŒUR » (fonctions pures, exportées).
// Le module HUB (parc.hub.controller.js) réutilise EXACTEMENT ce cœur sur les données
// synchronisées, garantissant des listes, KPIs et modales identiques.
const glpi = require('./glpi-client');
const { deriveEmailFromUsager, searchADUsersByQuery } = require('../../shared/ad_helper');

// ════════════════════════════ CŒUR (pur, partagé live/hub) ════════════════════
function str(v) {
  if (v === undefined || v === null || v === '' || v === '&nbsp;') return null;
  if (typeof v === 'object') return v.name || v.completename || null;
  return String(v);
}
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function iso(d) { return d ? d.toISOString().slice(0, 10) : null; }
function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

// Normalise un item GLPI (dropdowns déjà étendus → valeurs lisibles) ───────────
function normalize(itemtype, it) {
  const lc = itemtype.toLowerCase();
  return {
    id: it.id,
    itemtype,
    name: str(it.name),
    serial: str(it.serial),
    otherserial: str(it.otherserial),          // n° d'inventaire
    manufacturer: str(it.manufacturers_id),
    model: str(it[`${lc}models_id`]),
    type: str(it[`${lc}types_id`]),
    state: str(it.states_id),                  // statut
    location: str(it.locations_id),            // lieu
    entity: str(it.entities_id),
    user: str(it.users_id),                    // affecté à (utilisateur)
    group: str(it.groups_id),                  // affecté à (groupe)
    user_tech: str(it.users_id_tech),          // responsable technique
    group_tech: str(it.groups_id_tech),
    contact: str(it.contact),                  // usager (texte libre)
    contact_num: str(it.contact_num),          // usager numéro (texte libre)
    network: str(it.networks_id),              // réseau (dropdown LAN/WiFi…)
    uuid: str(it.uuid),
    autoupdate: str(it.autoupdatesystems_id),  // source de mise à jour
    comment: str(it.comment),
    is_deleted: it.is_deleted == 1 || it.is_deleted === true,
    date_creation: str(it.date_creation),
    date_mod: str(it.date_mod),
    // Champs financiers / dates — remplis par mergeInfocom()
    buy_date: null, use_date: null, reception_date: null, service_date: null,
    supplier: null, value: null, order_number: null, immo_number: null,
    age_years: null,
    age_source: null,   // 'use_date' | 'buy_date' | 'reception' | null
    os: null, os_version: null,
    doc_count: 0,
    ad_found: false,          // enrichi par enrichAdFound()
    itemtype_label: null,     // rempli par loadAllTypes() pour la vue "TOUS"
  };
}

// Fusionne les données Infocom (achat / mise en service / valeur / fournisseur) ──
// et calcule l'âge réel de l'équipement à partir de la date de mise en service.
// Date de l'injection initiale GLPI : ignorée comme « mise en service » (import en masse).
const INJECTION_DATE = '2025-03-05';

function mergeInfocom(r, ic, now = new Date()) {
  let receptionDate = null;
  if (ic) {
    r.buy_date = str(ic.buy_date);
    r.use_date = str(ic.use_date);
    r.supplier = str(ic.suppliers_id);
    r.order_number = str(ic.order_number);
    r.immo_number = str(ic.immo_number);
    r.value = num(ic.value);

    // ⚠️ Dans ce parc, le champ GLPI `warranty_date` est en réalité la DATE DE RÉCEPTION
    // du matériel → c'est elle qui donne l'âge de la machine.
    const parsedUse = parseDate(r.use_date);
    const parsedBuy = parseDate(r.buy_date);
    const parsedRec = parseDate(str(ic.warranty_date)); // date de réception
    receptionDate = parsedUse || parsedBuy || parsedRec;
    r.age_source = parsedUse ? 'use_date' : parsedBuy ? 'buy_date' : parsedRec ? 'reception' : null;
  }

  r.reception_date = iso(receptionDate);
  // Âge basé sur la date de réception (jamais la date de création de la fiche GLPI).
  if (receptionDate) {
    r.age_years = Math.round(((now.getTime() - receptionDate.getTime()) / 86400000 / 365.25) * 10) / 10;
  }

  // Mise en service = dernière modification de la fiche, EN IGNORANT l'injection initiale
  // (5/3/2025) : les fiches jamais modifiées depuis l'import n'ont pas de mise en service.
  const mod = parseDate(r.date_mod);
  r.service_date = (mod && iso(mod) > INJECTION_DATE) ? iso(mod) : null;
  return r;
}

// Construit le tableau {name,mac,ip,type} à partir d'un port réseau GLPI brut.
function mapPort(n) {
  return {
    name: str(n.name), mac: str(n.mac),
    ip: Array.isArray(n._ipaddresses) ? n._ipaddresses.join(', ') : str(n.ip),
    type: str(n.instantiation_type),
  };
}
function mapOs(o) {
  return {
    name: str(o.operatingsystems_id), version: str(o.operatingsystemversions_id),
    arch: str(o.operatingsystemarchitectures_id), kernel: str(o.operatingsystemkernelversions_id),
  };
}
const IMAGE_MIMES = /^image\//i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
// Construit l'entrée document {id, name, filename, mime, isImage} à partir d'une fiche Document GLPI.
function mapDoc(d) {
  const filename = str(d.filename) || str(d.filepath) || '';
  const mime = str(d.mime) || '';
  return {
    id: d.id,
    name: str(d.name) || filename || `Document #${d.id}`,
    filename, mime,
    isImage: IMAGE_MIMES.test(mime) || IMAGE_EXT.test(filename),
  };
}

// ── Liste : recherche / filtres / tri / pagination (sur des lignes normalisées) ─
function applyListQuery(rows, query) {
  if (query.deleted !== '1') rows = rows.filter((r) => !r.is_deleted);

  const q = (query.q || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [r.name, r.serial, r.otherserial, r.user, r.contact, r.contact_num, r.location,
       r.model, r.manufacturer, r.type, r.group, r.supplier, r.os, r.uuid]
        .some((v) => v && v.toLowerCase().includes(q))
    );
  }

  const eq = (field, val) => { if (val) rows = rows.filter((r) => (r[field] || '— Non renseigné —') === val); };
  eq('location', query.location);
  eq('state', query.state);
  eq('manufacturer', query.manufacturer);
  eq('supplier', query.supplier);
  eq('type', query.modeltype || query.type_filter);
  eq('group', query.group);
  // Recherches dédiées usager / usager numéro
  const like = (field, val) => { if (val) { const s = String(val).toLowerCase(); rows = rows.filter((r) => r[field] && r[field].toLowerCase().includes(s)); } };
  like('contact', query.contact);
  like('contact_num', query.contact_num);
  if (query.mise === 'connue') rows = rows.filter((r) => !!r.service_date);
  else if (query.mise === 'inconnue') rows = rows.filter((r) => !r.service_date);
  if (query.affecte === '1') rows = rows.filter((r) => !!r.user);
  if (query.affecte === '0') rows = rows.filter((r) => !r.user);
  if (query.renouveler === '1') rows = rows.filter((r) => r.age_years != null && r.age_years >= 5);
  if (query.ad === '1') rows = rows.filter((r) => r.ad_found);
  if (query.ad === '0') rows = rows.filter((r) => !r.ad_found);
  if (query.docs === '1') rows = rows.filter((r) => r.doc_count > 0);

  const total = rows.length;

  const sort = query.sort || 'name';
  const dir = (query.dir === 'desc') ? -1 : 1;
  const numericFields = new Set(['age_years', 'value']);
  rows = rows.slice().sort((a, b) => {
    if (numericFields.has(sort)) {
      const av = a[sort] == null ? -Infinity : a[sort];
      const bv = b[sort] == null ? -Infinity : b[sort];
      return av < bv ? -dir : av > bv ? dir : 0;
    }
    const av = (a[sort] || '').toString().toLowerCase();
    const bv = (b[sort] || '').toString().toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  // Mode « tout » (vue géo / exports) : pas de pagination, on renvoie toutes les lignes.
  if (query.all === '1' || query.all === 'true' || query.limit === 'all') {
    return { total, start: 0, limit: total, rows };
  }
  const start = Math.max(0, parseInt(query.start, 10) || 0);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 50));
  return { total, start, limit, rows: rows.slice(start, start + limit) };
}

function buildFilters(rows) {
  rows = rows.filter((r) => !r.is_deleted);
  const distinct = (field) => [...new Set(rows.map((r) => r[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    locations: distinct('location'),
    states: distinct('state'),
    manufacturers: distinct('manufacturer'),
    suppliers: distinct('supplier'),
    types: distinct('type'),
    groups: distinct('group'),
  };
}

// ── KPIs ───────────────────────────────────────────────────────────────────────
function topCounts(rows, field, limit = 10) {
  const m = new Map();
  for (const r of rows) {
    const k = r[field] || '— Non renseigné —';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count).slice(0, limit);
}
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function ageBuckets(rows) {
  const b = { '< 1 an': 0, '1–3 ans': 0, '3–5 ans': 0, '5–7 ans': 0, '> 7 ans': 0, 'Inconnu': 0 };
  for (const r of rows) {
    const a = r.age_years;
    if (a == null) b['Inconnu']++;
    else if (a < 1) b['< 1 an']++;
    else if (a < 3) b['1–3 ans']++;
    else if (a < 5) b['3–5 ans']++;
    else if (a < 7) b['5–7 ans']++;
    else b['> 7 ans']++;
  }
  return Object.entries(b).map(([label, count]) => ({ label, count }));
}
function sumValue(rows) { return Math.round(rows.reduce((s, r) => s + (r.value || 0), 0) * 100) / 100; }
function countDuplicateSerials(rows) {
  const m = new Map();
  for (const r of rows) { if (!r.serial) continue; const k = r.serial.trim().toLowerCase(); m.set(k, (m.get(k) || 0) + 1); }
  let n = 0; for (const c of m.values()) if (c > 1) n += c;
  return n;
}

// lists : { ordinateurs:[...], moniteurs:[...], … } lignes normalisées & enrichies
function computeKpis(lists) {
  const keys = Object.keys(glpi.ITEM_TYPES);
  const byType = keys.map((key) => ({
    key, label: glpi.ITEM_TYPES[key].label,
    count: (lists[key] || []).length, value: sumValue(lists[key] || []),
  }));
  const totalAll = byType.reduce((s, x) => s + x.count, 0);
  const valeurParc = Math.round(byType.reduce((s, x) => s + x.value, 0) * 100) / 100;

  const pcs = lists.ordinateurs || [];
  const nbPc = pcs.length;
  const affectes = pcs.filter((r) => !!r.user).length;
  const sansSerie = pcs.filter((r) => !r.serial).length;
  const sansInventaire = pcs.filter((r) => !r.otherserial).length;
  const sansLieu = pcs.filter((r) => !r.location).length;
  const sansMiseEnService = pcs.filter((r) => !r.service_date).length;
  const doublonsSerie = countDuplicateSerials(pcs);

  // Ajouts au parc par année : basés sur la date de réception (acquisition).
  const parAnnee = {};
  for (const r of pcs) {
    const y = (r.reception_date || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) parAnnee[y] = (parAnnee[y] || 0) + 1;
  }
  const ajoutsParAnnee = Object.entries(parAnnee).map(([annee, count]) => ({ annee, count }))
    .sort((a, b) => a.annee.localeCompare(b.annee));

  const ages = pcs.map((r) => r.age_years).filter((a) => a != null);
  const ageMoyen = ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;
  const aRenouveler = pcs.filter((r) => r.age_years != null && r.age_years >= 5).length;
  const miseEnServiceConnue = nbPc - sansMiseEnService;

  return {
    generatedAt: new Date().toISOString(),
    totalAll, valeurParc, byType,
    ordinateurs: {
      total: nbPc, affectes, nonAffectes: nbPc - affectes, tauxAffectation: pct(affectes, nbPc),
      valeur: sumValue(pcs),
      qualite: {
        tauxSerie: pct(nbPc - sansSerie, nbPc), tauxInventaire: pct(nbPc - sansInventaire, nbPc),
        tauxLieu: pct(nbPc - sansLieu, nbPc), sansSerie, sansInventaire, sansLieu, sansMiseEnService, doublonsSerie,
      },
      miseEnService: { connue: miseEnServiceConnue, inconnue: sansMiseEnService, tauxConnue: pct(miseEnServiceConnue, nbPc) },
      age: { moyen: ageMoyen, aRenouveler, tauxRenouveler: pct(aRenouveler, nbPc), tranches: ageBuckets(pcs) },
      parStatut: topCounts(pcs, 'state'),
      parLieu: topCounts(pcs, 'location'),
      parFabricant: topCounts(pcs, 'manufacturer'),
      parModele: topCounts(pcs, 'model'),
      parFournisseur: topCounts(pcs, 'supplier'),
      parOs: topCounts(pcs, 'os'),
      ajoutsParAnnee,
    },
    ratios: {
      moniteursParPc: nbPc ? Math.round(((lists.moniteurs || []).length / nbPc) * 100) / 100 : 0,
      peripheriquesParPc: nbPc ? Math.round(((lists.peripheriques || []).length / nbPc) * 100) / 100 : 0,
    },
  };
}

// Assemble la réponse détail (modale) à partir d'un item + sous-éléments déjà mappés.
function buildItemResponse(itemtype, label, item, { infocom = null, network = [], os = [], software_count = 0, documents = [] } = {}) {
  const summary = normalize(itemtype, item);
  mergeInfocom(summary, infocom);
  if (os.length) { summary.os = os[0].name; summary.os_version = os[0].version; }

  const allFields = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === null || v === '' || k === 'links' || k.startsWith('_')) continue;
    allFields[k] = (typeof v === 'object') ? (v.name || v.completename || JSON.stringify(v)) : v;
  }

  return {
    type: undefined, label, summary,
    infocom: infocom ? {
      buy_date: summary.buy_date, use_date: summary.use_date,
      reception_date: summary.reception_date, service_date: summary.service_date,
      supplier: summary.supplier, value: summary.value,
      order_number: summary.order_number, immo_number: summary.immo_number,
    } : null,
    network, os, documents, software_count, allFields,
  };
}

// ── Enrichissement e-mail usager (table hub_parc.usagers, alimentée par la synchro AD) ──
function usagerKey(name) { return String(name || '').trim().toLowerCase(); }

// Enrichit ad_found sur une liste de lignes normalisées (un seul aller-retour DB).
async function enrichAdFound(rows) {
  // 1) Déduction directe : login@DOMAIN → ad_found sans requête
  for (const r of rows) {
    if (r.contact && deriveEmailFromUsager(r.contact)) r.ad_found = true;
  }
  // 2) Lookup table hub_parc.usagers pour les noms réels (ex. « Jean Dupont »)
  const keys = [...new Set(
    rows.filter(r => !r.ad_found && r.contact).map(r => usagerKey(r.contact))
  )].filter(Boolean);
  if (!keys.length) return;
  try {
    const { pool } = require('../../shared/database');
    const result = await pool.query(
      `SELECT key FROM hub_parc.usagers WHERE found = true AND key = ANY($1)`, [keys]
    );
    const foundKeys = new Set(result.rows.map(x => x.key));
    for (const r of rows) {
      if (!r.ad_found && r.contact && foundKeys.has(usagerKey(r.contact))) r.ad_found = true;
    }
  } catch (e) { /* table absente ou non synchronisée */ }
}

// skipAdEnrich : en mode HUB la résolution AD n'est pas nécessaire (évite 10 s de latence
// si l'AD ne répond pas). En mode LIVE on garde l'enrichissement complet.
async function attachUsagerEmails(summary, { skipAdEnrich = false } = {}) {
  // 1) Lecture table hub_parc.usagers
  const keys = [...new Set([usagerKey(summary.contact), usagerKey(summary.user)].filter(Boolean))];
  if (keys.length) {
    try {
      const { pool } = require('../../shared/database');
      const r = await pool.query(`SELECT key, email, display_name FROM hub_parc.usagers WHERE key = ANY($1)`, [keys]);
      const byKey = new Map(r.rows.map((x) => [x.key, x]));
      const c = byKey.get(usagerKey(summary.contact));
      const u = byKey.get(usagerKey(summary.user));
      if (c && c.email) summary.contact_email = c.email;
      if (u && u.email) summary.user_email = u.email;
    } catch (e) { /* table absente */ }
  }
  // 2) Repli : valeur login@IVRY → e-mail déduit
  if (!summary.contact_email) { const e = deriveEmailFromUsager(summary.contact); if (e) summary.contact_email = e; }
  if (!summary.user_email) { const e = deriveEmailFromUsager(summary.user); if (e) summary.user_email = e; }

  if (skipAdEnrich) return;
  // 3) Enrichissement AD pour les valeurs login@DOMAIN : recherche par sAMAccountName
  //    pour récupérer le nom complet et le service sans se limiter à l'e-mail.
  for (const [valField, emailField, adNameField, serviceField] of [
    ['contact', 'contact_email', 'contact_ad_name', 'contact_service'],
    ['user',    'user_email',    'user_ad_name',    'user_service'],
  ]) {
    const val = String(summary[valField] || '');
    if (!summary[emailField] || !val.includes('@')) continue; // pas de @, pas de derive
    const local = val.split('@')[0].trim().toLowerCase();
    if (!local) continue;
    try {
      const { getSqlite } = require('../../shared/database');
      const ad = await getSqlite().get('SELECT * FROM ad_settings WHERE id = 1');
      if (!ad || !ad.host) continue;
      const results = await searchADUsersByQuery(local, ad);
      const match = results.find(u => (u.username || '').toLowerCase() === local) || results[0];
      if (match) {
        if (match.displayName) summary[adNameField] = match.displayName;
        if (match.service)     summary[serviceField] = match.service;
      }
    } catch (e) { /* AD indisponible */ }
  }
}

// ════════════════════════════ SOURCE LIVE (API GLPI 10) ═══════════════════════
async function infocomIndex({ refresh = false } = {}) {
  // expand:false → items_id reste numérique (sinon GLPI le remplace par le nom de l'item)
  const raw = await glpi.getAll('Infocom', { refresh, expand: false }).catch(() => []);
  const m = new Map();
  for (const ic of raw) m.set(`${ic.itemtype}-${ic.items_id}`, ic);
  return m;
}
async function osIndex({ refresh = false } = {}) {
  // expand:false → items_id reste numérique ; on résout les noms OS via une table dédiée
  const [raw, osNames] = await Promise.all([
    glpi.getAll('Item_OperatingSystem', { refresh, expand: false }).catch(() => []),
    glpi.getAll('OperatingSystem', { refresh }).catch(() => []),
  ]);
  const nameMap = new Map(osNames.map(o => [o.id, str(o.name)]));
  const verMap = new Map(); // OperatingSystemVersion : à résoudre si besoin
  const m = new Map();
  for (const o of raw) {
    if (o.itemtype !== 'Computer') continue;
    m.set(o.items_id, {
      name: nameMap.get(o.operatingsystems_id) || str(o.operatingsystems_id),
      version: str(o.operatingsystemversions_id),  // ID ; acceptable
      arch: str(o.operatingsystemarchitectures_id),
      kernel: str(o.operatingsystemkernelversions_id),
    });
  }
  return m;
}
async function docCountIndex({ refresh = false } = {}) {
  const raw = await glpi.getAll('Document_Item', { refresh }).catch(() => []);
  const m = new Map();
  for (const l of raw) { const k = `${l.itemtype}-${l.items_id}`; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
async function loadType(itemtype, { refresh = false, ic = null, os = null, dc = null } = {}) {
  const now = new Date();
  const raw = await glpi.getAll(itemtype, { refresh });
  if (!ic) ic = await infocomIndex({ refresh });
  if (itemtype === 'Computer' && !os) os = await osIndex({ refresh });
  if (!dc) dc = await docCountIndex({ refresh });
  const result = raw.map((it) => {
    const r = normalize(itemtype, it);
    mergeInfocom(r, ic.get(`${itemtype}-${it.id}`), now);
    if (os) { const o = os.get(it.id); if (o) { r.os = o.name; r.os_version = o.version; } }
    r.doc_count = dc.get(`${itemtype}-${it.id}`) || 0;
    return r;
  });
  await enrichAdFound(result);
  return result;
}

// Charge tous les types fusionnés (vue TOUS) avec labelisation du type sur chaque ligne.
async function loadAllTypesLive({ refresh = false } = {}) {
  const [ic, os, dc] = await Promise.all([infocomIndex({ refresh }), osIndex({ refresh }), docCountIndex({ refresh })]);
  const keys = Object.keys(glpi.ITEM_TYPES);
  const all = [];
  await Promise.all(keys.map(async (key) => {
    try {
      const rows = await loadType(glpi.ITEM_TYPES[key].itemtype, { refresh, ic, os, dc });
      for (const r of rows) { r.itemtype_label = glpi.ITEM_TYPES[key].label; r.type_key = key; }
      all.push(...rows);
    } catch (e) { /* type indisponible */ }
  }));
  return all;
}

// Calcule la liste des usagers avec leur nombre d'équipements (partagé live/hub).
function computeUsagersEquip(allRows) {
  const withUsager = allRows.filter(r => !r.is_deleted && r.contact);
  const map = new Map();
  for (const r of withUsager) {
    const key = r.contact.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { contact: r.contact, ad_found: r.ad_found, count: 0, by_type: {} });
    const entry = map.get(key);
    entry.count++;
    const label = r.itemtype_label || r.itemtype || 'Autre';
    entry.by_type[label] = (entry.by_type[label] || 0) + 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ── Handlers LIVE ──────────────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const key = (req.params.type || req.query.type || 'ordinateurs').toLowerCase();
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (key === 'tous') {
      const rows = await loadAllTypesLive({ refresh });
      const out = applyListQuery(rows, req.query);
      return res.json({ source: 'live', type: 'tous', label: 'Tous les équipements', ...out });
    }
    const t = glpi.typeByKey(key);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const rows = await loadType(t.itemtype, { refresh });
    const out = applyListQuery(rows, req.query);
    res.json({ source: 'live', type: key, label: t.label, ...out, cache: glpi.cacheInfo(t.itemtype) });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function item(req, res) {
  try {
    const t = glpi.typeByKey(req.params.type);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'ID invalide' });

    const data = await glpi.getItem(t.itemtype, id);
    if (!data) return res.status(404).json({ message: 'Équipement introuvable' });

    let network = [], os = [], software = [], docLinks = [];
    if (t.itemtype === 'Computer') {
      [network, os, software, docLinks] = await Promise.all([
        glpi.getSub(t.itemtype, id, 'NetworkPort'),
        glpi.getSub(t.itemtype, id, 'Item_OperatingSystem'),
        glpi.getSub(t.itemtype, id, 'Item_SoftwareVersion'),
        glpi.getSub(t.itemtype, id, 'Document_Item', { expand: false }),
      ]);
    } else {
      [network, docLinks] = await Promise.all([
        glpi.getSub(t.itemtype, id, 'NetworkPort'),
        glpi.getSub(t.itemtype, id, 'Document_Item', { expand: false }),
      ]);
    }
    // Documents associés : on récupère la fiche de chaque document lié (nom, mime, image…)
    const docIds = [...new Set(docLinks.map((d) => d.documents_id).filter(Boolean))];
    const docs = (await Promise.all(docIds.map((did) => glpi.getItem('Document', did).catch(() => null))))
      .filter(Boolean).map(mapDoc);

    const ic = (data._infocoms && typeof data._infocoms === 'object') ? data._infocoms : null;
    const resp = buildItemResponse(t.itemtype, t.label, data, {
      infocom: ic, network: network.map(mapPort), os: os.map(mapOs), documents: docs, software_count: software.length,
    });
    await attachUsagerEmails(resp.summary);
    res.json({ ...resp, source: 'live', type: req.params.type });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function kpis(req, res) {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const [ic, os, dc] = await Promise.all([infocomIndex({ refresh }), osIndex({ refresh }), docCountIndex({ refresh })]);
    const keys = Object.keys(glpi.ITEM_TYPES);
    const lists = {};
    await Promise.all(keys.map(async (key) => {
      try { lists[key] = (await loadType(glpi.ITEM_TYPES[key].itemtype, { refresh, ic, os, dc })).filter((r) => !r.is_deleted); }
      catch (e) { lists[key] = []; }
    }));
    res.json({ source: 'live', ...computeKpis(lists), cache: Object.fromEntries(keys.map((k) => [k, glpi.cacheInfo(glpi.ITEM_TYPES[k].itemtype)])) });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function filters(req, res) {
  try {
    const key = (req.params.type || req.query.type || 'ordinateurs').toLowerCase();
    if (key === 'tous') {
      const rows = await loadAllTypesLive({});
      return res.json(buildFilters(rows));
    }
    const t = glpi.typeByKey(key);
    if (!t) return res.status(400).json({ message: 'Type invalide' });
    const rows = await loadType(t.itemtype, {});
    res.json(buildFilters(rows));
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function usagersEquip(req, res) {
  try {
    const rows = await loadAllTypesLive({});
    res.json({ source: 'live', usagers: computeUsagersEquip(rows) });
  } catch (error) { res.status(500).json({ message: error.message }); }
}

async function health(req, res) {
  let sess;
  try {
    sess = await glpi.openSession();
    await glpi.closeSession(sess);
    res.json({ ok: true, message: 'API GLPI 10 joignable' });
  } catch (error) {
    if (sess) await glpi.closeSession(sess);
    res.status(503).json({ ok: false, message: error.message });
  }
}

module.exports = {
  list, item, kpis, filters, health, usagersEquip,
  // Cœur réutilisé par le module HUB
  core: {
    normalize, mergeInfocom, mapPort, mapOs, mapDoc,
    applyListQuery, buildFilters, computeKpis, buildItemResponse, attachUsagerEmails,
    enrichAdFound, computeUsagersEquip,
  },
};
