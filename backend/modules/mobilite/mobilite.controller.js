// ─── Parc mobilité (téléphones & tablettes) ───────────────────────────────────
// Lecture des tables hub_parc.mobilite_devices (dernier état par appareil) et
// hub_parc.mobilite_events (historique des actions). Données importées depuis
// l'Excel via scripts/import_mobilite.js.
const { pool, pgDb } = require('../../shared/database');
const fs = require('fs');
const docs = require('../../shared/documents.service');
const receptionService = require('../stocks/services/reception.service');
const deliveryService = require('../stocks/services/delivery.service');
const returnService = require('../stocks/services/return.service');
const blPdf = require('../stocks/services/bl-pdf.service');
const { saveSignature } = require('../stocks/services/signature.util');
const importService = require('./mobilite.import.service');
const blTemplateRepo = require('../stocks/repositories/bl-template.repository');
const { resolveStoreRole, hasRank } = require('../stocks/middleware/store-permissions');
const { STORE_CODE } = require('./mobilite.bootstrap');

// ── Helpers magasin DSI-Mobilité ──────────────────────────────────────────────
async function getMobStore() {
  return pgDb.get(`SELECT * FROM hub_stocks.stores WHERE code = $1`, [STORE_CODE]);
}
// Vérifie le rôle minimum de l'utilisateur sur le magasin mobilité. Renvoie le
// magasin si OK, sinon répond une erreur HTTP et renvoie null.
async function requireMob(req, res, minRole) {
  const store = await getMobStore();
  if (!store) { res.status(503).json({ error: 'Magasin mobilité non initialisé' }); return null; }
  const role = await resolveStoreRole(req.user, store.id);
  if (!hasRank(role, minRole)) { res.status(403).json({ error: 'Permission refusée sur le parc mobilité' }); return null; }
  req.mobRole = role;
  return store;
}

