// ── Synchronisation GLPI 10 → hub_parc ─────────────────────────────────────────
// Récupère TOUTES les informations nécessaires pour reproduire en mode HUB les mêmes
// listes, KPIs et fiches que le mode LIVE : item complet (raw) + Infocom + OS + réseau,
// pour les 6 types d'équipements. Les sous-éléments sont récupérés en masse (un appel
// chacun) puis indexés, ce qui évite des milliers de requêtes unitaires.
const { pool, getSqlite } = require('../../shared/database');
const { searchADUsersByQuery, deriveEmailFromUsager } = require('../../shared/ad_helper');
const glpi = require('./glpi-client');
const { core } = require('./parc.live.controller');

// Tables « legacy » par type (conservées pour /api/parc/stats et /:type)
const LEGACY_TABLE = {
  ordinateurs: 'parc_ordinateurs', moniteurs: 'parc_moniteurs',
  peripheriques: 'parc_peripheriques', imprimantes: 'parc_imprimantes',
};

// ── Mapping legacy (tables par type, schéma historique) ────────────────────────
function mapItem(itemtype, it) {
  const lc = itemtype.toLowerCase();
  const v = (key) => { const x = it[key]; return (x === undefined || x === null || x === '' || typeof x === 'object') ? null : String(x); };
  return {
    glpi_id: it.id, name: v('name'), serial: v('serial'), otherserial: v('otherserial'),
    manufacturer: v('manufacturers_id'), model: v(`${lc}models_id`), type: v(`${lc}types_id`),
    state: v('states_id'), location: v('locations_id'), entity: v('entities_id'),
    user_name: v('users_id'), group_name: v('groups_id'), tech_user: v('users_id_tech'),
    comment: v('comment'), is_deleted: it.is_deleted == 1 || it.is_deleted === true,
    date_creation: v('date_creation'), date_mod: v('date_mod'), raw: JSON.stringify(it),
  };
}

