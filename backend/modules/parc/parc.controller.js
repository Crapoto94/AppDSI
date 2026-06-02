const axios = require('axios');
const https = require('https');
const { getSqlite, pool } = require('../../shared/database');

// Types d'équipements synchronisés depuis GLPI 10 → tables hub_parc
const TYPES = [
  { itemtype: 'Computer',   table: 'parc_ordinateurs',    label: 'Ordinateurs' },
  { itemtype: 'Monitor',    table: 'parc_moniteurs',      label: 'Moniteurs' },
  { itemtype: 'Peripheral', table: 'parc_peripheriques',  label: 'Périphériques' },
  { itemtype: 'Printer',    table: 'parc_imprimantes',    label: 'Imprimantes' },
];
const TABLE_BY_KEY = {
  ordinateurs: 'parc_ordinateurs', moniteurs: 'parc_moniteurs',
  peripheriques: 'parc_peripheriques', imprimantes: 'parc_imprimantes',
};

// ── Session apirest GLPI 10 (App-Token + User-Token) ───────────────────────────
async function openSession() {
  const db = getSqlite();
  const s = await db.get('SELECT url, token, user_token, is_enabled FROM glpi10_settings WHERE id = 1');
  if (!s || !s.url) throw new Error('GLPI 10 non configuré (URL manquante)');
  let base = String(s.url).trim().replace(/\/+$/, '');
  if (!base.includes('apirest.php')) base += '/apirest.php';
  const appToken = String(s.token || '').trim();
  const userToken = String(s.user_token || '').trim();
  if (!appToken) throw new Error('App-Token GLPI 10 manquant');
  if (!userToken) throw new Error('User-Token GLPI 10 manquant — renseignez-le dans la config GLPI 10');
  const agent = new https.Agent({ rejectUnauthorized: false });
  const r = await axios.get(`${base}/initSession`, {
    headers: { 'App-Token': appToken, 'Authorization': `user_token ${userToken}` },
    httpsAgent: agent, timeout: 15000, validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data || !r.data.session_token) {
    const detail = Array.isArray(r.data) ? r.data.join(' — ') : (r.data?.message || JSON.stringify(r.data));
    throw new Error(`Connexion GLPI 10 échouée (HTTP ${r.status}) : ${detail}`);
  }
  return { base, appToken, sessionToken: r.data.session_token, agent };
}

async function closeSession(sess) {
  try {
    await axios.get(`${sess.base}/killSession`, {
      headers: { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken },
      httpsAgent: sess.agent, timeout: 5000,
    });
  } catch (e) { /* ignore */ }
}

// ── Récupère tous les items d'un type (pagination via Content-Range) ───────────
async function fetchAll(sess, itemtype) {
  const items = [];
  const step = 200;
  let start = 0;
  while (true) {
    const r = await axios.get(`${sess.base}/${itemtype}`, {
      headers: { 'App-Token': sess.appToken, 'Session-Token': sess.sessionToken },
      params: { expand_dropdowns: true, range: `${start}-${start + step - 1}` },
      httpsAgent: sess.agent, timeout: 30000,
      validateStatus: (s) => s === 200 || s === 206 || s === 404,
    });
    if (r.status === 404) break; // plus de résultats
    const batch = Array.isArray(r.data) ? r.data : [];
    items.push(...batch);
    const cr = r.headers['content-range']; // "items 0-199/1234"
    if (batch.length < step) break;
    if (cr) { const total = parseInt(cr.split('/')[1], 10); if (!isNaN(total) && start + step >= total) break; }
    start += step;
    if (start > 200000) break; // garde-fou
  }
  return items;
}

// ── Mapping d'un item GLPI vers une ligne hub_parc (dropdowns déjà étendus) ────
function mapItem(itemtype, it) {
  const lc = itemtype.toLowerCase();
  const v = (key) => {
    const x = it[key];
    if (x === undefined || x === null || x === '') return null;
    return typeof x === 'object' ? null : String(x);
  };
  return {
    glpi_id: it.id,
    name: v('name'),
    serial: v('serial'),
    otherserial: v('otherserial'),
    manufacturer: v('manufacturers_id'),
    model: v(`${lc}models_id`),
    type: v(`${lc}types_id`),
    state: v('states_id'),
    location: v('locations_id'),
    entity: v('entities_id'),
    user_name: v('users_id'),
    group_name: v('groups_id'),
    tech_user: v('users_id_tech'),
    comment: v('comment'),
    is_deleted: it.is_deleted == 1 || it.is_deleted === true,
    date_creation: v('date_creation'),
    date_mod: v('date_mod'),
    raw: JSON.stringify(it),
  };
}

async function upsert(table, row) {
  await pool.query(
    `INSERT INTO hub_parc.${table}
      (glpi_id, name, serial, otherserial, manufacturer, model, type, state, location, entity,
       user_name, group_name, tech_user, comment, is_deleted, date_creation, date_mod, raw, last_sync)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,NOW())
     ON CONFLICT (glpi_id) DO UPDATE SET
       name=$2, serial=$3, otherserial=$4, manufacturer=$5, model=$6, type=$7, state=$8,
       location=$9, entity=$10, user_name=$11, group_name=$12, tech_user=$13, comment=$14,
       is_deleted=$15, date_creation=$16, date_mod=$17, raw=$18::jsonb, last_sync=NOW()`,
    [row.glpi_id, row.name, row.serial, row.otherserial, row.manufacturer, row.model, row.type,
     row.state, row.location, row.entity, row.user_name, row.group_name, row.tech_user, row.comment,
     row.is_deleted, row.date_creation, row.date_mod, row.raw]
  );
}

// État de progression partagé (pour un éventuel suivi temps réel)
const _parcSync = { running: false, done: 0, total: 0, current: null };

module.exports = {
  getParcSyncProgress: (req, res) => res.json(_parcSync),

  // ── Synchronisation à la demande ──────────────────────────────────────────
  syncParc: async (req, res) => {
    if (_parcSync.running) return res.status(409).json({ message: 'Une synchro est déjà en cours', progress: _parcSync });
    _parcSync.running = true; _parcSync.done = 0; _parcSync.total = 0; _parcSync.current = null;
    const startedAt = new Date();
    const result = { types: [] };
    let sess;
    try {
      sess = await openSession();
      for (const t of TYPES) {
        _parcSync.current = t.label;
        const items = await fetchAll(sess, t.itemtype);
        _parcSync.total += items.length;
        let ok = 0;
        for (const it of items) {
          try { await upsert(t.table, mapItem(t.itemtype, it)); ok++; _parcSync.done++; }
          catch (e) { /* item ignoré */ }
        }
        result.types.push({ type: t.label, table: t.table, recupere: items.length, enregistre: ok });
      }
      await closeSession(sess);

      const total = result.types.reduce((s, r) => s + r.enregistre, 0);
      result.total = total;
      result.message = `Parc synchronisé : ${total} équipements`;

      try {
        await pool.query(
          `INSERT INTO hub_parc.sync_logs (started_at, finished_at, status, details, triggered_by)
           VALUES ($1, NOW(), 'success', $2::jsonb, $3)`,
          [startedAt.toISOString(), JSON.stringify(result), req.user?.username || 'inconnu']
        );
      } catch (e) { /* ignore */ }

      res.json(result);
    } catch (error) {
      if (sess) await closeSession(sess);
      try {
        await pool.query(
          `INSERT INTO hub_parc.sync_logs (started_at, finished_at, status, details, triggered_by)
           VALUES ($1, NOW(), 'error', $2::jsonb, $3)`,
          [startedAt.toISOString(), JSON.stringify({ error: error.message }), req.user?.username || 'inconnu']
        );
      } catch (e) { /* ignore */ }
      res.status(500).json({ message: error.message });
    } finally {
      _parcSync.running = false; _parcSync.current = null;
    }
  },

  // ── Statistiques (compteurs + dernière synchro) ───────────────────────────
  getStats: async (req, res) => {
    try {
      const counts = {};
      for (const t of TYPES) {
        const r = await pool.query(`SELECT COUNT(*)::int n, MAX(last_sync) last FROM hub_parc.${t.table}`);
        counts[t.table] = { label: t.label, count: r.rows[0].n, last_sync: r.rows[0].last };
      }
      const last = await pool.query(`SELECT started_at, finished_at, status, triggered_by FROM hub_parc.sync_logs ORDER BY id DESC LIMIT 1`);
      res.json({ counts, lastSync: last.rows[0] || null });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // ── Liste les équipements d'un type ───────────────────────────────────────
  getItems: async (req, res) => {
    try {
      const table = TABLE_BY_KEY[req.params.type];
      if (!table) return res.status(400).json({ message: 'Type invalide (ordinateurs|moniteurs|peripheriques|imprimantes)' });
      const search = (req.query.q || '').trim();
      const params = [];
      let where = '';
      if (search) {
        params.push(`%${search}%`);
        where = `WHERE name ILIKE $1 OR serial ILIKE $1 OR otherserial ILIKE $1 OR user_name ILIKE $1 OR location ILIKE $1`;
      }
      const rows = await pool.query(
        `SELECT glpi_id, name, serial, otherserial, manufacturer, model, type, state, location, user_name, group_name, tech_user, date_mod
         FROM hub_parc.${table} ${where} ORDER BY name LIMIT 1000`, params
      );
      res.json(rows.rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};