// Date jj/mm/aaaa pour les fiches.
function fmtDateFr(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

// Clé device : IMEI si saisi, sinon référence interne du serial_item.
function deviceKeyFor(serialItem) {
  const imei = (serialItem?.serial_number || '').trim();
  return imei ? `IMEI:${imei.toUpperCase().replace(/\s+/g, '')}` : `STOCK:${serialItem.id}`;
}

// Journalise un événement mobilité + met à jour le dernier état du device.
async function logMobiliteEvent(ev) {
  const seqRow = (await pool.query(
    `SELECT COALESCE(MAX(seq),0)+1 AS n FROM hub_parc.mobilite_events WHERE device_key = $1`, [ev.device_key])).rows[0];
  await pool.query(
    `INSERT INTO hub_parc.mobilite_events
       (device_key, seq, direction, service, agent, action, action_norm, is_retour, date_event,
        type_appareil, famille, modele, imei, serial, numero_ligne, statut, dernier_util, observations,
        delivery_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'stock')`,
    [ev.device_key, seqRow.n, ev.direction || null, ev.service || null, ev.agent || null,
     ev.action, ev.action_norm, ev.action_norm === 'Retour', ev.date_event || new Date(),
     ev.type_appareil || null, ev.famille || 'telephone', ev.modele || null, ev.imei || null,
     ev.serial || null, ev.numero_ligne || null, ev.statut || null, ev.agent || null,
     ev.observations || null, ev.delivery_id || null]
  );
  const inactif = ['Retour', 'Vol', 'Cession'].includes(ev.action_norm);
  await pool.query(
    `INSERT INTO hub_parc.mobilite_devices
       (device_key, imei, serial, type_appareil, famille, modele, numero_ligne,
        last_action, last_action_norm, last_statut, last_date, last_direction, last_service, last_agent,
        dernier_util, events_count, retours_count, first_date, is_actif,
        serial_item_id, store_id, last_delivery_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16,$11,$17,$18,$19,$20,NOW())
     ON CONFLICT (device_key) DO UPDATE SET
       imei = COALESCE(EXCLUDED.imei, hub_parc.mobilite_devices.imei),
       serial = COALESCE(EXCLUDED.serial, hub_parc.mobilite_devices.serial),
       modele = COALESCE(EXCLUDED.modele, hub_parc.mobilite_devices.modele),
       numero_ligne = COALESCE(EXCLUDED.numero_ligne, hub_parc.mobilite_devices.numero_ligne),
       last_action = EXCLUDED.last_action, last_action_norm = EXCLUDED.last_action_norm,
       last_statut = EXCLUDED.last_statut, last_date = EXCLUDED.last_date,
       last_direction = EXCLUDED.last_direction, last_service = EXCLUDED.last_service,
       last_agent = EXCLUDED.last_agent, dernier_util = EXCLUDED.dernier_util,
       events_count = hub_parc.mobilite_devices.events_count + 1,
       retours_count = hub_parc.mobilite_devices.retours_count + $16,
       is_actif = EXCLUDED.is_actif, serial_item_id = COALESCE(EXCLUDED.serial_item_id, hub_parc.mobilite_devices.serial_item_id),
       store_id = EXCLUDED.store_id, last_delivery_id = EXCLUDED.last_delivery_id, updated_at = NOW()`,
    [ev.device_key, ev.imei || null, ev.serial || null, ev.type_appareil || null, ev.famille || 'telephone',
     ev.modele || null, ev.numero_ligne || null, ev.action, ev.action_norm, ev.statut || null,
     ev.date_event || new Date(), ev.direction || null, ev.service || null, ev.agent || null,
     ev.agent || null, ev.action_norm === 'Retour' ? 1 : 0, !inactif, ev.serial_item_id || null,
     ev.store_id || null, ev.delivery_id || null]
  );
}

// Colonnes triables de la liste des appareils (whitelist anti-injection).
const SORTABLE = {
  modele: 'modele', type_appareil: 'type_appareil', famille: 'famille',
  last_action: 'last_action_norm', last_statut: 'last_statut', last_date: 'last_date',
  last_direction: 'last_direction', last_service: 'last_service', last_agent: 'last_agent',
  numero_ligne: 'numero_ligne', events_count: 'events_count', retours_count: 'retours_count',
  imei: 'imei',
};

// ── Liste des appareils (dernier état) avec filtres / tri / pagination ─────────
exports.devices = async (req, res) => {
  try {
    const { q, famille, action, direction, statut, sim, mdm, forfait, actif } = req.query;
    const where = [];
    const p = [];
    const add = (cond, val) => { p.push(val); where.push(cond.replace('?', `$${p.length}`)); };

    if (famille) add('famille = ?', famille);
    if (action) add('last_action_norm = ?', action);
    if (direction) add('last_direction = ?', direction);
    if (statut) add('last_statut = ?', statut);
    if (forfait) add('forfait = ?', forfait);
    if (sim === 'oui') where.push("(carte_sim ILIKE 'oui')");
    else if (sim === 'non') where.push("(carte_sim IS NULL OR carte_sim NOT ILIKE 'oui')");
    if (mdm === 'oui') where.push("(mdm ILIKE 'oui')");
    else if (mdm === 'non') where.push("(mdm IS NULL OR mdm NOT ILIKE 'oui')");
    if (actif === '1') where.push('is_actif = TRUE');
    else if (actif === '0') where.push('is_actif = FALSE');
    // Cycle de vie : la liste principale ne montre par défaut que les appareils
    // « attribués » (en service) — stock / en_attribution / cession / vol masqués.
    const cycle = req.query.cycle;
    if (cycle) add('statut = ?', cycle);
    else if (req.query.include_sorti === '1') where.push("statut IN ('attribue','sorti')");
    else where.push("statut = 'attribue'");
    if (q) {
      const like = `%${String(q).trim()}%`;
      p.push(like);
      const i = `$${p.length}`;
      where.push(`(modele ILIKE ${i} OR imei ILIKE ${i} OR serial ILIKE ${i} OR etiquetage ILIKE ${i}
        OR numero_ligne ILIKE ${i} OR last_agent ILIKE ${i} OR last_direction ILIKE ${i}
        OR last_service ILIKE ${i} OR dernier_util ILIKE ${i} OR type_appareil ILIKE ${i})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sortCol = SORTABLE[req.query.sort] || 'last_date';
    const sortDir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const start = parseInt(req.query.start, 10) || 0;

    const totalR = await pool.query(`SELECT COUNT(*)::int n FROM hub_parc.mobilite_devices ${whereSql}`, p);
    const rowsR = await pool.query(
      `SELECT * FROM hub_parc.mobilite_devices ${whereSql}
       ORDER BY ${sortCol} ${sortDir} NULLS LAST, device_key ASC
       LIMIT ${limit} OFFSET ${start}`,
      p,
    );
    res.json({ total: totalR.rows[0].n, items: rowsR.rows, start, limit });
  } catch (e) {
    console.error('[mobilite] devices', e);
    res.status(500).json({ error: e.message });
  }
};

// ── Historique (événements) d'un appareil ─────────────────────────────────────
exports.deviceEvents = async (req, res) => {
  try {
    const key = req.params.key;
    const r = await pool.query(
      `SELECT * FROM hub_parc.mobilite_events WHERE device_key = $1 ORDER BY seq ASC`,
      [key],
    );
    const dev = await pool.query(`SELECT * FROM hub_parc.mobilite_devices WHERE device_key = $1`, [key]);
    res.json({ device: dev.rows[0] || null, events: r.rows });
  } catch (e) {
    console.error('[mobilite] deviceEvents', e);
    res.status(500).json({ error: e.message });
  }
};

// ── Valeurs distinctes pour les filtres ───────────────────────────────────────
exports.filters = async (_req, res) => {
  try {
    const distinct = async (col) => {
      const r = await pool.query(
        `SELECT ${col} v, COUNT(*)::int n FROM hub_parc.mobilite_devices
         WHERE ${col} IS NOT NULL AND ${col} <> '' GROUP BY ${col} ORDER BY n DESC`,
      );
      return r.rows.map((x) => ({ value: x.v, label: x.v, count: x.n }));
    };
    res.json({
      familles: await distinct('famille'),
      actions: await distinct('last_action_norm'),
      directions: await distinct('last_direction'),
      statuts: await distinct('last_statut'),
      forfaits: await distinct('forfait'),
    });
  } catch (e) {
    console.error('[mobilite] filters', e);
    res.status(500).json({ error: e.message });
  }
};

// ── KPIs + données de graphiques ──────────────────────────────────────────────
exports.kpis = async (_req, res) => {
  try {
    const all = (s) => pool.query(s).then((r) => r.rows);
    const one = (s) => pool.query(s).then((r) => r.rows[0]);

    const totals = await one(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_actif)::int AS actifs,
        COUNT(*) FILTER (WHERE NOT is_actif)::int AS inactifs,
        COUNT(*) FILTER (WHERE famille = 'telephone')::int AS telephones,
        COUNT(*) FILTER (WHERE famille = 'tablette')::int AS tablettes,
        COUNT(*) FILTER (WHERE famille = 'sim')::int AS sims,
        COUNT(*) FILTER (WHERE carte_sim ILIKE 'oui')::int AS avec_sim,
        COUNT(*) FILTER (WHERE mdm ILIKE 'oui')::int AS avec_mdm,
        COUNT(*) FILTER (WHERE numero_ligne IS NOT NULL AND numero_ligne <> '')::int AS avec_ligne,
        COALESCE(SUM(retours_count),0)::int AS total_retours
      FROM hub_parc.mobilite_devices`);
    const totalEvents = (await one(`SELECT COUNT(*)::int n FROM hub_parc.mobilite_events`)).n;

    const parFamille = await all(`SELECT famille AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_devices GROUP BY famille ORDER BY count DESC`);
    const parDerniereAction = await all(`SELECT last_action_norm AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_devices WHERE last_action_norm IS NOT NULL GROUP BY last_action_norm ORDER BY count DESC`);
    const parStatut = await all(`SELECT COALESCE(NULLIF(last_statut,''),'—') AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_devices GROUP BY 1 ORDER BY count DESC`);
    const parDirection = await all(`SELECT COALESCE(NULLIF(last_direction,''),'—') AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_devices GROUP BY 1 ORDER BY count DESC LIMIT 15`);
    const parForfait = await all(`SELECT COALESCE(NULLIF(forfait,''),'—') AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_devices GROUP BY 1 ORDER BY count DESC LIMIT 12`);
    // Volume d'actions par type d'action (tous événements confondus)
    const actionsParType = await all(`SELECT action_norm AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_events GROUP BY action_norm ORDER BY count DESC`);
    // Cadence mensuelle des actions (12 derniers mois disponibles)
    const timeline = await all(`
      SELECT to_char(date_trunc('month', date_event), 'YYYY-MM') AS mois,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE action_norm = 'Dotation')::int AS dotation,
             COUNT(*) FILTER (WHERE action_norm = 'Mise à disposition')::int AS mise,
             COUNT(*) FILTER (WHERE action_norm = 'Prêt')::int AS pret,
             COUNT(*) FILTER (WHERE action_norm = 'Retour')::int AS retour,
             COUNT(*) FILTER (WHERE action_norm = 'Vol')::int AS vol
      FROM hub_parc.mobilite_events
      WHERE date_event IS NOT NULL
      GROUP BY 1 ORDER BY 1 ASC`);
    const topModeles = await all(`SELECT COALESCE(NULLIF(modele,''),'—') AS key, COUNT(*)::int AS count FROM hub_parc.mobilite_devices GROUP BY 1 ORDER BY count DESC LIMIT 10`);

    res.json({
      ...totals, totalEvents,
      parFamille, parDerniereAction, parStatut, parDirection, parForfait,
      actionsParType, timeline, topModeles,
    });
  } catch (e) {
    console.error('[mobilite] kpis', e);
    res.status(500).json({ error: e.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  CYCLE DE VIE via le module /stocks (entrée stock, attribution, retour)
// ══════════════════════════════════════════════════════════════════════════════

const familleFromCategory = (cat) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('tablet')) return 'tablette';
  if (c.includes('sim')) return 'sim';
  return 'telephone';
};

// ── Magasin mobilité + mon rôle ───────────────────────────────────────────────
exports.store = async (req, res) => {
  try {
    const store = await getMobStore();
    if (!store) return res.status(503).json({ error: 'Magasin mobilité non initialisé' });
    const role = await resolveStoreRole(req.user, store.id);
    res.json({ ...store, my_role: role });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Stock = appareils dont le statut de cycle de vie est « stock » ────────────
// (importés revenus en retour OU saisis en stock, avec ou sans IMEI).
exports.listStock = async (req, res) => {
  const store = await requireMob(req, res, 'viewer'); if (!store) return;
  try {
    const rows = await pool.query(
      `SELECT d.*, si.order_number, si.status AS serial_status
       FROM hub_parc.mobilite_devices d
       LEFT JOIN hub_stocks.serial_items si ON si.id = d.serial_item_id
       WHERE d.statut = 'stock'
       ORDER BY d.updated_at DESC NULLS LAST, d.device_key ASC`);
    res.json({ store_id: store.id, items: rows.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Attributions en cours (préparées, en attente de remise signée) ────────────
exports.listAttributions = async (req, res) => {
  const store = await requireMob(req, res, 'viewer'); if (!store) return;
  try {
    const rows = await pool.query(
      `SELECT d.*, si.order_number FROM hub_parc.mobilite_devices d
       LEFT JOIN hub_stocks.serial_items si ON si.id = d.serial_item_id
       WHERE d.statut = 'en_attribution' ORDER BY d.updated_at DESC NULLS LAST`);
    res.json({ store_id: store.id, items: rows.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Organigramme (Direction → Service → Secteur) pour l'attribution à un service ─
exports.organisation = async (req, res) => {
  const store = await requireMob(req, res, 'viewer'); if (!store) return;
  try {
    const rows = await pgDb.all(`
      SELECT "DIRECTION" AS dc, "DIRECTION_L" AS dl, "SERVICE" AS sc, "SERVICE_L" AS sl,
             "SECTEUR" AS secc, "SECTEUR_L" AS secl
      FROM oracle.rh_siim_organigramme
      WHERE "DIRECTION" IS NOT NULL AND "DIRECTION" <> ''`);
    const dirMap = new Map();
    for (const r of rows) {
      const dc = (r.dc || '').trim(); if (!dc) continue;
      if (!dirMap.has(dc)) dirMap.set(dc, { code: dc, label: (r.dl || dc).trim(), services: new Map() });
      const dir = dirMap.get(dc);
      const sc = (r.sc || '').trim();
      if (sc) {
        if (!dir.services.has(sc)) dir.services.set(sc, { code: sc, label: (r.sl || sc).trim(), secteurs: new Map() });
        const svc = dir.services.get(sc);
        const secc = (r.secc || '').trim();
        if (secc && !svc.secteurs.has(secc)) svc.secteurs.set(secc, { code: secc, label: (r.secl || secc).trim() });
      }
    }
    const result = Array.from(dirMap.values()).map(d => ({
      code: d.code, label: d.label,
      services: Array.from(d.services.values()).map(s => ({ code: s.code, label: s.label, secteurs: Array.from(s.secteurs.values()) })),
    }));
    res.json(result);
  } catch (e) { console.error('[mobilite] organisation', e); res.status(500).json({ error: e.message }); }
};

// ── Ré-import Excel : ÉCRASE totalement la base mobile ────────────────────────
exports.importExcel = async (req, res) => {
  const store = await requireMob(req, res, 'manager'); if (!store) return;
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier .xlsx requis' });
    const r = await importService.importWorkbook({ buffer: req.file.buffer });
    res.json({ ok: true, ...r });
  } catch (e) { console.error('[mobilite] importExcel', e); res.status(500).json({ error: e.message }); }
};

// ── Catalogue des modèles (articles smartphones/tablettes du magasin) ─────────
exports.listModels = async (req, res) => {
  const store = await requireMob(req, res, 'viewer'); if (!store) return;
  try {
    const rows = await pgDb.all(
      `SELECT id, reference, label, category, brand, model FROM hub_stocks.items
       WHERE category IS NULL OR category ILIKE 'smartphone' OR category ILIKE 'tablette' OR category ILIKE 'mobile%'
       ORDER BY label ASC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Entrée en stock (réception : modèle + quantité + n° de commande) ──────────
exports.stockEntry = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const { item_id, model, label, reference, brand, category, quantity, order_number, supplier, location_id } = req.body || {};
    const qty = parseInt(quantity, 10) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Quantité invalide' });
    if (!item_id && !label && !model) return res.status(400).json({ error: 'Modèle requis' });

    const reception = await receptionService.createReception({
      store_id: store.id, order_number: order_number || null, supplier: supplier || null,
    });
    await receptionService.addLine(reception.id, {
      item_id: item_id || null,
      label: label || model || null,
      reference: reference || null,
      brand: brand || null,
      model: model || label || null,
      category: category || 'Smartphone',
      tracking_mode: 'serial',
      quantity_received: qty,
      location_id: location_id || null,
      specs: { source: 'mobilite' },
    });
    const result = await receptionService.validateReception(reception.id, req.user);

    // Matérialise chaque unité comme device mobilité « en stock ».
    const serials = await pool.query(
      `SELECT si.id, si.serial_number, i.label, i.category FROM hub_stocks.serial_items si
       JOIN hub_stocks.items i ON i.id = si.item_id WHERE si.reception_id = $1`, [reception.id]);
    for (const si of serials.rows) {
      const key = si.serial_number ? `IMEI:${si.serial_number.toUpperCase().replace(/\s+/g, '')}` : `STOCK:${si.id}`;
      await pool.query(
        `INSERT INTO hub_parc.mobilite_devices
           (device_key, imei, serial, type_appareil, famille, modele, statut, last_action, last_action_norm,
            last_statut, last_date, events_count, retours_count, is_actif, serial_item_id, store_id, updated_at)
         VALUES ($1,$2,$2,$3,$4,$5,'stock','Entrée stock','Indéterminé','STOCK',NOW(),0,0,FALSE,$6,$7,NOW())
         ON CONFLICT (device_key) DO UPDATE SET statut='stock', serial_item_id=EXCLUDED.serial_item_id,
            store_id=EXCLUDED.store_id, modele=COALESCE(hub_parc.mobilite_devices.modele,EXCLUDED.modele), updated_at=NOW()`,
        [key, si.serial_number || null, si.category || 'Smartphone', familleFromCategory(si.category), si.label || null, si.id, store.id]);
    }
    res.json({ reception_id: reception.id, ...result });
  } catch (e) { console.error('[mobilite] stockEntry', e); res.status(500).json({ error: e.message }); }
};

// ── Exemplarisation : saisie/maj de l'IMEI d'un appareil en stock ─────────────
exports.setSerial = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const id = parseInt(req.params.id, 10);
    const imei = (req.body?.serial_number || '').trim();
    await receptionService.setSerialNumber(id, store.id, imei || null);
    // Répercute l'IMEI sur le device mobilité lié (et bascule sa clé STOCK: → IMEI:).
    if (imei) {
      const newKey = `IMEI:${imei.toUpperCase().replace(/\s+/g, '')}`;
      await pool.query(
        `UPDATE hub_parc.mobilite_devices SET imei=$1, serial=$1, device_key=$2, updated_at=NOW()
         WHERE serial_item_id=$3 AND NOT EXISTS (SELECT 1 FROM hub_parc.mobilite_devices x WHERE x.device_key=$2 AND x.serial_item_id<>$3)`,
        [imei, newKey, id]).catch(async () => {
          await pool.query(`UPDATE hub_parc.mobilite_devices SET imei=$1, serial=$1, updated_at=NOW() WHERE serial_item_id=$2`, [imei, id]);
        });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const ATTR_STATUT_LABEL = {
  'Dotation': 'DOTATION', 'Mise à disposition': 'MISE A DISPOSITION', 'Prêt': 'PRÊT', 'Cession': 'CESSION',
};
const getDevice = (key) => pgDb.get(`SELECT * FROM hub_parc.mobilite_devices WHERE device_key = $1`, [key]);

// ── Phase 1 — Préparer l'attribution (agent OU service), SANS signature ───────
// L'appareil passe en « en_attribution ». La fiche n'est générée/signée qu'à la
// remise (phase 2, /attributions/:key/deliver).
exports.attribute = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const b = req.body || {};
    const key = b.device_key;
    if (!key) return res.status(400).json({ error: 'Appareil (device_key) requis' });
    const dev = await getDevice(key);
    if (!dev) return res.status(404).json({ error: 'Appareil introuvable' });
    if (dev.statut !== 'stock') return res.status(409).json({ error: 'Appareil non disponible en stock' });

    const reason = b.reason;
    if (!['Dotation', 'Mise à disposition', 'Prêt', 'Cession'].includes(reason)) return res.status(400).json({ error: 'Raison invalide' });
    const targetType = b.target_type === 'service' ? 'service' : 'agent';
    if (reason === 'Prêt' && !b.due_date) return res.status(400).json({ error: 'Date de retour prévisionnelle requise pour un prêt' });

    const agent = b.agent || {};
    const service = b.service || {};
    const attrib = {
      reason, target_type: targetType,
      agent_nom: targetType === 'agent' ? (agent.nom || agent.displayName || '') : (service.label || ''),
      agent_username: agent.username || null,
      agent_email: agent.email || null,
      direction: targetType === 'service' ? (service.direction_label || service.direction || '') : (agent.direction || ''),
      service: targetType === 'service' ? (service.label || '') : (agent.service || ''),
      service_code: service.code || null,
      etat: b.etat || 'NEUF', numero_ligne: b.numero_ligne || '', chargeur: !!b.chargeur, cable: !!b.cable,
      due_date: b.due_date || null, prepared_by: req.user?.username || null, prepared_at: new Date().toISOString(),
    };
    await pool.query(
      `UPDATE hub_parc.mobilite_devices
       SET statut='en_attribution', attrib=$2::jsonb, pret_due_date=$3, numero_ligne=COALESCE(NULLIF($4,''),numero_ligne), updated_at=NOW()
       WHERE device_key=$1`,
      [key, JSON.stringify(attrib), reason === 'Prêt' ? b.due_date : null, attrib.numero_ligne]);
    res.json({ ok: true, device_key: key, statut: 'en_attribution' });
  } catch (e) { console.error('[mobilite] attribute', e); res.status(500).json({ error: e.message }); }
};

// ── Phase 2 — Remise : tech = utilisateur connecté ; signature OU upload fiche ─
exports.deliver = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const key = req.params.key;
    const dev = await getDevice(key);
    if (!dev) return res.status(404).json({ error: 'Appareil introuvable' });
    if (dev.statut !== 'en_attribution') return res.status(409).json({ error: 'Appareil pas en cours d\'attribution' });
    const a = (dev.attrib && typeof dev.attrib === 'object') ? dev.attrib : JSON.parse(dev.attrib || '{}');
    const reason = a.reason || 'Mise à disposition';
    const techNom = req.user?.username || '';
    const designation = dev.modele || dev.type_appareil || 'Téléphone';

    let ficheDocId = null;
    if (req.file) {
      // Fiche signée scannée et uploadée
      const { document } = await docs.uploadDocument({
        file: { buffer: req.file.buffer, originalname: req.file.originalname || `fiche-remise-${key}.pdf`, mimetype: req.file.mimetype || 'application/pdf', size: req.file.size },
        module: 'stocks', entityType: 'mobilite_fiche', entityId: 0, title: `Fiche remise ${designation}`, uploadedBy: req.user?.username,
      });
      ficheDocId = document.id;
    } else {
      // Signature électronique de l'agent → génère la fiche depuis le gabarit remise
      const tpl = (await blTemplateRepo.list('remise'))[0] || (await blTemplateRepo.list()).find(t => t.category === 'remise');
      let recipientSigDoc = null;
      if (req.body?.recipient_signature) {
        try { recipientSigDoc = await saveSignature(req.body.recipient_signature, { entityType: 'mobilite_remise_sig', entityId: 0, uploadedBy: req.user?.username, title: 'Signature-agent' }); }
        catch (e) { console.error('[mobilite] signature remise:', e.message); }
      }
      const scalarMap = {
        '{fiche.numero}': dev.device_key, '{date}': blPdf.fmtDate(new Date()), '{date.remise}': blPdf.fmtDate(new Date()),
        '{store.name}': store.name, '{etat}': a.etat || '', '{raison}': reason,
        '{agent.nom}': a.agent_nom || '', '{agent.service}': a.service || '', '{agent.direction}': a.direction || '', '{agent.email}': a.agent_email || '',
        '{designation}': designation, '{imei}': dev.imei || '', '{numero_serie}': dev.imei || dev.serial || '',
        '{numero_ligne}': dev.numero_ligne || a.numero_ligne || '', '{chargeur}': a.chargeur ? 'X' : '', '{cable}': a.cable ? 'X' : '',
        '{tech.nom}': techNom, '{preparer.name}': techNom, '{date.retour.prev}': a.due_date ? blPdf.fmtDate(a.due_date) : '',
      };
      try {
        ficheDocId = await blPdf.generateFicheFromContext({
          templateId: tpl?.id, scalarMap, lineMaps: [scalarMap],
          recipientSignatureDocId: recipientSigDoc, user: req.user,
          filename: `fiche-remise-${designation}.pdf`, entityType: 'mobilite_fiche', entityId: 0,
        });
      } catch (e) { console.error('[mobilite] génération fiche remise:', e.message); }
    }

    const finalStatut = reason === 'Cession' ? 'sorti' : 'attribue';
    await logMobiliteEvent({
      device_key: key, action: reason, action_norm: reason,
      direction: a.direction || null, service: a.service || null, agent: a.agent_nom || null,
      statut: ATTR_STATUT_LABEL[reason] || reason.toUpperCase(),
      type_appareil: dev.type_appareil, famille: dev.famille || 'telephone', modele: designation,
      imei: dev.imei, serial: dev.serial, numero_ligne: dev.numero_ligne, serial_item_id: dev.serial_item_id,
      store_id: store.id, date_event: new Date(),
    });
    // logMobiliteEvent a posé is_actif/statut « attribue » par défaut ; on force le statut final + fiche + prêt.
    await pool.query(
      `UPDATE hub_parc.mobilite_devices SET statut=$2, fiche_document_id=$3, pret_due_date=$4, attrib=$5::jsonb, updated_at=NOW() WHERE device_key=$1`,
      [key, finalStatut, ficheDocId, reason === 'Prêt' ? (a.due_date || null) : null, JSON.stringify({ ...a, tech: techNom, delivered_at: new Date().toISOString() })]);
    if (dev.serial_item_id) await pool.query(`UPDATE hub_stocks.serial_items SET status='delivered', updated_at=NOW() WHERE id=$1`, [dev.serial_item_id]);

    res.json({ ok: true, device_key: key, statut: finalStatut, fiche_document_id: ficheDocId });
  } catch (e) { console.error('[mobilite] deliver', e); res.status(500).json({ error: e.message }); }
};

// ── Annuler une attribution en cours → retour au stock ────────────────────────
exports.cancelAttribution = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const key = req.params.key;
    await pool.query(`UPDATE hub_parc.mobilite_devices SET statut='stock', attrib='{}'::jsonb, pret_due_date=NULL, updated_at=NOW() WHERE device_key=$1 AND statut='en_attribution'`, [key]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Retour rapide (1-clic) depuis la liste principale → repasse en stock ──────
exports.quickReturn = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const key = req.params.key;
    const dev = await getDevice(key);
    if (!dev) return res.status(404).json({ error: 'Appareil introuvable' });
    await logMobiliteEvent({
      device_key: key, action: 'Retour', action_norm: 'Retour', statut: 'RETOUR',
      type_appareil: dev.type_appareil, famille: dev.famille || 'telephone', modele: dev.modele,
      imei: dev.imei, serial: dev.serial, numero_ligne: dev.numero_ligne, serial_item_id: dev.serial_item_id,
      store_id: store.id, date_event: new Date(),
    });
    // Repasse en stock, sans agent / direction / service.
    await pool.query(
      `UPDATE hub_parc.mobilite_devices
       SET statut='stock', last_direction=NULL, last_service=NULL, last_agent=NULL, dernier_util=NULL,
           attrib='{}'::jsonb, pret_due_date=NULL, fiche_document_id=NULL, updated_at=NOW()
       WHERE device_key=$1`, [key]);
    if (dev.serial_item_id) await pool.query(`UPDATE hub_stocks.serial_items SET status='in_stock', updated_at=NOW() WHERE id=$1`, [dev.serial_item_id]);
    res.json({ ok: true, statut: 'stock' });
  } catch (e) { console.error('[mobilite] quickReturn', e); res.status(500).json({ error: e.message }); }
};

// ── Retour d'un agent → fiche retour ; l'appareil revient en stock ────────────
exports.returnDevice = async (req, res) => {
  const store = await requireMob(req, res, 'operator'); if (!store) return;
  try {
    const b = req.body || {};
    const serialItemId = b.serial_item_id ? parseInt(b.serial_item_id, 10) : null;
    if (!serialItemId) return res.status(400).json({ error: 'Appareil (serial_item_id) requis' });
    const si = await pgDb.get(
      `SELECT si.*, i.label AS item_label, i.model, i.category FROM hub_stocks.serial_items si
       JOIN hub_stocks.items i ON i.id = si.item_id WHERE si.id = $1 AND si.store_id = $2`,
      [serialItemId, store.id]);
    if (!si) return res.status(404).json({ error: 'Appareil introuvable' });

    const tpl = b.template_id
      ? await blTemplateRepo.get(b.template_id)
      : (await blTemplateRepo.list()).find(t => t.category === 'retour');
    const agent = b.agent || {};
    const designation = si.item_label || si.model || 'Téléphone';
    const meta = {
      'etat.retour': b.etat_retour || 'Fonctionnel',
      'agent.direction': agent.direction || '',
      'agent.service': agent.service || '',
      'agent.nom': agent.nom || agent.displayName || '',
      'date.retour': fmtDateFr(b.date_retour),
      designation, imei: si.serial_number || '', numero_ligne: b.numero_ligne || '',
      'motif.retour': b.motif || '',
    };

    let ret = await returnService.prepareReturn({
      store_id: store.id, template_id: tpl?.id || null, meta,
      beneficiary_name: agent.nom || agent.displayName || null,
      beneficiary_email: agent.email || null,
      notes: b.motif || null,
      preparer_signature: b.preparer_signature || null,
      lines: [{ item_id: si.item_id, serial_item_id: si.id, quantity: 1, location_id: si.location_id || null }],
    }, req.user);
    if (b.recipient_signature) {
      ret = await returnService.confirmReturn(ret.id, store.id, b.recipient_signature, req.user);
    }

    await logMobiliteEvent({
      device_key: deviceKeyFor(si), action: 'Retour', action_norm: 'Retour',
      direction: agent.direction || null, service: agent.service || null,
      agent: agent.nom || agent.displayName || null,
      statut: b.etat_retour && /defect/i.test(b.etat_retour) ? 'RETOUR DEFECTUEUX' : 'RETOUR',
      type_appareil: si.category || null, famille: familleFromCategory(si.category),
      modele: designation, imei: si.serial_number || null, serial: si.serial_number || null,
      numero_ligne: b.numero_ligne || null, observations: b.motif || null,
      serial_item_id: si.id, store_id: store.id, delivery_id: ret.id, date_event: b.date_retour || new Date(),
    });
    // Le device repasse en stock (cohérent avec le retour 1-clic).
    await pool.query(`UPDATE hub_parc.mobilite_devices SET statut='stock', last_direction=NULL, last_service=NULL, last_agent=NULL, attrib='{}'::jsonb, pret_due_date=NULL, updated_at=NOW() WHERE device_key=$1`, [deviceKeyFor(si)]);

    res.json({ return_id: ret.id, status: ret.status, fiche_document_id: ret.bl_document_id });
  } catch (e) { console.error('[mobilite] returnDevice', e); res.status(500).json({ error: e.message }); }
};

// ── Téléchargement d'une fiche générée (par id de document) ───────────────────
exports.downloadFiche = async (req, res) => {
  const store = await requireMob(req, res, 'viewer'); if (!store) return;
  try {
    const docId = parseInt(req.params.id, 10);
    if (!docId) return res.status(400).json({ error: 'Document invalide' });
    const v = await docs.readVersion(docId);
    let buf = v?.buffer ? (Buffer.isBuffer(v.buffer) ? v.buffer : Buffer.from(v.buffer))
      : (v?.absolutePath ? await fs.promises.readFile(v.absolutePath) : null);
    if (!buf) return res.status(404).json({ error: 'Fichier introuvable' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fiche-${docId}.pdf"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
