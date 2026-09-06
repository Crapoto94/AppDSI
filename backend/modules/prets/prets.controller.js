// ─── Module Prêts de matériel ──────────────────────────────────────────────
// Stock dédié administrable (indépendant du parc GLPI), calendrier de dispo par
// plage de dates (chevauchements bloqués + battement paramétrable), remise/retour
// dématérialisés en réutilisant le moteur signature + PDF de /stocks (même
// pattern que backend/modules/mobilite/mobilite.controller.js).
const { pgDb, getSqlite } = require('../../shared/database');
const storage = require('../../shared/storage');
const fs = require('fs');
const path = require('path');
const docs = require('../../shared/documents.service');
const blPdf = require('../stocks/services/bl-pdf.service');
const { saveSignature } = require('../stocks/services/signature.util');
const blTemplateRepo = require('../stocks/repositories/bl-template.repository');
const availability = require('./prets.availability');

const MODULE = 'prets';

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

async function getUserEmail(username) {
  try {
    const db = getSqlite();
    const user = await db.get('SELECT email FROM users WHERE username = ?', [username]);
    return user?.email || '';
  } catch { return ''; }
}

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val == null ? '' : String(val));
  }
  return result;
}

async function sendMailFromTemplate(slug, to, fallbackSubject, fallbackBodyFn, vars) {
  if (!to || !sendMailFn) return;
  try {
    const db = getSqlite();
    const template = await db.get('SELECT subject, body FROM email_templates WHERE slug = ?', [slug]);
    const subject = template ? renderTemplate(template.subject, vars) : fallbackSubject;
    const body = template ? renderTemplate(template.body, vars) : fallbackBodyFn();
    await sendMailFn(to, subject, body);
  } catch (e) {
    console.error(`[Prets] Error sending ${slug} email:`, e.message);
  }
}

const controller = {};
controller.setSendMail = setSendMail;

// ═══════════════════ CATÉGORIES ═══════════════════

controller.getCategories = async (req, res) => {
  try {
    const rows = await pgDb.all('SELECT * FROM hub_prets.categories ORDER BY display_order, name');
    res.json(rows);
  } catch (e) { console.error('[Prets] getCategories', e); res.status(500).json({ error: e.message }); }
};

controller.addCategory = async (req, res) => {
  try {
    const { name, display_name, icon, display_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const r = await pgDb.run(
      'INSERT INTO hub_prets.categories (name, display_name, icon, display_order) VALUES ($1, $2, $3, $4)',
      [name, display_name || name, icon || null, display_order || 0]
    );
    res.status(201).json({ id: r.lastID });
  } catch (e) { console.error('[Prets] addCategory', e); res.status(500).json({ error: e.message }); }
};

controller.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, display_name, icon, display_order } = req.body;
    await pgDb.run(
      'UPDATE hub_prets.categories SET name = $1, display_name = $2, icon = $3, display_order = $4 WHERE id = $5',
      [name, display_name || name, icon || null, display_order || 0, id]
    );
    res.json({ message: 'Catégorie mise à jour' });
  } catch (e) { console.error('[Prets] updateCategory', e); res.status(500).json({ error: e.message }); }
};

