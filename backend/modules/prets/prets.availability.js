// ─── Calcul de disponibilité / chevauchement pour le module Prêts ─────────────
// La capacité d'un matériel n'est pas un nombre fixe : c'est la somme des lots
// d'arrivée (hub_prets.equipment_arrivals) dont la date d'arrivée est atteinte —
// un lot commandé mais pas encore livré n'entre pas dans la capacité tant que sa
// date n'est pas passée. La capacité est donc une fonction croissante du temps.
//
// Le délai de battement (buffer_hours, réglable dans hub_prets.settings) est
// appliqué APRÈS la date de fin de chaque prêt actif : deux réservations d'un
// même matériel se chevauchent si [start, end + buffer[ de l'une croise
// [start, end + buffer[ de l'autre.
const { pgDb } = require('../../shared/database');

async function getBufferHours() {
  const row = await pgDb.get('SELECT buffer_hours FROM hub_prets.settings WHERE id = 1');
  return Number(row?.buffer_hours) || 0;
}

// Capacité (somme des lots arrivés) d'un matériel à une date donnée.
async function capacityAtDate(equipmentId, date) {
  const row = await pgDb.get(
    `SELECT COALESCE(SUM(quantity),0)::int AS capacity
     FROM hub_prets.equipment_arrivals
     WHERE equipment_id = $1 AND arrival_date <= $2::date`,
    [equipmentId, date]
  );
  return Number(row?.capacity) || 0;
}

// Capacité "aujourd'hui" (déjà en stock) — pour l'affichage catalogue.
async function capacityNow(equipmentId) {
  return capacityAtDate(equipmentId, new Date());
}

// Quantité déjà réservée (statuts actifs : confirmed/delivered) sur l'intervalle
// [start_date, end_date] pour un matériel donné, battement inclus.
// excludeLoanId permet d'ignorer un prêt (ex: lors de sa propre modification).
async function reservedQuantity(equipmentId, startDate, endDate, excludeLoanId = null) {
  const bufferHours = await getBufferHours();
  const rows = await pgDb.all(
    `SELECT COALESCE(SUM(quantity),0)::int AS reserved
     FROM hub_prets.loans
     WHERE equipment_id = $1
       AND status IN ('confirmed','delivered')
       AND ($5::int IS NULL OR id <> $5)
       AND start_date < ($3::timestamp + make_interval(hours => $4::int))
       AND (end_date + make_interval(hours => $4::int)) > $2::timestamp`,
    [equipmentId, startDate, endDate, bufferHours, excludeLoanId]
  );
  return { reserved: Number(rows[0]?.reserved) || 0, bufferHours };
}

// Vérifie qu'une quantité demandée est disponible sur la plage donnée. La capacité
// ne pouvant que croître dans le temps (les lots s'ajoutent, ne se retirent jamais),
// son minimum sur la période est sa valeur à start_date — c'est ce plafond qui sert
// de référence pour toute la réservation.
// Retourne { ok, available, totalQuantity, reserved, bufferHours }.
async function checkAvailability(equipmentId, startDate, endDate, quantity, excludeLoanId = null) {
  const equipment = await pgDb.get('SELECT active FROM hub_prets.equipment WHERE id = $1', [equipmentId]);
  if (!equipment) return { ok: false, reason: 'not_found', error: 'Matériel introuvable' };
  if (!equipment.active) return { ok: false, reason: 'inactive', error: 'Matériel désactivé' };
  if (new Date(endDate) <= new Date(startDate)) return { ok: false, reason: 'invalid_dates', error: 'La date de fin doit être postérieure à la date de début' };

  const totalQuantity = await capacityAtDate(equipmentId, startDate);
  const { reserved, bufferHours } = await reservedQuantity(equipmentId, startDate, endDate, excludeLoanId);
  const available = totalQuantity - reserved;
  const ok = available >= Number(quantity);
  return {
    ok,
    available,
    totalQuantity,
    reserved,
    bufferHours,
    // 'insufficient' est le SEUL motif qu'un admin peut forcer (cf.
    // controller.createLoanBatchCore, option allowOverbook) — les autres
    // (matériel introuvable/désactivé, dates invalides) restent bloquants.
    reason: ok ? null : 'insufficient',
    error: ok
      ? null
      : (totalQuantity === 0 ? 'Ce matériel n\'est pas encore en stock à cette date' : `Disponibilité insuffisante (${available} / ${quantity} demandé(s))`),
  };
}

