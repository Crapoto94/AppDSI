'use strict';

const path = require('path');
const fs = require('fs');
const { pool } = require('../../shared/pg_db');

const BASE_PATH_DEFAULT = '\\\\nas-syno05\\editions$\\DSIHUB\\parc\\fiches';

/**
 * Retourne le chemin de base des fiches (depuis ged_settings si dispo, sinon fallback)
 */
async function getBasePath(db) {
  try {
    const row = await db.get('SELECT base_path FROM ged_settings LIMIT 1');
    if (row && row.base_path) return row.base_path;
  } catch (e) { /* pas de table ged_settings */ }
  return BASE_PATH_DEFAULT;
}

/**
 * Nettoie une valeur : trim + null si vide ou 'nan'
 */
function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'nan') return null;
  return s;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/ — liste paginée + filtres
// ──────────────────────────────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const { direction, type_operation, installateur, annee, q, start = 0, limit = 50 } = req.query;
    const off = parseInt(start, 10) || 0;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);

    let where = [];
    let params = [];
    let idx = 1;

    if (direction) { where.push(`f.direction = $${idx++}`); params.push(direction); }
    if (type_operation) { where.push(`f.type_operation = $${idx++}`); params.push(type_operation); }
    if (installateur) { where.push(`f.installateur = $${idx++}`); params.push(installateur); }
    if (annee) { where.push(`EXTRACT(YEAR FROM f.date_deploiement) = $${idx++}`); params.push(parseInt(annee, 10)); }
    if (q) {
      where.push(`(f.beneficiaire ILIKE $${idx} OR f.uc_nouveau_num ILIKE $${idx} OR f.uc_nouveau_serie ILIKE $${idx} OR f.direction ILIKE $${idx} OR f.service ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }

    const wClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const countSql = `SELECT COUNT(*)::int AS total FROM hub_deploiements.fiches f ${wClause}`;
    const dataSql = `
      SELECT
        f.*,
        i.glpi_id AS parc_glpi_id,
        i.name AS parc_name,
        i.raw->>'serial' AS parc_serie,
        i.raw->>'states_id' AS parc_statut,
        CASE
          WHEN i.glpi_id IS NULL THEN 'none'
          WHEN f.uc_nouveau_num = i.name
            AND f.uc_nouveau_serie IS NOT NULL
            AND f.uc_nouveau_serie = (i.raw->>'serial') THEN 'full'
          WHEN f.uc_nouveau_num = i.name
            AND (f.uc_nouveau_serie IS NULL OR (i.raw->>'serial') IS NULL) THEN 'name_only'
          WHEN f.uc_nouveau_num = i.name
            AND f.uc_nouveau_serie <> (i.raw->>'serial') THEN 'conflict'
          ELSE 'none'
        END AS match_type,
        CASE
          WHEN i.glpi_id IS NOT NULL
            AND f.uc_nouveau_num = i.name
            AND f.uc_nouveau_serie IS NOT NULL
            AND (i.raw->>'serial') IS NOT NULL
            AND f.uc_nouveau_serie <> (i.raw->>'serial') THEN true
          ELSE false
        END AS has_conflict
      FROM hub_deploiements.fiches f
      LEFT JOIN hub_parc.items i ON i.name = f.uc_nouveau_num
      ${wClause}
      ORDER BY f.date_deploiement DESC NULLS LAST, f.id DESC
      LIMIT ${lim} OFFSET ${off}
    `;

    // Inline params manually (pool.query uses $N natively)
    const client = await pool.connect();
    try {
      const [cntRes, dataRes] = await Promise.all([
        client.query(countSql, params),
        client.query(dataSql, params),
      ]);
      return res.json({ total: cntRes.rows[0].total, rows: dataRes.rows });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[deploiements] list error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/kpis
// ──────────────────────────────────────────────────────────────────────────────
async function kpis(req, res) {
  try {
    const client = await pool.connect();
    try {
      const [total, byType, byDir, byAnnee, byInstallateur, ficLie, matchStats, conflits] = await Promise.all([
        client.query('SELECT COUNT(*)::int AS n FROM hub_deploiements.fiches'),
        client.query(`SELECT type_operation, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE type_operation IS NOT NULL GROUP BY type_operation ORDER BY n DESC`),
        client.query(`SELECT direction, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE direction IS NOT NULL GROUP BY direction ORDER BY n DESC LIMIT 10`),
        client.query(`SELECT EXTRACT(YEAR FROM date_deploiement)::int AS annee, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE date_deploiement IS NOT NULL GROUP BY 1 ORDER BY 1`),
        client.query(`SELECT installateur, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE installateur IS NOT NULL GROUP BY installateur ORDER BY n DESC LIMIT 10`),
        client.query(`SELECT COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE fichier_lie IS NOT NULL`),
        client.query(`
          SELECT
            COUNT(*)::int AS total_uc,
            SUM(CASE WHEN i.glpi_id IS NOT NULL AND (
                f.uc_nouveau_num = i.name AND f.uc_nouveau_serie IS NOT NULL AND f.uc_nouveau_serie = (i.raw->>'serial')
            ) THEN 1 ELSE 0 END)::int AS match_full,
            SUM(CASE WHEN i.glpi_id IS NOT NULL AND f.uc_nouveau_num = i.name AND NOT (
                f.uc_nouveau_serie IS NOT NULL AND f.uc_nouveau_serie = (i.raw->>'serial')
            ) THEN 1 ELSE 0 END)::int AS match_partial,
            SUM(CASE WHEN i.glpi_id IS NULL THEN 1 ELSE 0 END)::int AS no_match
          FROM hub_deploiements.fiches f
          LEFT JOIN hub_parc.items i ON i.name = f.uc_nouveau_num
          WHERE f.uc_nouveau_num IS NOT NULL
        `),
        client.query(`
          SELECT COUNT(*)::int AS n
          FROM hub_deploiements.fiches f
          JOIN hub_parc.items i ON i.name = f.uc_nouveau_num
          WHERE f.uc_nouveau_serie IS NOT NULL
            AND (i.raw->>'serial') IS NOT NULL
            AND f.uc_nouveau_serie <> (i.raw->>'serial')
        `),
      ]);

      return res.json({
        total: total.rows[0].n,
        by_type: byType.rows,
        by_direction: byDir.rows,
        by_annee: byAnnee.rows,
        by_installateur: byInstallateur.rows,
        nb_fichier_lie: ficLie.rows[0].n,
        match_stats: matchStats.rows[0],
        nb_conflits: conflits.rows[0].n,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[deploiements] kpis error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/matches — conflits uniquement
// ──────────────────────────────────────────────────────────────────────────────
async function matches(req, res) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          f.id, f.fichier, f.date_deploiement, f.beneficiaire, f.direction, f.service,
          f.uc_nouveau_num, f.uc_nouveau_serie, f.uc_nouveau_modele,
          i.raw->>'serial' AS parc_serie,
          i.name AS parc_name,
          i.glpi_id
        FROM hub_deploiements.fiches f
        JOIN hub_parc.items i ON i.name = f.uc_nouveau_num
        WHERE f.uc_nouveau_serie IS NOT NULL
          AND (i.raw->>'serial') IS NOT NULL
          AND f.uc_nouveau_serie <> (i.raw->>'serial')
        ORDER BY f.date_deploiement DESC NULLS LAST
      `);
      return res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[deploiements] matches error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/glpi-proposals — propositions de mise à jour use_date
// ──────────────────────────────────────────────────────────────────────────────
async function glpiProposals(req, res) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          f.id AS fiche_id,
          f.date_deploiement,
          f.beneficiaire,
          f.direction,
          f.uc_nouveau_num,
          f.uc_nouveau_serie,
          f.uc_nouveau_modele,
          i.glpi_id,
          i.name AS parc_name,
          i.raw->>'serial' AS parc_serie,
          i.infocom->>'use_date' AS parc_use_date,
          i.raw->>'states_id' AS parc_statut
        FROM hub_deploiements.fiches f
        JOIN hub_parc.items i ON i.name = f.uc_nouveau_num
        WHERE f.date_deploiement IS NOT NULL
          AND (
            f.uc_nouveau_serie IS NULL
            OR f.uc_nouveau_serie = (i.raw->>'serial')
          )
          AND (
            (i.infocom->>'use_date') IS NULL
            OR (i.infocom->>'use_date')::date > f.date_deploiement + INTERVAL '1 year'
          )
        ORDER BY f.date_deploiement DESC NULLS LAST
        LIMIT 500
      `);
      return res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[deploiements] glpi-proposals error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/file?path=... — proxy fichiers
// ──────────────────────────────────────────────────────────────────────────────
async function serveFile(req, res) {
  try {
    const { path: relPath } = req.query;
    if (!relPath) return res.status(400).json({ message: 'Paramètre path manquant' });

    // Sécurité : pas de traversée de répertoire
    const cleaned = String(relPath).replace(/\.\.[/\\]/g, '');
    const basePath = BASE_PATH_DEFAULT;
    const fullPath = path.join(basePath, cleaned);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Fichier introuvable : ' + fullPath });
    }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf':  'application/pdf',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png':  'image/png',
    };
    const ct = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (e) {
    console.error('[deploiements] file error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

module.exports = { list, kpis, matches, glpiProposals, serveFile };