controller.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const used = await pgDb.get('SELECT COUNT(*) AS c FROM hub_prets.equipment WHERE category_id = $1', [id]);
    if (Number(used.c) > 0) return res.status(400).json({ error: `Catégorie utilisée par ${used.c} matériel(s)` });
    await pgDb.run('DELETE FROM hub_prets.categories WHERE id = $1', [id]);
    res.json({ message: 'Catégorie supprimée' });
  } catch (e) { console.error('[Prets] deleteCategory', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ ÉQUIPEMENT ═══════════════════

// La liste inclut, pour chaque matériel : available_now (capacité déjà arrivée,
// pour l'affichage catalogue) et la prochaine arrivée à venir (le cas échéant).
// Si start_date/end_date sont fournis (utilisé par le sélecteur MagApp/DSI une
// fois les dates de réservation choisies), chaque ligne est en plus annotée avec
// `available` = disponibilité réelle sur CETTE période, et only_available=1 ne
// renvoie que le matériel qui en a au moins 1.
controller.getEquipment = async (req, res) => {
  try {
    const { category_id, include_inactive, start_date, end_date, only_available } = req.query;
    const where = [];
    const params = [];
    if (!include_inactive) where.push('e.active = TRUE');
    if (category_id) { params.push(category_id); where.push(`e.category_id = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await pgDb.all(`
      SELECT e.*, c.name AS category_name, c.display_name AS category_display_name,
        (SELECT COUNT(*) FROM hub_prets.equipment_units u WHERE u.equipment_id = e.id) AS units_registered,
        (SELECT COALESCE(SUM(a.quantity),0) FROM hub_prets.equipment_arrivals a WHERE a.equipment_id = e.id AND a.arrival_date <= CURRENT_DATE) AS available_now,
        (SELECT MIN(a.arrival_date) FROM hub_prets.equipment_arrivals a WHERE a.equipment_id = e.id AND a.arrival_date > CURRENT_DATE) AS next_arrival_date,
        (SELECT SUM(a.quantity) FROM hub_prets.equipment_arrivals a WHERE a.equipment_id = e.id
           AND a.arrival_date = (SELECT MIN(a2.arrival_date) FROM hub_prets.equipment_arrivals a2 WHERE a2.equipment_id = e.id AND a2.arrival_date > CURRENT_DATE)
        ) AS next_arrival_quantity
      FROM hub_prets.equipment e
      LEFT JOIN hub_prets.categories c ON c.id = e.category_id
      ${whereSql}
      ORDER BY c.display_order, c.name, e.name
    `, params);

    if (start_date && end_date) {
      await Promise.all(rows.map(async row => {
        const check = await availability.checkAvailability(row.id, start_date, end_date, 1);
        row.available = Math.max(check.available || 0, 0);
      }));
      const filtered = only_available ? rows.filter(r => r.available > 0) : rows;
      return res.json(filtered);
    }

    res.json(rows);
  } catch (e) { console.error('[Prets] getEquipment', e); res.status(500).json({ error: e.message }); }
};

controller.getEquipmentById = async (req, res) => {
  try {
    const row = await pgDb.get(`
      SELECT e.*, c.name AS category_name, c.display_name AS category_display_name
      FROM hub_prets.equipment e LEFT JOIN hub_prets.categories c ON c.id = e.category_id
      WHERE e.id = $1
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Matériel introuvable' });
    row.available_now = await availability.capacityNow(row.id);
    res.json(row);
  } catch (e) { console.error('[Prets] getEquipmentById', e); res.status(500).json({ error: e.message }); }
};

// La quantité initiale saisie à la création crée le premier lot d'arrivée
// (hub_prets.equipment_arrivals) — date par défaut aujourd'hui (déjà en stock),
// ou une date future si le matériel est commandé mais pas encore livré.
controller.addEquipment = async (req, res) => {
  try {
    const { category_id, name, description, total_quantity, arrival_date } = req.body;
    const qty = parseInt(total_quantity, 10) || 0;
    if (!name || qty <= 0) return res.status(400).json({ error: 'Nom et quantité requis' });
    const r = await pgDb.run(
      'INSERT INTO hub_prets.equipment (category_id, name, description, total_quantity) VALUES ($1, $2, $3, $4)',
      [category_id || null, name, description || '', qty]
    );
    await pgDb.run(
      'INSERT INTO hub_prets.equipment_arrivals (equipment_id, quantity, arrival_date, note) VALUES ($1, $2, $3, $4)',
      [r.lastID, qty, arrival_date || new Date().toISOString().slice(0, 10), 'Stock initial']
    );
    res.status(201).json({ id: r.lastID });
  } catch (e) { console.error('[Prets] addEquipment', e); res.status(500).json({ error: e.message }); }
};

// La quantité ne se modifie plus ici directement : elle se pilote via les lots
// d'arrivée (cf. controller.addArrival/updateArrival/deleteArrival), pour garder
// une trace datée de chaque mouvement de stock.
controller.updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id, name, description, active } = req.body;
    await pgDb.run(
      `UPDATE hub_prets.equipment SET category_id = $1, name = $2, description = $3, active = $4, updated_at = NOW() WHERE id = $5`,
      [category_id || null, name, description || '', active !== false, id]
    );
    res.json({ message: 'Matériel mis à jour' });
  } catch (e) { console.error('[Prets] updateEquipment', e); res.status(500).json({ error: e.message }); }
};

// Recalcule la colonne dénormalisée equipment.total_quantity = somme de tous les
// lots (indépendamment de leur date), après toute modification d'un lot.
async function recomputeTotalQuantity(equipmentId) {
  const row = await pgDb.get('SELECT COALESCE(SUM(quantity),0)::int AS total FROM hub_prets.equipment_arrivals WHERE equipment_id = $1', [equipmentId]);
  await pgDb.run('UPDATE hub_prets.equipment SET total_quantity = $1, updated_at = NOW() WHERE id = $2', [row.total, equipmentId]);
}

// ═══════════════════ LOTS D'ARRIVÉE (dates de disponibilité du stock) ═══════════════════

controller.listArrivals = async (req, res) => {
  try {
    const rows = await pgDb.all('SELECT * FROM hub_prets.equipment_arrivals WHERE equipment_id = $1 ORDER BY arrival_date DESC, id DESC', [req.params.id]);
    res.json(rows);
  } catch (e) { console.error('[Prets] listArrivals', e); res.status(500).json({ error: e.message }); }
};

controller.addArrival = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, arrival_date, note } = req.body;
    const qty = parseInt(quantity, 10) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Quantité invalide' });
    const r = await pgDb.run(
      'INSERT INTO hub_prets.equipment_arrivals (equipment_id, quantity, arrival_date, note) VALUES ($1, $2, $3, $4)',
      [id, qty, arrival_date || new Date().toISOString().slice(0, 10), note || null]
    );
    await recomputeTotalQuantity(id);
    res.status(201).json({ id: r.lastID });
  } catch (e) { console.error('[Prets] addArrival', e); res.status(500).json({ error: e.message }); }
};

controller.updateArrival = async (req, res) => {
  try {
    const { arrivalId } = req.params;
    const { quantity, arrival_date, note } = req.body;
    const existing = await pgDb.get('SELECT equipment_id FROM hub_prets.equipment_arrivals WHERE id = $1', [arrivalId]);
    if (!existing) return res.status(404).json({ error: 'Lot introuvable' });
    const qty = parseInt(quantity, 10) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Quantité invalide' });
    await pgDb.run(
      'UPDATE hub_prets.equipment_arrivals SET quantity = $1, arrival_date = $2, note = $3 WHERE id = $4',
      [qty, arrival_date, note || null, arrivalId]
    );
    await recomputeTotalQuantity(existing.equipment_id);
    res.json({ message: 'Lot mis à jour' });
  } catch (e) { console.error('[Prets] updateArrival', e); res.status(500).json({ error: e.message }); }
};

controller.deleteArrival = async (req, res) => {
  try {
    const { arrivalId } = req.params;
    const existing = await pgDb.get('SELECT equipment_id FROM hub_prets.equipment_arrivals WHERE id = $1', [arrivalId]);
    if (!existing) return res.status(404).json({ error: 'Lot introuvable' });
    await pgDb.run('DELETE FROM hub_prets.equipment_arrivals WHERE id = $1', [arrivalId]);
    await recomputeTotalQuantity(existing.equipment_id);
    res.json({ message: 'Lot supprimé' });
  } catch (e) { console.error('[Prets] deleteArrival', e); res.status(500).json({ error: e.message }); }
};

// Vue générale (calendrier tous matériels / toutes catégories) — semaine ou mois.
controller.getAvailabilityGrid = async (req, res) => {
  try {
    const { from, to, category_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis' });
    const grid = await availability.gridAvailability(from, to, category_id || null);
    res.json(grid);
  } catch (e) { console.error('[Prets] getAvailabilityGrid', e); res.status(500).json({ error: e.message }); }
};

controller.deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const used = await pgDb.get(`SELECT COUNT(*) AS c FROM hub_prets.loans WHERE equipment_id = $1 AND status IN ('confirmed','delivered')`, [id]);
    if (Number(used.c) > 0) return res.status(400).json({ error: 'Des prêts actifs existent pour ce matériel' });
    await pgDb.run('DELETE FROM hub_prets.equipment WHERE id = $1', [id]);
    res.json({ message: 'Matériel supprimé' });
  } catch (e) { console.error('[Prets] deleteEquipment', e); res.status(500).json({ error: e.message }); }
};

