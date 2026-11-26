// ── Module Parc informatique — onglet AD ──────────────────────────────────────
// Alimente la table hub_parc.ad_computers à partir des ordinateurs de l'Active
// Directory (objectClass=computer). La configuration AD (host, bind, base_dn…)
// est lue dans la table SQLite ad_settings (id = 1), comme pour la recherche
// d'usagers AD.
const { pool, getSqlite } = require('../../shared/database');
const { searchADComputers } = require('../../shared/ad_helper');
const { classifyOs } = require('../../shared/os_version_map');
const hubCtrl = require('./parc.hub.controller');
const glpi = require('./glpi-client');
const { getLiveADComputers } = require('./ad_live');

// En mode HUB, seule la dernière synchro fait foi : une machine absente du dernier
// import AD (parce qu'elle a été supprimée de l'annuaire) ne doit plus être listée,
// même si sa ligne existe encore en base (l'import est un upsert qui ne supprime rien).
const LATEST_AD_BATCH = `(SELECT MAX(import_batch) FROM hub_parc.ad_computers)`;

// ── Index du parc GLPI par nom de poste ───────────────────────────────────────
// Les postes AD n'ont ni usager ni état GLPI : on les récupère depuis le parc en
// recoupant par nom de poste. En mode LIVE on interroge GLPI en direct (fiches en
// corbeille incluses, pour afficher « Mis au rebut ») ; en mode HUB on lit la copie
// synchronisée (hub_parc.items).
//   → { usager, glpi_state, glpi_is_deleted, glpi_id }
async function buildParcIndex(source = 'hub') {
  const map = new Map();
  const put = (name, info) => {
    const key = String(name || '').trim().toLowerCase();
    if (key) map.set(key, info);
  };
  try {
    if (source === 'live') {
      const pcs = await glpi.getAll('Computer', { includeDeleted: true });
      for (const p of pcs || []) {
        const usager = p.contact || (p.users_id && String(p.users_id) !== '0' ? p.users_id : '');
        put(p.name, {
          usager: usager ? String(usager) : null,
          glpi_state: p.states_id ? String(p.states_id) : null,
          glpi_is_deleted: p.is_deleted == 1 || p.is_deleted === true,
          glpi_id: p.id != null ? Number(p.id) : null,
        });
      }
      return map;
    }
    const rows = await hubCtrl.loadTypeRows('ordinateurs');
    for (const r of rows || []) {
      put(r.name, {
        usager: r.contact || r.user || null,
        glpi_state: r.state || null,
        glpi_is_deleted: !!r.is_deleted,
        glpi_id: r.id != null ? Number(r.id) : null,
      });
    }
  } catch (e) {
    console.error('[AD] Erreur chargement du parc GLPI:', e.message);
  }
  return map;
}

// Ajoute à une ligne AD les informations du parc GLPI (usager + état GLPI).
function applyParcInfo(row, index) {
  const key = (row.name || '').trim().toLowerCase();
  const info = index.get(key);
  const { family, versionLabel, support } = classifyOs(row.operatingsystem, row.osversion);
  return {
    ...row,
    os_family: family,
    os_version_label: versionLabel,
    os_support: support,
    usager: info?.usager || null,
    glpi_state: info?.glpi_state || null,
    glpi_is_deleted: info?.glpi_is_deleted || false,
    glpi_id: info?.glpi_id ?? null,
  };
}

// Une machine « mise au rebut » (ou supprimée dans GLPI) ne doit pas apparaître
// dans les listes de parc actif (drill-down par OS, KPI cliquables…).
function isRebut(row) {
  if (!row) return false;
  if (row.glpi_is_deleted) return true;
  return /rebut/i.test(String(row.glpi_state || ''));
}

// État de l'import en cours (un seul à la fois, suivi par le frontend).
let _importState = { running: false, count: 0, total: null, batch: null, startedAt: null, finishedAt: null, error: null };

function getImportProgress(req, res) {
  res.json(_importState);
}

async function getADConfig() {
  const db = getSqlite();
  if (!db) return null;
  return db.get('SELECT * FROM ad_settings WHERE id = 1');
}

