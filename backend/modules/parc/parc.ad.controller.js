// ── Module Parc informatique — onglet AD ──────────────────────────────────────
// Alimente la table hub_parc.ad_computers à partir des ordinateurs de l'Active
// Directory (objectClass=computer). La configuration AD (host, bind, base_dn…)
// est lue dans la table SQLite ad_settings (id = 1), comme pour la recherche
// d'usagers AD.
const { pool, getSqlite } = require('../../shared/database');
const { searchADComputers } = require('../../shared/ad_helper');

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
    const offset = parseInt(req.query.offset, 10) || 0;
    const q      = (req.query.q || '').trim();
    const enabled = req.query.enabled; // 'true' | 'false' | undefined

    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(LOWER(name) LIKE ${p} OR LOWER(samaccountname) LIKE ${p} OR LOWER(dnshostname) LIKE ${p} OR LOWER(operatingsystem) LIKE ${p} OR LOWER(description) LIKE ${p})`);
    }
    if (enabled === 'true')  where.push('enabled = TRUE');
    if (enabled === 'false') where.push('enabled = FALSE');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM hub_parc.ad_computers ${whereSql}`, params);
    params.push(limit); const limitP = `$${params.length}`;
    params.push(offset); const offsetP = `$${params.length}`;
    const rowsRes = await pool.query(
      `SELECT id, cn, name, samaccountname, dnshostname, ipaddress, operatingsystem, osversion,
              lastlogon, lastlogonuser, description, whencreated, enabled, distinguishedname, ou,
              import_batch, first_seen, updated_at
       FROM hub_parc.ad_computers ${whereSql}
       ORDER BY name ASC
       LIMIT ${limitP} OFFSET ${offsetP}`,
      params
    );
    res.json({ total: totalRes.rows[0].n, rows: rowsRes.rows });
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
    `);
    const os = await pool.query(`
      SELECT COALESCE(operatingsystem, 'Inconnu') AS os, COUNT(*)::int AS n
      FROM hub_parc.ad_computers
      GROUP BY operatingsystem
      ORDER BY n DESC
      LIMIT 15
    `);
    res.json({ ...r.rows[0], by_os: os.rows, import: _importState });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Import : énumère l'AD et upsert dans hub_parc.ad_computers ─────────────────
async function importADComputers(req, res) {
  if (_importState.running) {
    return res.status(409).json({ message: 'Un import est déjà en cours.', state: _importState });
  }

  const cfg = await getADConfig();
  if (!cfg || !cfg.host) {
    return res.status(503).json({ message: 'Active Directory non configuré (ad_settings).' });
  }

  const batch = `ad-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  _importState = { running: true, count: 0, total: null, batch, startedAt: new Date().toISOString(), finishedAt: null, error: null };

  // On répond immédiatement : l'import tourne en arrière-plan, le frontend
  // suit l'avancement via GET /api/parc/ad/import-progress.
  res.status(202).json({ message: 'Import démarré', batch });

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
  } catch (error) {
    _importState.running = false;
    _importState.error = error.message;
    _importState.finishedAt = new Date().toISOString();
    console.error('[AD] Erreur import ordinateurs:', error.message);
  }
}

module.exports = { listADComputers, adStats, importADComputers, getImportProgress };