// Calendrier jour par jour sur une plage [from, to] (inclusif) : capacité (avec
// arrivées), quantité réservée et restante pour chaque jour. Utilisé par la vue
// "Calendrier" du back-office.
async function dailyAvailability(equipmentId, fromDate, toDate) {
  const equipment = await pgDb.get('SELECT id FROM hub_prets.equipment WHERE id = $1', [equipmentId]);
  if (!equipment) return [];
  const bufferHours = await getBufferHours();

  const rows = await pgDb.all(
    `SELECT d::date AS day,
            COALESCE((
              SELECT SUM(a.quantity) FROM hub_prets.equipment_arrivals a
              WHERE a.equipment_id = $1 AND a.arrival_date <= d::date
            ), 0)::int AS total,
            COALESCE((
              SELECT SUM(l.quantity) FROM hub_prets.loans l
              WHERE l.equipment_id = $1
                AND l.status IN ('confirmed','delivered')
                AND l.start_date < (d::date + INTERVAL '1 day' + make_interval(hours => $4::int))
                AND (l.end_date + make_interval(hours => $4::int)) > d::date
            ), 0)::int AS reserved
     FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d`,
    [equipmentId, fromDate, toDate, bufferHours]
  );

  return rows.map(r => ({
    date: (r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10)),
    reserved: r.reserved,
    total: r.total,
    remaining: r.total - r.reserved,
  }));
}

function enumerateDays(fromDate, toDate) {
  const days = [];
  const cur = new Date(`${String(fromDate).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(toDate).slice(0, 10)}T00:00:00Z`);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// Vue d'ensemble (calendrier général) : capacité/réservé/restant pour TOUT le
// matériel actif (optionnellement filtré par catégorie) sur une plage de jours —
// utilisée par l'onglet "Vue générale" (semaine/mois) du back-office. Une seule
// passe SQL (arrivées + prêts) puis agrégation en mémoire, plutôt que N requêtes
// corrélées par matériel × jour.
async function gridAvailability(fromDate, toDate, categoryId = null) {
  const bufferHours = await getBufferHours();
  const params = [];
  let where = 'WHERE e.active = TRUE';
  if (categoryId) { params.push(categoryId); where += ` AND e.category_id = $${params.length}`; }
  const equipmentRows = await pgDb.all(`
    SELECT e.id, e.name, e.category_id, c.display_name AS category_display_name,
           COALESCE(c.display_order, 999) AS cat_order, COALESCE(c.name, 'zzz') AS cat_name
    FROM hub_prets.equipment e LEFT JOIN hub_prets.categories c ON c.id = e.category_id
    ${where}
    ORDER BY cat_order ASC, cat_name ASC, e.name ASC
  `, params);

  const days = enumerateDays(fromDate, toDate);
  if (!equipmentRows.length) return { days, equipment: [] };

  const ids = equipmentRows.map(e => e.id);
  const arrivals = await pgDb.all(
    `SELECT equipment_id, quantity, arrival_date::text AS arrival_date FROM hub_prets.equipment_arrivals WHERE equipment_id = ANY($1::int[])`,
    [ids]
  );
  const loans = await pgDb.all(
    `SELECT equipment_id, quantity, start_date, end_date FROM hub_prets.loans
     WHERE equipment_id = ANY($1::int[]) AND status IN ('confirmed','delivered')
       AND start_date < ($3::date + INTERVAL '1 day' + make_interval(hours => $4::int))
       AND (end_date + make_interval(hours => $4::int)) > $2::date`,
    [ids, fromDate, toDate, bufferHours]
  );

  const arrivalsByEq = new Map();
  for (const a of arrivals) {
    if (!arrivalsByEq.has(a.equipment_id)) arrivalsByEq.set(a.equipment_id, []);
    arrivalsByEq.get(a.equipment_id).push({ qty: Number(a.quantity), date: String(a.arrival_date).slice(0, 10) });
  }
  const loansByEq = new Map();
  for (const l of loans) {
    if (!loansByEq.has(l.equipment_id)) loansByEq.set(l.equipment_id, []);
    loansByEq.get(l.equipment_id).push({
      qty: Number(l.quantity),
      start: new Date(l.start_date),
      end: new Date(new Date(l.end_date).getTime() + bufferHours * 3600 * 1000),
    });
  }

  const equipment = equipmentRows.map(eq => {
    const arr = arrivalsByEq.get(eq.id) || [];
    const lns = loansByEq.get(eq.id) || [];
    const cells = {};
    for (const day of days) {
      const dayStart = new Date(`${day}T00:00:00Z`);
      const dayEnd = new Date(`${day}T23:59:59.999Z`);
      const total = arr.filter(a => a.date <= day).reduce((s, a) => s + a.qty, 0);
      const reserved = lns.filter(l => l.start < dayEnd && l.end > dayStart).reduce((s, l) => s + l.qty, 0);
      cells[day] = { total, reserved, remaining: total - reserved };
    }
    return { id: eq.id, name: eq.name, category_id: eq.category_id, category_name: eq.category_display_name || 'Sans catégorie', cells };
  });

  return { days, equipment };
}

module.exports = { getBufferHours, capacityAtDate, capacityNow, reservedQuantity, checkAvailability, dailyAvailability, gridAvailability };