// Photo du matériel — même pattern GED que designation-images.controller.js
// (stockage unifié storage/<MODULE>/<id>/…, dual-write hub_docs best-effort).
controller.uploadEquipmentImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    const { id } = req.params;
    const equipment = await pgDb.get('SELECT image_path FROM hub_prets.equipment WHERE id = $1', [id]);
    if (!equipment) return res.status(404).json({ error: 'Matériel introuvable' });

    if (req.file.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);
    const saved = await storage.saveFile(MODULE, `equipment-${id}`, req.file);

    if (equipment.image_path && storage.isStoragePath(equipment.image_path)) {
      try { await storage.deleteFile(equipment.image_path); } catch (e) { console.warn('[Prets] cleanup ancienne image:', e.message); }
    }

    await pgDb.run('UPDATE hub_prets.equipment SET image_path = $1, updated_at = NOW() WHERE id = $2', [saved.dbPath, id]);

    try {
      await docs.registerExternalUpload({
        module: MODULE, entityType: 'equipment_image', entityId: id, title: req.file.originalname,
        filename: saved.filename, originalName: req.file.originalname, mimetype: req.file.mimetype,
        size: req.file.size, storageRef: saved.dbPath, uploadedBy: req.user?.username || null,
      });
    } catch (e) { console.warn('[Prets] hub_docs register failed:', e.message); }

    res.json({ message: 'Image mise à jour', image_path: saved.dbPath });
  } catch (e) { console.error('[Prets] uploadEquipmentImage', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ UNITÉS (n° d'inventaire) ═══════════════════

controller.listUnits = async (req, res) => {
  try {
    const rows = await pgDb.all('SELECT * FROM hub_prets.equipment_units WHERE equipment_id = $1 ORDER BY inventory_number', [req.params.id]);
    res.json(rows);
  } catch (e) { console.error('[Prets] listUnits', e); res.status(500).json({ error: e.message }); }
};

controller.addUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { inventory_number } = req.body;
    if (!inventory_number) return res.status(400).json({ error: 'Numéro d\'inventaire requis' });
    const r = await pgDb.run(
      'INSERT INTO hub_prets.equipment_units (equipment_id, inventory_number, status) VALUES ($1, $2, \'available\')',
      [id, String(inventory_number).trim()]
    );
    res.status(201).json({ id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('duplicate')) return res.status(409).json({ error: 'Ce numéro d\'inventaire existe déjà pour ce matériel' });
    console.error('[Prets] addUnit', e); res.status(500).json({ error: e.message });
  }
};

controller.updateUnit = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { status, inventory_number } = req.body;
    const sets = []; const params = [];
    if (status !== undefined) { params.push(status); sets.push(`status = $${params.length}`); }
    if (inventory_number !== undefined) { params.push(inventory_number); sets.push(`inventory_number = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Rien à mettre à jour' });
    params.push(unitId);
    await pgDb.run(`UPDATE hub_prets.equipment_units SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    res.json({ message: 'Unité mise à jour' });
  } catch (e) { console.error('[Prets] updateUnit', e); res.status(500).json({ error: e.message }); }
};

controller.deleteUnit = async (req, res) => {
  try {
    await pgDb.run('DELETE FROM hub_prets.equipment_units WHERE id = $1', [req.params.unitId]);
    res.json({ message: 'Unité supprimée' });
  } catch (e) { console.error('[Prets] deleteUnit', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ RÉGLAGES ═══════════════════

controller.getSettings = async (req, res) => {
  try {
    const row = await pgDb.get('SELECT * FROM hub_prets.settings WHERE id = 1');
    res.json(row || { buffer_hours: 0 });
  } catch (e) { console.error('[Prets] getSettings', e); res.status(500).json({ error: e.message }); }
};

controller.updateSettings = async (req, res) => {
  try {
    const { buffer_hours } = req.body;
    await pgDb.run('UPDATE hub_prets.settings SET buffer_hours = $1, updated_at = NOW() WHERE id = 1', [parseInt(buffer_hours, 10) || 0]);
    res.json({ message: 'Réglages mis à jour' });
  } catch (e) { console.error('[Prets] updateSettings', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ DISPONIBILITÉ ═══════════════════

controller.checkAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, quantity, exclude_loan_id } = req.body;
    if (!start_date || !end_date || !quantity) return res.status(400).json({ error: 'start_date, end_date et quantity requis' });
    const result = await availability.checkAvailability(id, start_date, end_date, quantity, exclude_loan_id || null);
    res.json(result);
  } catch (e) { console.error('[Prets] checkAvailability', e); res.status(500).json({ error: e.message }); }
};

controller.getDailyAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis' });
    const rows = await availability.dailyAvailability(id, from, to);
    res.json(rows);
  } catch (e) { console.error('[Prets] getDailyAvailability', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ PRÊTS (réservations — panier multi-matériel) ═══════════════════

// Un "panier" peut contenir plusieurs matériels différents pour les mêmes dates —
// tous les prêts créés dans le même appel partagent un batch_id (= id du premier
// prêt créé) qui permet de les regrouper à l'affichage (back-office, emails).
// Validation de TOUS les articles avant toute écriture (échec atomique : soit tout
// le panier est réservé, soit rien ne l'est).
async function createLoanBatchCore({ items, user_id, username, email, nom_demandeur, direction, service, motif, start_date, end_date, is_internal, allowOverbook = false }) {
  if (!Array.isArray(items) || items.length === 0) { const err = new Error('Le panier est vide'); err.status = 400; throw err; }

  // Seul un manque de quantité ('insufficient') peut être forcé par un admin
  // (allowOverbook) — matériel introuvable/désactivé ou dates invalides restent
  // bloquants dans tous les cas, y compris côté DSI Hub.
  const overbooked = [];
  for (const item of items) {
    const check = await availability.checkAvailability(item.equipment_id, start_date, end_date, item.quantity);
    if (!check.ok) {
      const eq = await pgDb.get('SELECT name FROM hub_prets.equipment WHERE id = $1', [item.equipment_id]);
      const canForce = allowOverbook && check.reason === 'insufficient';
      if (!canForce) {
        const err = new Error(`${eq?.name || ('Matériel #' + item.equipment_id)} : ${check.error || 'indisponible'}`);
        err.status = 409;
        throw err;
      }
      overbooked.push({ equipment_id: item.equipment_id, name: eq?.name || null, requested: item.quantity, available: check.available });
    }
  }

  const loanIds = [];
  let batchId = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const r = await pgDb.run(
      `INSERT INTO hub_prets.loans
         (equipment_id, quantity, user_id, username, email, nom_demandeur, direction, service, motif, start_date, end_date, status, batch_id, is_internal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed',$12,$13)`,
      [item.equipment_id, item.quantity, user_id || null, username || null, email || null, nom_demandeur || null,
        direction || null, service || null, motif || null, start_date, end_date, batchId, !!is_internal]
    );
    loanIds.push(r.lastID);
    if (i === 0) {
      batchId = r.lastID;
      await pgDb.run('UPDATE hub_prets.loans SET batch_id = $1 WHERE id = $1', [batchId]);
    }
  }
  return { batchId, loanIds, overbooked };
}

// Accepte soit { items: [{equipment_id, quantity}, ...] } (panier), soit l'ancien
// format { equipment_id, quantity } à article unique (compat).
function normalizeItems(body) {
  if (Array.isArray(body.items) && body.items.length) return body.items;
  if (body.equipment_id && body.quantity) return [{ equipment_id: body.equipment_id, quantity: body.quantity }];
  return null;
}

// Création (auto-acceptée) — accessible à tout agent connecté, MagApp comme DSI Hub.
controller.createLoan = async (req, res) => {
  try {
    const { direction, service, motif, start_date, end_date } = req.body;
    const items = normalizeItems(req.body);
    if (!items || !start_date || !end_date || !motif) {
      return res.status(400).json({ error: 'items (au moins un matériel), start_date, end_date et motif sont requis' });
    }
    const username = req.user?.username;
    const email = req.user?.email || (username ? await getUserEmail(username) : '');
    const nom_demandeur = req.user?.displayName || req.body.nom_demandeur || username;

    const { batchId, loanIds } = await createLoanBatchCore({
      items, user_id: req.user?.id ? String(req.user.id) : null, username, email,
      nom_demandeur, direction, service, motif, start_date, end_date, is_internal: false,
    });

    const equipmentIds = items.map(i => Number(i.equipment_id));
    const equipmentRows = await pgDb.all(`SELECT id, name FROM hub_prets.equipment WHERE id = ANY($1::int[])`, [equipmentIds]);
    const nameById = new Map(equipmentRows.map(e => [e.id, e.name]));
    const itemsHtml = items.map(i =>
      `<tr><td style="padding:8px;border:1px solid #e2e8f0">${nameById.get(Number(i.equipment_id)) || ''}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${i.quantity}</td></tr>`
    ).join('');

    await sendMailFromTemplate(
      'pret_confirmation', email,
      `[Prêts] Confirmation de votre réservation n°${batchId}`,
      () => `
        <h2>Réservation de matériel n°${batchId}</h2>
        <p>Bonjour ${nom_demandeur || ''},</p>
        <p>Votre demande de prêt a bien été enregistrée et confirmée.</p>
        <table border="0" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:500px">
          <tr style="background:#003366;color:white"><th style="padding:8px;border:1px solid #003366">Matériel</th><th style="padding:8px;border:1px solid #003366">Qté</th></tr>
          ${itemsHtml}
        </table>
        <p><strong>Du</strong> ${start_date} <strong>au</strong> ${end_date}</p>
        <p><strong>Motif :</strong> ${motif}</p>
        <p>Le retrait se fait auprès de la DSI. Vous serez notifié·e la veille de la date de retour.</p>
      `,
      {
        loan_id: batchId, nom_demandeur, equipment: equipmentRows.map(e => e.name).join(', '),
        quantity: items.reduce((s, i) => s + Number(i.quantity), 0), start_date, end_date, motif, app_name: 'DSI Hub',
      }
    );

    res.status(201).json({ batch_id: batchId, loan_ids: loanIds, message: 'Réservation confirmée' });
  } catch (e) {
    console.error('[Prets] createLoan', e);
    res.status(e.status || 500).json({ error: e.message || 'Erreur lors de la création du prêt' });
  }
};

// Création directe par un technicien — demande téléphonique, OU réservation de
// matériel pour l'usage propre de la DSI (is_internal=true par défaut sur cette route).
controller.adminCreateLoan = async (req, res) => {
  try {
    const { direction, service, motif, start_date, end_date, username, email, nom_demandeur, is_internal, force } = req.body;
    const items = normalizeItems(req.body);
    if (!items || !start_date || !end_date || !motif || !nom_demandeur) {
      return res.status(400).json({ error: 'items (au moins un matériel), start_date, end_date, motif et nom_demandeur sont requis' });
    }
    const { batchId, loanIds, overbooked } = await createLoanBatchCore({
      items, user_id: null, username: username || null, email: email || null,
      nom_demandeur, direction: direction || 'DSI', service: service || 'DSI', motif, start_date, end_date,
      is_internal: is_internal !== false, allowOverbook: !!force,
    });
    res.status(201).json({ batch_id: batchId, loan_ids: loanIds, overbooked, message: 'Réservation créée' });
  } catch (e) {
    console.error('[Prets] adminCreateLoan', e);
    res.status(e.status || 500).json({ error: e.message || 'Erreur lors de la création du prêt' });
  }
};

controller.getMyLoans = async (req, res) => {
  try {
    const rows = await pgDb.all(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id
      WHERE l.user_id = $1 ORDER BY l.start_date DESC
    `, [String(req.user.id)]);
    res.json(rows);
  } catch (e) { console.error('[Prets] getMyLoans', e); res.status(500).json({ error: e.message }); }
};

controller.getAllLoans = async (req, res) => {
  try {
    const { status, overdue } = req.query;
    const where = []; const params = [];
    if (status) { params.push(status); where.push(`l.status = $${params.length}`); }
    if (overdue === '1') where.push(`l.status = 'delivered' AND l.end_date < NOW()`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await pgDb.all(`
      SELECT l.*, e.name AS equipment_name,
        (l.status = 'delivered' AND l.end_date < NOW()) AS is_overdue
      FROM hub_prets.loans l JOIN hub_prets.equipment e ON e.id = l.equipment_id
      ${whereSql}
      ORDER BY l.start_date DESC
    `, params);
    res.json(rows);
  } catch (e) { console.error('[Prets] getAllLoans', e); res.status(500).json({ error: e.message }); }
};

// Vue globale : retours attendus (prêts remis, triés par date de retour).
controller.getUpcomingReturns = async (req, res) => {
  try {
    const rows = await pgDb.all(`
      SELECT l.*, e.name AS equipment_name,
        (l.end_date < NOW()) AS is_overdue
      FROM hub_prets.loans l JOIN hub_prets.equipment e ON e.id = l.equipment_id
      WHERE l.status = 'delivered'
      ORDER BY l.end_date ASC
    `);
    res.json(rows);
  } catch (e) { console.error('[Prets] getUpcomingReturns', e); res.status(500).json({ error: e.message }); }
};

controller.getLoanById = async (req, res) => {
  try {
    const loan = await pgDb.get(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id WHERE l.id = $1
    `, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable' });
    const units = await pgDb.all(`
      SELECT lu.*, u.inventory_number FROM hub_prets.loan_units lu
      JOIN hub_prets.equipment_units u ON u.id = lu.equipment_unit_id
      WHERE lu.loan_id = $1
    `, [req.params.id]);
    res.json({ ...loan, units });
  } catch (e) { console.error('[Prets] getLoanById', e); res.status(500).json({ error: e.message }); }
};

controller.cancelLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const loan = await pgDb.get('SELECT * FROM hub_prets.loans WHERE id = $1', [id]);
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable' });
    if (loan.status !== 'confirmed') return res.status(409).json({ error: 'Seule une réservation non remise peut être annulée' });
    // Un agent ne peut annuler que sa propre réservation ; un admin (route /admin) peut tout annuler.
    if (req.pretsAdmin !== true && String(loan.user_id) !== String(req.user?.id)) {
      return res.status(403).json({ error: 'Vous ne pouvez annuler que vos propres réservations' });
    }
    await pgDb.run(`UPDATE hub_prets.loans SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ message: 'Réservation annulée' });
  } catch (e) { console.error('[Prets] cancelLoan', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ REMISE / RETOUR (dématérialisés) ═══════════════════

function fmtDateFr(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

// Remise du matériel : le technicien scanne les n° d'inventaire (unit_codes, JSON
// stringifié côté client — le endpoint est multipart pour permettre l'upload
// alternatif d'une fiche scannée), puis signature à l'écran OU upload PDF.
controller.deliverLoan = async (req, res) => {
  try {
    const loanId = parseInt(req.params.id, 10);
    const loan = await pgDb.get(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id WHERE l.id = $1
    `, [loanId]);
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable' });
    if (loan.status !== 'confirmed') return res.status(409).json({ error: 'Ce prêt n\'est pas en attente de remise' });

    let unitCodes = [];
    try { unitCodes = JSON.parse(req.body.unit_codes || '[]'); } catch { unitCodes = []; }
    unitCodes = [...new Set(unitCodes.map(c => String(c).trim()).filter(Boolean))];
    if (unitCodes.length !== loan.quantity) {
      return res.status(400).json({ error: `Il faut scanner exactement ${loan.quantity} unité(s) (reçu : ${unitCodes.length})` });
    }

    // Upsert + vérification de dispo de chaque unité scannée (auto-enregistrement
    // si le n° d'inventaire n'existait pas encore).
    const unitIds = [];
    for (const code of unitCodes) {
      let unit = await pgDb.get('SELECT * FROM hub_prets.equipment_units WHERE equipment_id = $1 AND inventory_number = $2', [loan.equipment_id, code]);
      if (!unit) {
        const ins = await pgDb.run(`INSERT INTO hub_prets.equipment_units (equipment_id, inventory_number, status) VALUES ($1, $2, 'available')`, [loan.equipment_id, code]);
        unit = { id: ins.lastID, status: 'available' };
      }
      if (unit.status !== 'available') {
        return res.status(409).json({ error: `L'unité ${code} n'est pas disponible (statut actuel : ${unit.status})` });
      }
      unitIds.push(unit.id);
    }

    const techNom = req.user?.username || '';
    let ficheDocId = null;

    if (req.file) {
      const { document } = await docs.uploadDocument({
        file: { buffer: req.file.buffer, originalname: req.file.originalname || `fiche-remise-pret-${loanId}.pdf`, mimetype: req.file.mimetype || 'application/pdf', size: req.file.size },
        module: 'stocks', entityType: 'pret_fiche', entityId: loanId, title: `Fiche remise ${loan.equipment_name}`, uploadedBy: techNom,
      });
      ficheDocId = document.id;
    } else {
      const tpl = (await blTemplateRepo.list('pret_remise'))[0];
      let recipientSigDoc = null;
      if (req.body?.recipient_signature) {
        try { recipientSigDoc = await saveSignature(req.body.recipient_signature, { entityType: 'pret_remise_sig', entityId: loanId, uploadedBy: techNom, title: 'Signature-emprunteur' }); }
        catch (e) { console.error('[Prets] signature remise:', e.message); }
      }
      if (tpl) {
        const scalarMap = {
          '{fiche.numero}': String(loanId), '{date}': blPdf.fmtDate(new Date()), '{date.remise}': blPdf.fmtDate(new Date()),
          '{materiel}': loan.equipment_name, '{quantite}': String(loan.quantity),
          '{unites}': unitCodes.join(', '), '{motif}': loan.motif || '',
          '{demandeur.nom}': loan.nom_demandeur || '', '{demandeur.direction}': loan.direction || '', '{demandeur.service}': loan.service || '', '{demandeur.email}': loan.email || '',
          '{date.debut}': blPdf.fmtDate(loan.start_date), '{date.retour.prev}': blPdf.fmtDate(loan.end_date),
          '{tech.nom}': techNom, '{preparer.name}': techNom,
        };
        try {
          ficheDocId = await blPdf.generateFicheFromContext({
            templateId: tpl.id, scalarMap, lineMaps: [scalarMap], recipientSignatureDocId: recipientSigDoc,
            user: req.user, filename: `fiche-remise-pret-${loanId}.pdf`, entityType: 'pret_fiche', entityId: loanId,
          });
        } catch (e) { console.error('[Prets] génération fiche remise:', e.message); }
      }
    }

    for (const unitId of unitIds) {
      await pgDb.run(`UPDATE hub_prets.equipment_units SET status = 'loaned' WHERE id = $1`, [unitId]);
      await pgDb.run(`INSERT INTO hub_prets.loan_units (loan_id, equipment_unit_id) VALUES ($1, $2)`, [loanId, unitId]);
    }
    await pgDb.run(
      `UPDATE hub_prets.loans SET status = 'delivered', delivered_by = $1, delivered_at = NOW(), fiche_remise_document_id = $2, updated_at = NOW() WHERE id = $3`,
      [techNom, ficheDocId, loanId]
    );

    res.json({ ok: true, status: 'delivered', fiche_document_id: ficheDocId });
  } catch (e) { console.error('[Prets] deliverLoan', e); res.status(500).json({ error: e.message }); }
};

// Retour du matériel : signature(s), génération de la fiche de retour, libération
// des unités (sauf marquage explicite maintenance/perdu).
controller.returnLoan = async (req, res) => {
  try {
    const loanId = parseInt(req.params.id, 10);
    const loan = await pgDb.get(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id WHERE l.id = $1
    `, [loanId]);
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable' });
    if (loan.status !== 'delivered') return res.status(409).json({ error: 'Ce prêt n\'est pas en cours' });

    const b = req.body || {};
    // Statuts optionnels par unité, ex: { "12": "maintenance", "13": "lost" } (clé = equipment_unit_id)
    let unitStatusOverrides = {};
    try { unitStatusOverrides = JSON.parse(b.unit_status_overrides || '{}'); } catch { unitStatusOverrides = {}; }

    const loanUnits = await pgDb.all(`
      SELECT lu.*, u.inventory_number FROM hub_prets.loan_units lu
      JOIN hub_prets.equipment_units u ON u.id = lu.equipment_unit_id WHERE lu.loan_id = $1
    `, [loanId]);

    const techNom = req.user?.username || '';
    let ficheDocId = null;

    if (req.file) {
      const { document } = await docs.uploadDocument({
        file: { buffer: req.file.buffer, originalname: req.file.originalname || `fiche-retour-pret-${loanId}.pdf`, mimetype: req.file.mimetype || 'application/pdf', size: req.file.size },
        module: 'stocks', entityType: 'pret_fiche', entityId: loanId, title: `Fiche retour ${loan.equipment_name}`, uploadedBy: techNom,
      });
      ficheDocId = document.id;
    } else {
      const tpl = (await blTemplateRepo.list('pret_retour'))[0];
      let recipientSigDoc = null, preparerSigDoc = null;
      if (b.recipient_signature) { try { recipientSigDoc = await saveSignature(b.recipient_signature, { entityType: 'pret_retour_sig', entityId: loanId, uploadedBy: techNom, title: 'Signature-emprunteur' }); } catch (e) { console.error(e.message); } }
      if (b.preparer_signature) { try { preparerSigDoc = await saveSignature(b.preparer_signature, { entityType: 'pret_retour_sig', entityId: loanId, uploadedBy: techNom, title: 'Signature-DSI' }); } catch (e) { console.error(e.message); } }
      if (tpl) {
        const scalarMap = {
          '{fiche.numero}': String(loanId), '{date}': fmtDateFr(new Date()), '{date.retour}': fmtDateFr(b.date_retour || new Date()),
          '{materiel}': loan.equipment_name, '{quantite}': String(loan.quantity),
          '{unites}': loanUnits.map(u => u.inventory_number).join(', '), '{etat.retour}': b.etat_retour || 'Fonctionnel', '{motif.retour}': b.motif || '',
          '{demandeur.nom}': loan.nom_demandeur || '', '{demandeur.direction}': loan.direction || '', '{demandeur.service}': loan.service || '',
          '{tech.nom}': techNom, '{preparer.name}': techNom,
        };
        try {
          ficheDocId = await blPdf.generateFicheFromContext({
            templateId: tpl.id, scalarMap, lineMaps: [scalarMap], preparerSignatureDocId: preparerSigDoc, recipientSignatureDocId: recipientSigDoc,
            user: req.user, filename: `fiche-retour-pret-${loanId}.pdf`, entityType: 'pret_fiche', entityId: loanId,
          });
        } catch (e) { console.error('[Prets] génération fiche retour:', e.message); }
      }
    }

    for (const lu of loanUnits) {
      const override = unitStatusOverrides[String(lu.equipment_unit_id)];
      const newStatus = ['maintenance', 'lost'].includes(override) ? override : 'available';
      await pgDb.run(`UPDATE hub_prets.equipment_units SET status = $1 WHERE id = $2`, [newStatus, lu.equipment_unit_id]);
      await pgDb.run(`UPDATE hub_prets.loan_units SET returned = TRUE WHERE id = $1`, [lu.id]);
    }
    await pgDb.run(
      `UPDATE hub_prets.loans SET status = 'returned', returned_by = $1, returned_at = NOW(), fiche_retour_document_id = $2, updated_at = NOW() WHERE id = $3`,
      [techNom, ficheDocId, loanId]
    );

    res.json({ ok: true, status: 'returned', fiche_document_id: ficheDocId });
  } catch (e) { console.error('[Prets] returnLoan', e); res.status(500).json({ error: e.message }); }
};

// Charge les prêts d'une réservation : soit tout le panier (batch_id), soit un
// prêt isolé sans panier (loan_id) — utilisé par les remises/retours groupés.
async function loadReservationLoans({ batch_id, loan_id }) {
  if (batch_id) {
    return pgDb.all(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id
      WHERE l.batch_id = $1 ORDER BY l.id ASC
    `, [batch_id]);
  }
  if (loan_id) {
    const single = await pgDb.get(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id WHERE l.id = $1
    `, [loan_id]);
    return single ? [single] : [];
  }
  return [];
}

// ─── Remise globale d'une réservation ──────────────────────────────────────
// Traite en un seul appel tous les articles 'confirmed' d'une même réservation
// (panier multi-matériel ou prêt isolé), avec UNE signature et UNE fiche PDF
// listant chaque matériel fourni (gabarit "pret_remise", lignes répétées
// {ligne.materiel}/{ligne.quantite}/{ligne.unites} — cf. bl-pdf.service.js).
controller.deliverBatch = async (req, res) => {
  try {
    const { batch_id, loan_id } = req.body;
    const loans = await loadReservationLoans({ batch_id, loan_id });
    if (!loans.length) return res.status(404).json({ error: 'Réservation introuvable' });
    const pending = loans.filter(l => l.status === 'confirmed');
    if (!pending.length) return res.status(409).json({ error: 'Aucun article de cette réservation n\'est en attente de remise' });

    let unitCodesByLoan = {};
    try { unitCodesByLoan = JSON.parse(req.body.unit_codes_by_loan || '{}'); } catch { unitCodesByLoan = {}; }

    // Valide + verrouille les unités de CHAQUE article avant d'écrire quoi que ce soit
    // (échec atomique : soit toute la remise passe, soit rien n'est modifié).
    const unitIdsByLoan = {};
    for (const loan of pending) {
      let codes = (unitCodesByLoan[loan.id] || []).map(c => String(c).trim()).filter(Boolean);
      codes = [...new Set(codes)];
      if (codes.length !== loan.quantity) {
        return res.status(400).json({ error: `${loan.equipment_name} : il faut scanner exactement ${loan.quantity} unité(s) (reçu : ${codes.length})` });
      }
      const unitIds = [];
      for (const code of codes) {
        let unit = await pgDb.get('SELECT * FROM hub_prets.equipment_units WHERE equipment_id = $1 AND inventory_number = $2', [loan.equipment_id, code]);
        if (!unit) {
          const ins = await pgDb.run(`INSERT INTO hub_prets.equipment_units (equipment_id, inventory_number, status) VALUES ($1, $2, 'available')`, [loan.equipment_id, code]);
          unit = { id: ins.lastID, status: 'available' };
        }
        if (unit.status !== 'available') {
          return res.status(409).json({ error: `${loan.equipment_name} : l'unité ${code} n'est pas disponible (statut actuel : ${unit.status})` });
        }
        unitIds.push(unit.id);
      }
      unitIdsByLoan[loan.id] = unitIds;
    }

    const techNom = req.user?.username || '';
    const first = pending[0];
    const reservationLabel = first.batch_id || first.id;
    let ficheDocId = null;

    if (req.file) {
      const { document } = await docs.uploadDocument({
        file: { buffer: req.file.buffer, originalname: req.file.originalname || `fiche-remise-reservation-${reservationLabel}.pdf`, mimetype: req.file.mimetype || 'application/pdf', size: req.file.size },
        module: 'stocks', entityType: 'pret_fiche', entityId: reservationLabel, title: `Fiche remise réservation #${reservationLabel}`, uploadedBy: techNom,
      });
      ficheDocId = document.id;
    } else {
      const tpl = (await blTemplateRepo.list('pret_remise'))[0];
      let recipientSigDoc = null;
      if (req.body?.recipient_signature) {
        try { recipientSigDoc = await saveSignature(req.body.recipient_signature, { entityType: 'pret_remise_sig', entityId: reservationLabel, uploadedBy: techNom, title: 'Signature-emprunteur' }); }
        catch (e) { console.error('[Prets] signature remise groupée:', e.message); }
      }
      if (tpl) {
        const lineMaps = pending.map(loan => ({
          '{ligne.materiel}': loan.equipment_name, '{ligne.quantite}': String(loan.quantity),
          '{ligne.unites}': (unitCodesByLoan[loan.id] || []).join(', '),
        }));
        const scalarMap = {
          '{fiche.numero}': String(reservationLabel), '{date}': blPdf.fmtDate(new Date()), '{date.remise}': blPdf.fmtDate(new Date()),
          '{motif}': first.motif || '', '{demandeur.nom}': first.nom_demandeur || '', '{demandeur.direction}': first.direction || '',
          '{demandeur.service}': first.service || '', '{demandeur.email}': first.email || '',
          '{date.debut}': blPdf.fmtDate(first.start_date), '{date.retour.prev}': blPdf.fmtDate(first.end_date),
          '{tech.nom}': techNom, '{preparer.name}': techNom,
        };
        try {
          ficheDocId = await blPdf.generateFicheFromContext({
            templateId: tpl.id, scalarMap, lineMaps, recipientSignatureDocId: recipientSigDoc,
            user: req.user, filename: `fiche-remise-reservation-${reservationLabel}.pdf`, entityType: 'pret_fiche', entityId: reservationLabel,
          });
        } catch (e) { console.error('[Prets] génération fiche remise groupée:', e.message); }
      }
    }

    for (const loan of pending) {
      for (const unitId of unitIdsByLoan[loan.id]) {
        await pgDb.run(`UPDATE hub_prets.equipment_units SET status = 'loaned' WHERE id = $1`, [unitId]);
        await pgDb.run(`INSERT INTO hub_prets.loan_units (loan_id, equipment_unit_id) VALUES ($1, $2)`, [loan.id, unitId]);
      }
      await pgDb.run(
        `UPDATE hub_prets.loans SET status = 'delivered', delivered_by = $1, delivered_at = NOW(), fiche_remise_document_id = $2, updated_at = NOW() WHERE id = $3`,
        [techNom, ficheDocId, loan.id]
      );
    }

    res.json({ ok: true, status: 'delivered', fiche_document_id: ficheDocId, loan_ids: pending.map(l => l.id) });
  } catch (e) { console.error('[Prets] deliverBatch', e); res.status(500).json({ error: e.message }); }
};

// ─── Retour global d'une réservation ───────────────────────────────────────
// Symétrique de deliverBatch : traite en un seul appel tous les articles
// 'delivered' d'une même réservation, avec une fiche de retour unique.
controller.returnBatch = async (req, res) => {
  try {
    const { batch_id, loan_id } = req.body;
    const loans = await loadReservationLoans({ batch_id, loan_id });
    if (!loans.length) return res.status(404).json({ error: 'Réservation introuvable' });
    const pending = loans.filter(l => l.status === 'delivered');
    if (!pending.length) return res.status(409).json({ error: 'Aucun article de cette réservation n\'est en cours' });

    const loanUnitsByLoan = {};
    for (const loan of pending) {
      loanUnitsByLoan[loan.id] = await pgDb.all(`
        SELECT lu.*, u.inventory_number FROM hub_prets.loan_units lu
        JOIN hub_prets.equipment_units u ON u.id = lu.equipment_unit_id WHERE lu.loan_id = $1
      `, [loan.id]);
    }

    const b = req.body || {};
    let unitStatusOverrides = {};
    try { unitStatusOverrides = JSON.parse(b.unit_status_overrides || '{}'); } catch { unitStatusOverrides = {}; }

    const techNom = req.user?.username || '';
    const first = pending[0];
    const reservationLabel = first.batch_id || first.id;
    let ficheDocId = null;

    if (req.file) {
      const { document } = await docs.uploadDocument({
        file: { buffer: req.file.buffer, originalname: req.file.originalname || `fiche-retour-reservation-${reservationLabel}.pdf`, mimetype: req.file.mimetype || 'application/pdf', size: req.file.size },
        module: 'stocks', entityType: 'pret_fiche', entityId: reservationLabel, title: `Fiche retour réservation #${reservationLabel}`, uploadedBy: techNom,
      });
      ficheDocId = document.id;
    } else {
      const tpl = (await blTemplateRepo.list('pret_retour'))[0];
      let recipientSigDoc = null, preparerSigDoc = null;
      if (b.recipient_signature) { try { recipientSigDoc = await saveSignature(b.recipient_signature, { entityType: 'pret_retour_sig', entityId: reservationLabel, uploadedBy: techNom, title: 'Signature-emprunteur' }); } catch (e) { console.error(e.message); } }
      if (b.preparer_signature) { try { preparerSigDoc = await saveSignature(b.preparer_signature, { entityType: 'pret_retour_sig', entityId: reservationLabel, uploadedBy: techNom, title: 'Signature-DSI' }); } catch (e) { console.error(e.message); } }
      if (tpl) {
        const lineMaps = pending.map(loan => ({
          '{ligne.materiel}': loan.equipment_name, '{ligne.quantite}': String(loan.quantity),
          '{ligne.unites}': loanUnitsByLoan[loan.id].map(u => u.inventory_number).join(', '),
        }));
        const scalarMap = {
          '{fiche.numero}': String(reservationLabel), '{date}': fmtDateFr(new Date()), '{date.retour}': fmtDateFr(b.date_retour || new Date()),
          '{etat.retour}': b.etat_retour || 'Fonctionnel', '{motif.retour}': b.motif || '',
          '{demandeur.nom}': first.nom_demandeur || '', '{demandeur.direction}': first.direction || '', '{demandeur.service}': first.service || '',
          '{tech.nom}': techNom, '{preparer.name}': techNom,
        };
        try {
          ficheDocId = await blPdf.generateFicheFromContext({
            templateId: tpl.id, scalarMap, lineMaps, preparerSignatureDocId: preparerSigDoc, recipientSignatureDocId: recipientSigDoc,
            user: req.user, filename: `fiche-retour-reservation-${reservationLabel}.pdf`, entityType: 'pret_fiche', entityId: reservationLabel,
          });
        } catch (e) { console.error('[Prets] génération fiche retour groupée:', e.message); }
      }
    }

    for (const loan of pending) {
      for (const lu of loanUnitsByLoan[loan.id]) {
        const override = unitStatusOverrides[String(lu.equipment_unit_id)];
        const newStatus = ['maintenance', 'lost'].includes(override) ? override : 'available';
        await pgDb.run(`UPDATE hub_prets.equipment_units SET status = $1 WHERE id = $2`, [newStatus, lu.equipment_unit_id]);
        await pgDb.run(`UPDATE hub_prets.loan_units SET returned = TRUE WHERE id = $1`, [lu.id]);
      }
      await pgDb.run(
        `UPDATE hub_prets.loans SET status = 'returned', returned_by = $1, returned_at = NOW(), fiche_retour_document_id = $2, updated_at = NOW() WHERE id = $3`,
        [techNom, ficheDocId, loan.id]
      );
    }

    res.json({ ok: true, status: 'returned', fiche_document_id: ficheDocId, loan_ids: pending.map(l => l.id) });
  } catch (e) { console.error('[Prets] returnBatch', e); res.status(500).json({ error: e.message }); }
};

controller.downloadFiche = async (req, res) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: 'Document invalide' });
    const v = await docs.readVersion(docId);
    let buf = v?.buffer ? (Buffer.isBuffer(v.buffer) ? v.buffer : Buffer.from(v.buffer))
      : (v?.absolutePath ? await fs.promises.readFile(v.absolutePath) : null);
    if (!buf) return res.status(404).json({ error: 'Fichier introuvable' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fiche-pret-${docId}.pdf"`);
    res.send(buf);
  } catch (e) { console.error('[Prets] downloadFiche', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ KPIs (widget dashboard + page de gestion) ═══════════════════

controller.getKpis = async (req, res) => {
  try {
    const row = await pgDb.get(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed')::int AS reservations_en_attente,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS prets_en_cours,
        COUNT(*) FILTER (WHERE status = 'delivered' AND end_date < NOW())::int AS prets_en_retard
      FROM hub_prets.loans
    `);
    res.json(row);
  } catch (e) { console.error('[Prets] getKpis', e); res.status(500).json({ error: e.message }); }
};

// ═══════════════════ CRON — rappels & alertes retard ═══════════════════
// Appelé quotidiennement depuis server.js. Envoie un rappel la veille du retour
// (reminder_sent_at) et une alerte de retard une fois le jour J+1 dépassé
// (overdue_notified_at), chacun une seule fois par prêt.
controller.sendRemindersAndOverdueAlerts = async () => {
  try {
    // Rappels J-1 : prêts remis dont la date de retour est demain, pas encore notifiés.
    const dueTomorrow = await pgDb.all(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id
      WHERE l.status = 'delivered' AND l.reminder_sent_at IS NULL
        AND l.end_date::date = (CURRENT_DATE + INTERVAL '1 day')::date
    `);
    for (const loan of dueTomorrow) {
      await sendMailFromTemplate(
        'pret_reminder', loan.email,
        `[Prêts] Retour prévu demain — ${loan.equipment_name}`,
        () => `<p>Bonjour ${loan.nom_demandeur || ''},</p><p>Le retour de « ${loan.equipment_name} » (x${loan.quantity}) est prévu demain (${fmtDateFr(loan.end_date)}). Merci de le rapporter à la DSI.</p>`,
        { equipment: loan.equipment_name, quantity: loan.quantity, end_date: fmtDateFr(loan.end_date), nom_demandeur: loan.nom_demandeur, app_name: 'DSI Hub' }
      );
      await pgDb.run('UPDATE hub_prets.loans SET reminder_sent_at = NOW() WHERE id = $1', [loan.id]);
    }

    // Alertes de retard : prêts remis dont la date de retour est dépassée, pas encore notifiés.
    const overdue = await pgDb.all(`
      SELECT l.*, e.name AS equipment_name FROM hub_prets.loans l
      JOIN hub_prets.equipment e ON e.id = l.equipment_id
      WHERE l.status = 'delivered' AND l.overdue_notified_at IS NULL AND l.end_date < NOW()
    `);
    for (const loan of overdue) {
      await sendMailFromTemplate(
        'pret_overdue', loan.email,
        `[Prêts] Retour en retard — ${loan.equipment_name}`,
        () => `<p>Bonjour ${loan.nom_demandeur || ''},</p><p>Le retour de « ${loan.equipment_name} » (x${loan.quantity}) était prévu le ${fmtDateFr(loan.end_date)} et n'a pas encore été enregistré. Merci de le rapporter dès que possible à la DSI.</p>`,
        { equipment: loan.equipment_name, quantity: loan.quantity, end_date: fmtDateFr(loan.end_date), nom_demandeur: loan.nom_demandeur, app_name: 'DSI Hub' }
      );
      await pgDb.run('UPDATE hub_prets.loans SET overdue_notified_at = NOW() WHERE id = $1', [loan.id]);
    }

    return { reminders: dueTomorrow.length, overdueAlerts: overdue.length };
  } catch (e) {
    console.error('[Prets] sendRemindersAndOverdueAlerts', e);
    return { error: e.message };
  }
};

module.exports = controller;