async function upsertLegacy(table, row) {
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

// ── Upsert table unifiée (raw + infocom + os + réseau) ─────────────────────────
async function upsertItem(typeKey, itemtype, it, { infocom, os, network, documents }) {
  const v = (k) => { const x = it[k]; return (x === undefined || x === null || x === '' || typeof x === 'object') ? null : String(x); };
  await pool.query(
    `INSERT INTO hub_parc.items
      (itemtype, glpi_id, type_key, name, serial, otherserial, is_deleted, raw, infocom, os, network, documents, software_count, last_sync)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,NOW())
     ON CONFLICT (itemtype, glpi_id) DO UPDATE SET
       type_key=$3, name=$4, serial=$5, otherserial=$6, is_deleted=$7, raw=$8::jsonb,
       infocom=$9::jsonb, os=$10::jsonb, network=$11::jsonb, documents=$12::jsonb, software_count=$13, last_sync=NOW()`,
    [itemtype, it.id, typeKey, v('name'), v('serial'), v('otherserial'),
     (it.is_deleted == 1 || it.is_deleted === true), JSON.stringify(it),
     infocom ? JSON.stringify(infocom) : null, JSON.stringify(os || []), JSON.stringify(network || []),
     JSON.stringify(documents || []), 0]
  );
}

// Indexe une liste de sous-éléments par `${itemtype}-${items_id}` (tableau ou objet).
function indexBy(rows, asArray, mapFn) {
  const m = new Map();
  for (const r of rows) {
    const k = `${r.itemtype}-${r.items_id}`;
    if (asArray) { if (!m.has(k)) m.set(k, []); m.get(k).push(mapFn ? mapFn(r) : r); }
    else if (!m.has(k)) m.set(k, mapFn ? mapFn(r) : r);
  }
  return m;
}

// État de progression partagé (pour suivi temps réel : barre + compteurs par type)
const _parcSync = {
  running: false, phase: null, current: null,
  total: 0, done: 0,
  types: [], // [{ key, label, recupere, enregistre, erreur? }] — mis à jour à la volée
  startedAt: null, finishedAt: null, message: null, error: null,
};
function resetParcSync() {
  _parcSync.running = true; _parcSync.phase = 'Initialisation'; _parcSync.current = null;
  _parcSync.total = 0; _parcSync.done = 0; _parcSync.types = [];
  _parcSync.startedAt = new Date().toISOString(); _parcSync.finishedAt = null;
  _parcSync.message = null; _parcSync.error = null;
}

// État de progression de la synchro des usagers (résolution e-mail AD)
const _usagerSync = {
  running: false, done: 0, total: 0, found: 0, current: null,
  startedAt: null, finishedAt: null, message: null, error: null,
};
function resetUsagerSync() {
  _usagerSync.running = true; _usagerSync.done = 0; _usagerSync.total = 0; _usagerSync.found = 0;
  _usagerSync.current = null; _usagerSync.startedAt = new Date().toISOString();
  _usagerSync.finishedAt = null; _usagerSync.message = null; _usagerSync.error = null;
}

async function upsertUsager(u) {
  await pool.query(
    `INSERT INTO hub_parc.usagers (key, source_name, ad_username, display_name, email, service, found, last_sync)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (key) DO UPDATE SET
       source_name=$2, ad_username=$3, display_name=$4, email=$5, service=$6, found=$7, last_sync=NOW()`,
    [u.key, u.source_name, u.ad_username, u.display_name, u.email, u.service, u.found]
  );
}

module.exports = {
  getParcSyncProgress: (req, res) => res.json(_parcSync),
  getUsagerSyncProgress: (req, res) => res.json(_usagerSync),

  // ── Proxy de téléchargement d'un document GLPI (images de modèles, pièces jointes) ──
  // Supporte ?token= pour les balises <img src>. Partagé par les modes live et hub.
  downloadDocument: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ message: 'ID invalide' });
      const { data, contentType } = await glpi.downloadDocument(id);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(data);
    } catch (e) {
      res.status(e.status === 404 ? 404 : 500).json({ message: e.message });
    }
  },

  // ── Liste des usagers synchronisés (avec e-mail AD) ───────────────────────
  getUsagers: async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT key, source_name, ad_username, display_name, email, service, found, last_sync
         FROM hub_parc.usagers ORDER BY source_name`
      );
      res.json(r.rows);
    } catch (error) { res.status(500).json({ message: error.message }); }
  },

  // ── Synchronisation des usagers : e-mail résolu via l'AD ──────────────────
  syncUsagers: async (req, res) => {
    if (_usagerSync.running) return res.status(409).json({ message: 'Une synchro usagers est déjà en cours', progress: _usagerSync });
    resetUsagerSync();
    try {
      const db = getSqlite();
      const ad = await db.get('SELECT * FROM ad_settings WHERE id = 1');
      if (!ad || !ad.host || !ad.base_dn) throw new Error('Configuration Active Directory manquante (Admin → AD)');

      // Noms distincts des usagers du parc : champ « Usager » (contact) + « Utilisateur » (users_id).
      const rows = await pool.query(`
        SELECT DISTINCT name FROM (
          SELECT NULLIF(TRIM(raw->>'contact'), '') AS name FROM hub_parc.items
          UNION
          SELECT NULLIF(TRIM(raw->>'users_id'), '') AS name FROM hub_parc.items
        ) s
        WHERE name IS NOT NULL AND LENGTH(name) > 2 AND name !~ '^[0-9]+$'
      `);
      const names = rows.rows.map((r) => r.name);
      _usagerSync.total = names.length;

      for (const name of names) {
        _usagerSync.current = name;
        let entry = { key: name.trim().toLowerCase(), source_name: name, ad_username: null, display_name: null, email: null, service: null, found: false };

        // 1) Valeur du type « login@IVRY » → e-mail déduit directement (sotest@IVRY → sotest@ivry94.fr).
        //    On ne sollicite PAS l'AD pour ces valeurs : cela évite tout blocage et donne l'e-mail exact.
        const derived = deriveEmailFromUsager(name);
        if (derived) {
          entry.email = derived;
          entry.ad_username = name.slice(0, name.indexOf('@')).trim().toLowerCase();
          entry.found = true;
          _usagerSync.found++;
        } else {
          // 2) Sinon, résolution via l'AD (recherche désormais protégée par un garde-temps).
          try {
            const results = await searchADUsersByQuery(name, ad);
            const match = (results || []).find((u) => u.email) || (results || [])[0];
            if (match) {
              entry = {
                key: entry.key, source_name: name,
                ad_username: match.username || null, display_name: match.displayName || null,
                email: match.email || null, service: match.service || null, found: !!match.email,
              };
              if (match.email) _usagerSync.found++;
            }
          } catch (e) { /* usager non résolu */ }
        }
        try { await upsertUsager(entry); } catch (e) { /* ignore */ }
        _usagerSync.done++;
      }

      _usagerSync.message = `Usagers synchronisés : ${_usagerSync.found}/${names.length} e-mails trouvés`;
      res.json({ total: names.length, found: _usagerSync.found, message: _usagerSync.message });
    } catch (error) {
      _usagerSync.error = error.message;
      res.status(500).json({ message: error.message });
    } finally {
      _usagerSync.running = false; _usagerSync.current = null;
      _usagerSync.finishedAt = new Date().toISOString();
    }
  },

  // ── Synchronisation à la demande ──────────────────────────────────────────
  syncParc: async (req, res) => {
    if (_parcSync.running) return res.status(409).json({ message: 'Une synchro est déjà en cours', progress: _parcSync });
    resetParcSync();
    const startedAt = new Date();
    const result = { types: [] };
    let sess;
    try {
      sess = await glpi.openSession();

      // Sous-éléments récupérés en masse (un appel chacun) puis indexés
      _parcSync.phase = 'Récupération des données techniques (garantie, OS, réseau, documents)';
      // expand:false sur les sous-items dont on indexe par items_id :
      // avec expand:true, GLPI remplace items_id (int) par le nom de l'item → clé cassée.
      const [infocomRaw, osRaw, osNamesRaw, netRaw, docLinksRaw, docsRaw] = await Promise.all([
        glpi.fetchAll(sess, 'Infocom',               { expand: false }).catch(() => []),
        glpi.fetchAll(sess, 'Item_OperatingSystem',  { expand: false }).catch(() => []),
        glpi.fetchAll(sess, 'OperatingSystem',       { expand: true  }).catch(() => []),
        glpi.fetchAll(sess, 'NetworkPort',           { expand: false }).catch(() => []),
        glpi.fetchAll(sess, 'Document_Item',         { expand: false }).catch(() => []),
        glpi.fetchAll(sess, 'Document',              { expand: true  }).catch(() => []),
      ]);
      const icIdx = indexBy(infocomRaw, false);
      // OS : résolution du nom via la table OperatingSystem (petite, ~30 entrées)
      const osNameMap = new Map(osNamesRaw.map(o => [o.id, o.name || null]));
      const osIdx = new Map();
      for (const o of osRaw) {
        const k = `${o.itemtype}-${o.items_id}`;
        if (!osIdx.has(k)) osIdx.set(k, []);
        osIdx.get(k).push({
          name: osNameMap.get(o.operatingsystems_id) || null,
          version: o.operatingsystemversions_id != null ? String(o.operatingsystemversions_id) : null,
          arch: o.operatingsystemarchitectures_id != null ? String(o.operatingsystemarchitectures_id) : null,
          kernel: null,
        });
      }
      const netIdx = indexBy(netRaw, true, core.mapPort);
      // Documents : index des fiches par id, puis liens itemtype-items_id → [documents mappés]
      const docById = new Map();
      for (const d of docsRaw) docById.set(d.id, core.mapDoc(d));
      const docIdx = new Map();
      for (const l of docLinksRaw) {
        const k = `${l.itemtype}-${l.items_id}`;
        const doc = docById.get(l.documents_id);
        if (!doc) continue;
        if (!docIdx.has(k)) docIdx.set(k, []);
        docIdx.get(k).push(doc);
      }

      // ── Passe 1 : lecture des listes par type (compteur « récupérés » à la volée) ──
      const buckets = [];
      for (const key of Object.keys(glpi.ITEM_TYPES)) {
        const { itemtype, label } = glpi.ITEM_TYPES[key];
        _parcSync.phase = `Lecture : ${label}`;
        _parcSync.current = label;
        const entry = { key, label, recupere: 0, enregistre: 0 };
        _parcSync.types.push(entry);
        try {
          const items = await glpi.fetchAll(sess, itemtype);
          entry.recupere = items.length;
          _parcSync.total += items.length;
          buckets.push({ key, itemtype, label, items, entry });
        } catch (e) {
          entry.erreur = e.message;
          result.types.push({ type: label, recupere: 0, enregistre: 0, erreur: e.message });
        }
      }

      // ── Passe 2 : import (compteur « importés » + barre done/total à la volée) ──
      _parcSync.phase = 'Import en base';
      for (const b of buckets) {
        _parcSync.current = b.label;
        let ok = 0;
        for (const it of b.items) {
          const k = `${b.itemtype}-${it.id}`;
          try {
            await upsertItem(b.key, b.itemtype, it, { infocom: icIdx.get(k) || null, os: osIdx.get(k) || [], network: netIdx.get(k) || [], documents: docIdx.get(k) || [] });
            if (LEGACY_TABLE[b.key]) await upsertLegacy(LEGACY_TABLE[b.key], mapItem(b.itemtype, it));
            ok++; b.entry.enregistre = ok; _parcSync.done++;
          } catch (e) { /* item ignoré */ }
        }
        result.types.push({ type: b.label, recupere: b.items.length, enregistre: ok });
      }
      await glpi.closeSession(sess);

      result.total = result.types.reduce((s, r) => s + r.enregistre, 0);
      result.message = `Parc synchronisé : ${result.total} équipements`;
      _parcSync.phase = 'Terminé'; _parcSync.message = result.message;
      try { require('./parc.hub.controller').clearHubCache(); } catch (e) { /* ignore */ }
      try {
        await pool.query(
          `INSERT INTO hub_parc.sync_logs (started_at, finished_at, status, details, triggered_by)
           VALUES ($1, NOW(), 'success', $2::jsonb, $3)`,
          [startedAt.toISOString(), JSON.stringify(result), req.user?.username || 'inconnu']
        );
      } catch (e) { /* ignore */ }
      res.json(result);
    } catch (error) {
      if (sess) await glpi.closeSession(sess);
      _parcSync.phase = 'Erreur'; _parcSync.error = error.message;
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
      _parcSync.finishedAt = new Date().toISOString();
    }
  },

  // ── Statistiques (compteurs + dernière synchro) ───────────────────────────
  getStats: async (req, res) => {
    try {
      const counts = {};
      for (const [key, t] of Object.entries(glpi.ITEM_TYPES)) {
        const r = await pool.query(`SELECT COUNT(*)::int n, MAX(last_sync) last FROM hub_parc.items WHERE type_key = $1`, [key]);
        counts[key] = { label: t.label, count: r.rows[0].n, last_sync: r.rows[0].last };
      }
      const totalR = await pool.query(`SELECT COUNT(*)::int n, MAX(last_sync) last FROM hub_parc.items`);
      const last = await pool.query(`SELECT started_at, finished_at, status, triggered_by FROM hub_parc.sync_logs ORDER BY id DESC LIMIT 1`);
      res.json({ counts, total: totalR.rows[0].n, last_sync: totalR.rows[0].last, lastSync: last.rows[0] || null });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // ── Liste legacy (tables par type) — conservé pour compat ─────────────────
  getItems: async (req, res) => {
    try {
      const table = LEGACY_TABLE[req.params.type];
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