// ── Liste paginée des ordinateurs AD synchronisés ─────────────────────────────
async function listADComputers(req, res) {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    // Le frontend pagine par "page" ; "offset" reste accepté pour compat/appels directs.
    const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = req.query.offset !== undefined ? (parseInt(req.query.offset, 10) || 0) : (page - 1) * limit;
    const q      = (req.query.q || '').trim();
    const enabled = req.query.enabled; // 'true' | 'false' | undefined
    // Filtres par colonne (en-tête du tableau AD) : chacun est un LIKE insensible à la casse.
    const fName = (req.query.f_name || '').trim();
    const fSam  = (req.query.f_sam || '').trim();
    const fIp   = (req.query.f_ip || '').trim();
    const fOs   = (req.query.f_os || '').trim();
    const fUsager = (req.query.f_usager || '').trim();
    const fUser = (req.query.f_user || '').trim();
    const fOu   = (req.query.f_ou || '').trim();

    const where = [`import_batch = ${LATEST_AD_BATCH}`];
    const params = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(LOWER(name) LIKE ${p} OR LOWER(samaccountname) LIKE ${p} OR LOWER(dnshostname) LIKE ${p} OR LOWER(operatingsystem) LIKE ${p} OR LOWER(description) LIKE ${p})`);
    }
    if (enabled === 'true')  where.push('enabled = TRUE');
    if (enabled === 'false') where.push('enabled = FALSE');
    const addLike = (col, val) => {
      params.push(`%${val.toLowerCase()}%`);
      where.push(`LOWER(${col}) LIKE $${params.length}`);
    };
    if (fName) addLike('name', fName);
    if (fSam)  addLike('samaccountname', fSam);
    if (fIp)   addLike('ipaddress', fIp);
    if (fUser) addLike('lastlogonuser', fUser);
    if (fOu)   addLike('ou', fOu);
    if (fOs) {
      params.push(`%${fOs.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(LOWER(operatingsystem) LIKE ${p} OR LOWER(osversion) LIKE ${p})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Tri (colonnes du tableau AD). Les valeurs inconnues retombent sur le nom.
    const sortMap = {
      name: 'name', samaccountname: 'samaccountname', ipaddress: 'ipaddress',
      operatingsystem: 'operatingsystem', os_version_label: 'operatingsystem',
      lastlogon: 'lastlogon', lastlogonuser: 'lastlogonuser', ou: 'ou', enabled: 'enabled',
    };
    const sortCol = sortMap[String(req.query.sort || 'name').toLowerCase()] || 'name';
    const sortDir = String(req.query.order || req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const orderSql = `ORDER BY ${sortCol} ${sortDir} NULLS LAST`;

    // L'usager (gestion de parc) n'est pas une colonne SQL de ad_computers : filtrer
    // dessus demande de recouper avec hub_parc.items d'abord, donc on charge tout ce
    // qui correspond aux autres filtres puis on filtre/pagine en mémoire.
    if (fUsager) {
      const allRes = await pool.query(
        `SELECT id, cn, name, samaccountname, dnshostname, ipaddress, operatingsystem, osversion,
                lastlogon, lastlogonuser, description, whencreated, enabled, distinguishedname, ou,
                import_batch, first_seen, updated_at
         FROM hub_parc.ad_computers ${whereSql}
         ${orderSql}`,
        params
      );
      const parcIndex = await buildParcIndex('hub');
      const needle = fUsager.toLowerCase();
      const enriched = allRes.rows
        .map(row => applyParcInfo(row, parcIndex))
        .filter(row => (row.usager || '').toLowerCase().includes(needle));
      return res.json({ total: enriched.length, rows: enriched.slice(offset, offset + limit) });
    }

    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM hub_parc.ad_computers ${whereSql}`, params);
    params.push(limit); const limitP = `$${params.length}`;
    params.push(offset); const offsetP = `$${params.length}`;
    const rowsRes = await pool.query(
      `SELECT id, cn, name, samaccountname, dnshostname, ipaddress, operatingsystem, osversion,
              lastlogon, lastlogonuser, description, whencreated, enabled, distinguishedname, ou,
              import_batch, first_seen, updated_at
       FROM hub_parc.ad_computers ${whereSql}
       ${orderSql}
       LIMIT ${limitP} OFFSET ${offsetP}`,
      params
    );
    const parcIndex = await buildParcIndex('hub');
    const rows = rowsRes.rows.map(row => applyParcInfo(row, parcIndex));
    res.json({ total: totalRes.rows[0].n, rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Répartition par famille d'OS (Windows 10/11/Server…) avec détail des versions ──
// (build → version marketing, ex: 19045 → "22H2"). Voir shared/os_version_map.js.
// Fonctionne sur des lignes { operatingsystem, osversion, n } : utilisée telle quelle
// pour l'AD en direct (LIVE) comme pour la copie locale (HUB).
function buildOsFamilyBreakdown(rows) {
  const families = new Map();
  for (const row of rows) {
    const n = row.n != null ? Number(row.n) : 1;
    const { family, versionLabel, sortKey, isServer, support } = classifyOs(row.operatingsystem, row.osversion);
    if (!families.has(family)) families.set(family, { family, total: 0, isServer, versions: new Map() });
    const f = families.get(family);
    f.total += n;
    const key = versionLabel;
    if (!f.versions.has(key)) f.versions.set(key, { label: versionLabel, count: 0, sortKey, support });
    f.versions.get(key).count += n;
  }
  return [...families.values()]
    .map(f => ({
      family: f.family,
      total: f.total,
      isServer: f.isServer,
      versions: [...f.versions.values()].sort((a, b) => b.sortKey - a.sortKey),
    }))
    .sort((a, b) => b.total - a.total);
}

async function computeOsFamilyBreakdown() {
  const r = await pool.query(`
    SELECT operatingsystem, osversion, COUNT(*)::int AS n
    FROM hub_parc.ad_computers
    WHERE import_batch = ${LATEST_AD_BATCH}
    GROUP BY operatingsystem, osversion
  `);
  return buildOsFamilyBreakdown(r.rows);
}

// ── Liste des postes appartenant à une famille d'OS (et éventuellement une version) ──
// Utilisé par le bouton "Voir" du tableau de répartition par OS.
async function listComputersByOs(req, res) {
  try {
    const family = (req.query.family || '').trim();
    const version = (req.query.version || '').trim();
    if (!family) return res.status(400).json({ message: 'Paramètre family requis' });

    const r = await pool.query(`
      SELECT id, name, samaccountname, dnshostname, ipaddress, operatingsystem, osversion,
             lastlogon, lastlogonuser, ou, enabled
      FROM hub_parc.ad_computers
      WHERE import_batch = ${LATEST_AD_BATCH}
    `);
    const parcIndex = await buildParcIndex('hub');
    let rows = r.rows
      .map(row => ({ row, cls: classifyOs(row.operatingsystem, row.osversion) }))
      .filter(({ cls }) => cls.family === family && (!version || cls.versionLabel === version))
      .map(({ row }) => applyParcInfo(row, parcIndex))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Les machines mises au rebut dans GLPI ne font pas partie du parc actif :
    // on ne les liste pas dans le détail par OS (les KPI, eux, restent inchangés).
    const before = rows.length;
    rows = rows.filter(r => !isRebut(r));
    res.json({ total: rows.length, excluded_rebut: before - rows.length, rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Statistiques rapides (compteurs, dernière synchro) ────────────────────────
async function adStats(req, res) {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int                                   AS total,
        COUNT(*) FILTER (WHERE enabled)::int            AS enabled,
        COUNT(*) FILTER (WHERE NOT enabled)::int        AS disabled,
        MAX(updated_at)                                 AS last_sync
      FROM hub_parc.ad_computers
      WHERE import_batch = ${LATEST_AD_BATCH}
    `);
    const os = await pool.query(`
      SELECT COALESCE(operatingsystem, 'Inconnu') AS os, COUNT(*)::int AS n
      FROM hub_parc.ad_computers
      WHERE import_batch = ${LATEST_AD_BATCH}
      GROUP BY operatingsystem
      ORDER BY n DESC
      LIMIT 15
    `);
    const byOsFamily = await computeOsFamilyBreakdown();
    // Rafraîchit le snapshot du jour à chaque consultation (pas seulement à l'import),
    // pour que l'historique démarre dès la première visite de la page.
    if (r.rows[0].total > 0) snapshotOsBreakdown().catch(() => {});
    res.json({ ...r.rows[0], by_os: os.rows, by_os_family: byOsFamily, import: _importState });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Historique de la répartition des OS (évolution dans le temps) ─────────────
async function getOsHistory(req, res) {
  try {
    const r = await pool.query(`
      SELECT snapshot_date::text AS date, family, SUM(count)::int AS total
      FROM hub_parc.ad_os_snapshots
      WHERE snapshot_date >= CURRENT_DATE - INTERVAL '365 days'
      GROUP BY snapshot_date, family
      ORDER BY snapshot_date ASC
    `);
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Snapshot du jour : capture la répartition actuelle par famille/version d'OS,
// appelé après chaque import AD réussi pour construire l'historique d'évolution.
async function snapshotOsBreakdown() {
  try {
    const breakdown = await computeOsFamilyBreakdown();
    const today = new Date().toISOString().split('T')[0];
    for (const f of breakdown) {
      for (const v of f.versions) {
        await pool.query(
          `INSERT INTO hub_parc.ad_os_snapshots (snapshot_date, family, version_label, count)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (snapshot_date, family, version_label) DO UPDATE SET count = EXCLUDED.count`,
          [today, f.family, v.label, v.count]
        );
      }
    }
  } catch (error) {
    console.error('[AD] Erreur snapshot répartition OS:', error.message);
  }
}

// ── Import : énumère l'AD et upsert dans hub_parc.ad_computers ─────────────────
// Logique pure (sans req/res) pour pouvoir être appelée aussi bien depuis la
// route HTTP que depuis le cron de synchro quotidienne (voir server.js).
async function runADImport() {
  if (_importState.running) {
    return { alreadyRunning: true };
  }

  const cfg = await getADConfig();
  if (!cfg || !cfg.host) {
    return { error: 'Active Directory non configuré (ad_settings).' };
  }

  const batch = `ad-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  _importState = { running: true, count: 0, total: null, batch, startedAt: new Date().toISOString(), finishedAt: null, error: null };

  // Tourne en tâche de fond : l'appelant (route HTTP ou cron) n'attend pas la fin.
  (async () => {
    try {
      const computers = await searchADComputers(cfg, {
        onProgress: (n) => { _importState.count = n; }
      });
      _importState.total = computers.length;

      let written = 0;
      for (const c of computers) {
        // samAccountName est la clé d'unicité (upsert) : on ignore les rares
        // entrées sans sAMAccountName.
        if (!c.samaccountname) continue;
        await pool.query(
          `INSERT INTO hub_parc.ad_computers
             (cn, name, samaccountname, dnshostname, operatingsystem, osversion,
              lastlogon, description, whencreated, enabled, distinguishedname, ou,
              import_batch, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW())
           ON CONFLICT (samaccountname) DO UPDATE SET
              cn = EXCLUDED.cn,
              name = EXCLUDED.name,
              dnshostname = EXCLUDED.dnshostname,
              operatingsystem = EXCLUDED.operatingsystem,
              osversion = EXCLUDED.osversion,
              lastlogon = EXCLUDED.lastlogon,
              description = EXCLUDED.description,
              whencreated = EXCLUDED.whencreated,
              enabled = EXCLUDED.enabled,
              distinguishedname = EXCLUDED.distinguishedname,
              ou = EXCLUDED.ou,
              import_batch = EXCLUDED.import_batch,
              updated_at = NOW()`,
          [c.cn, c.name, c.samaccountname, c.dnshostname, c.operatingsystem, c.osversion,
           c.lastlogon, c.description, c.whencreated, c.enabled, c.distinguishedname, c.ou, batch]
        );
        written++;
        _importState.count = written;
      }

      _importState.running = false;
      _importState.finishedAt = new Date().toISOString();
      _importState.count = written;
      console.log(`[AD] Import terminé : ${written} ordinateur(s) (batch ${batch}).`);
      await snapshotOsBreakdown();
    } catch (error) {
      _importState.running = false;
      _importState.error = error.message;
      _importState.finishedAt = new Date().toISOString();
      console.error('[AD] Erreur import ordinateurs:', error.message);
    }
  })();

  return { started: true, batch };
}

async function importADComputers(req, res) {
  const result = await runADImport();
  if (result.alreadyRunning) return res.status(409).json({ message: 'Un import est déjà en cours.', state: _importState });
  if (result.error) return res.status(503).json({ message: result.error });
  res.status(202).json({ message: 'Import démarré', batch: result.batch });
}

// ════════════════════════════════════════════════════════════════════════════════
// ── LIVE : interrogation DIRECTE de l'Active Directory (aucune copie locale) ──
// L'annuaire est énuméré par LDAP (objectClass=computer) à la demande, via le
// module partagé ad_live.js. Seules les machines PRÉSENTES dans l'AD sont
// remontées : pas de trace des postes supprimés de l'annuaire, contrairement à
// la copie locale (upsert qui ne supprime jamais de ligne).
// ════════════════════════════════════════════════════════════════════════════════

// Filtres / tri / pagination en mémoire (mêmes paramètres que la version HUB).
function filterLiveADRows(rows, query) {
  let out = rows.slice();
  const q = String(query.q || '').trim().toLowerCase();
  if (q) {
    out = out.filter(r => [r.name, r.samaccountname, r.dnshostname, r.operatingsystem, r.osversion, r.description]
      .some(v => v && String(v).toLowerCase().includes(q)));
  }
  if (query.enabled === 'true') out = out.filter(r => r.enabled === true);
  if (query.enabled === 'false') out = out.filter(r => r.enabled === false);
  const like = (field, val) => {
    if (!val) return;
    const needle = String(val).toLowerCase();
    out = out.filter(r => r[field] && String(r[field]).toLowerCase().includes(needle));
  };
  like('name', query.f_name);
  like('samaccountname', query.f_sam);
  like('ipaddress', query.f_ip);
  like('lastlogonuser', query.f_user);
  like('ou', query.f_ou);
  like('usager', query.f_usager);
  if (query.f_os) {
    const needle = String(query.f_os).toLowerCase();
    out = out.filter(r => [r.operatingsystem, r.osversion, r.os_version_label]
      .some(v => v && String(v).toLowerCase().includes(needle)));
  }
  return out;
}

function sortLiveADRows(rows, query) {
  const allowed = new Set(['name', 'samaccountname', 'ipaddress', 'operatingsystem', 'os_version_label', 'lastlogon', 'lastlogonuser', 'usager', 'ou', 'enabled']);
  const col = allowed.has(String(query.sort || 'name')) ? String(query.sort || 'name') : 'name';
  const dir = String(query.order || query.dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  const val = (r) => {
    if (col === 'lastlogon') { const d = r.lastlogon ? new Date(r.lastlogon).getTime() : 0; return d || 0; }
    if (col === 'enabled') return r.enabled ? 1 : 0;
    return String(r[col] == null ? '' : r[col]).toLowerCase();
  };
  return rows.slice().sort((a, b) => {
    const av = val(a); const bv = val(b);
    if (av === '' && bv !== '') return 1;   // NULLS LAST
    if (bv === '' && av !== '') return -1;
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

async function listADComputersLive(req, res) {
  try {
    const { rows: adRows, fetchedAt, cached } = await getLiveADComputers({ refresh: req.query.refresh === '1' });
    const parcIndex = await buildParcIndex('live');
    let rows = adRows.map(row => applyParcInfo(row, parcIndex));
    rows = sortLiveADRows(filterLiveADRows(rows, req.query), req.query);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = req.query.offset !== undefined ? (parseInt(req.query.offset, 10) || 0) : (page - 1) * limit;
    res.json({
      source: 'live', total: rows.length, rows: rows.slice(offset, offset + limit),
      fetched_at: new Date(fetchedAt).toISOString(), cached,
    });
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
}

async function listComputersByOsLive(req, res) {
  try {
    const family = String(req.query.family || '').trim();
    const version = String(req.query.version || '').trim();
    if (!family) return res.status(400).json({ message: 'Paramètre family requis' });
    const { rows: adRows } = await getLiveADComputers({ refresh: req.query.refresh === '1' });
    const parcIndex = await buildParcIndex('live');
    const rows = adRows
      .map(row => ({ row, cls: classifyOs(row.operatingsystem, row.osversion) }))
      .filter(({ cls }) => cls.family === family && (!version || cls.versionLabel === version))
      .map(({ row }) => applyParcInfo(row, parcIndex))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    // Pas de machines mises au rebut dans la liste du parc actif.
    const before = rows.length;
    const filtered = rows.filter(r => !isRebut(r));
    res.json({ source: 'live', total: filtered.length, excluded_rebut: before - filtered.length, rows: filtered });
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
}

async function adStatsLive(req, res) {
  try {
    const { rows, fetchedAt, cached } = await getLiveADComputers({ refresh: req.query.refresh === '1' });
    const total = rows.length;
    const enabled = rows.filter(r => r.enabled).length;
    const byOs = new Map();
    for (const r of rows) {
      const k = r.operatingsystem || 'Inconnu';
      byOs.set(k, (byOs.get(k) || 0) + 1);
    }
    const by_os = [...byOs.entries()]
      .map(([os, n]) => ({ os, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 15);
    res.json({
      source: 'live',
      total, enabled, disabled: total - enabled,
      last_sync: new Date(fetchedAt).toISOString(),
      by_os,
      by_os_family: buildOsFamilyBreakdown(rows),
      import: null,
      cached,
    });
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
}

module.exports = {
  listADComputers, adStats, getOsHistory, listComputersByOs, importADComputers, runADImport, getImportProgress,
  // LIVE (AD direct)
  listADComputersLive, listComputersByOsLive, adStatsLive,
};
