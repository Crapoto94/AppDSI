'use strict';

const path = require('path');
const fs = require('fs');
const { pool } = require('../../shared/pg_db');
const storage = require('../../shared/storage');
const smb = require('../../shared/smb_client');
let mammoth; try { mammoth = require('mammoth'); } catch (e) { mammoth = null; }

// Dossier racine des fiches de déploiement. Surchargeable par variable d'env
// (utile en Docker : pointer vers un volume monté, ex. PARC_FICHES_PATH=/data/fiches).
const BASE_PATH_DEFAULT = '\\\\nas-syno05\\editions$\\DSIHUB\\parc\\fiches';
function getFichesBase() {
  const env = (process.env.PARC_FICHES_PATH || '').trim();
  return env || BASE_PATH_DEFAULT;
}

const MIME_TYPES = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc':  'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf':  'application/pdf',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
};
function mimeFor(name) { return MIME_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream'; }

// Normalise un chemin relatif stocké (antislashs Windows) en segments sûrs (anti-traversée).
function normalizeRel(relPath) {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
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
        -- ── UC / PC ─────────────────────────────────────────────────────
        uc.glpi_id        AS parc_glpi_id,
        uc.raw->>'serial' AS parc_serie,
        uc.raw->>'states_id'    AS parc_statut,
        uc.raw->>'locations_id' AS uc_lieu,
        CASE
          WHEN uc.glpi_id IS NULL THEN 'none'
          WHEN f.uc_nouveau_num = uc.name
            AND f.uc_nouveau_serie IS NOT NULL
            AND f.uc_nouveau_serie = (uc.raw->>'serial') THEN 'full'
          WHEN f.uc_nouveau_num = uc.name
            AND (f.uc_nouveau_serie IS NULL OR (uc.raw->>'serial') IS NULL) THEN 'name_only'
          WHEN f.uc_nouveau_num = uc.name
            AND f.uc_nouveau_serie <> (uc.raw->>'serial') THEN 'conflict'
          ELSE 'none'
        END AS match_type,
        CASE
          WHEN uc.glpi_id IS NOT NULL
            AND f.uc_nouveau_num = uc.name
            AND f.uc_nouveau_serie IS NOT NULL
            AND (uc.raw->>'serial') IS NOT NULL
            AND f.uc_nouveau_serie <> (uc.raw->>'serial') THEN true
          ELSE false
        END AS has_conflict,
        -- ── Écran principal ──────────────────────────────────────────────
        ec.raw->>'locations_id' AS ec_lieu,
        ec.raw->>'states_id'    AS ec_statut,
        -- ── Périphérique (serial extrait de autre_designation) ───────────
        split_part(split_part(f.autre_designation,'(',2),')',1) AS periph_serial,
        pe.raw->>'locations_id' AS periph_lieu,
        pe.raw->>'states_id'    AS periph_statut,
        pe.raw->>'name'         AS periph_nom
      FROM hub_deploiements.fiches f
      LEFT JOIN hub_parc.items uc ON uc.name = f.uc_nouveau_num AND NOT uc.is_deleted
      LEFT JOIN hub_parc.items ec ON ec.name = f.ecran1_nouveau_num AND NOT ec.is_deleted
      LEFT JOIN hub_parc.items pe
        ON f.materiel_type = 'PERIPH'
        AND pe.itemtype = 'Peripheral'
        AND NOT pe.is_deleted
        AND pe.raw->>'serial' = split_part(split_part(f.autre_designation,'(',2),')',1)
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
    const rel = normalizeRel(req.query.path);
    if (!rel) return res.status(400).json({ message: 'Paramètre path manquant ou invalide' });

    const base = getFichesBase();
    const filename = path.basename(rel);
    const sendHeaders = () => {
      res.setHeader('Content-Type', mimeFor(filename));
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    };

    // Cas partage Windows (UNC, ex. \\nas-syno05\editions$\…) :
    //  • avec identifiants GED → accès SMB applicatif (fonctionne sur Docker/Linux ET Windows,
    //    y compris pour les partages cachés "xxx$" nécessitant une authentification) ;
    //  • sans identifiants, sous Windows uniquement → accès FS direct (l'OS gère l'auth UNC).
    if (smb.isUncPath(base)) {
      let creds = {};
      try { creds = await storage.getStorageConfig(); } catch (e) { /* config indisponible */ }
      const hasCreds = !!(creds && creds.login && creds.password);

      if (hasCreds) {
        const smbCfg = { root_path: base, login: creds.login, password: creds.password, domain: creds.domain || '' };
        let buffer;
        try { buffer = await smb.readFileRel(smbCfg, rel); }
        catch (err) { return res.status(502).json({ message: `Accès SMB au partage impossible (${err.message}). Vérifiez les identifiants dans Admin → GED.` }); }
        if (!buffer) return res.status(404).json({ message: `Fichier introuvable sur le partage : ${rel}` });
        sendHeaders();
        return res.send(buffer);
      }

      if (process.platform !== 'win32') {
        return res.status(500).json({
          message: `Le dossier des fiches est un partage Windows (${base}) inaccessible en direct sur ce serveur. ` +
                   `Renseignez identifiant/mot de passe du partage dans Admin → GED (accès SMB), ` +
                   `ou montez le partage et définissez PARC_FICHES_PATH vers ce point de montage.`,
        });
      }
      // Windows sans identifiants → tentative d'accès FS direct ci-dessous.
    }

    // Accès filesystem (chemin local/POSIX, lettre de lecteur, ou UNC sous Windows).
    const fullPath = path.join(base, rel.split('/').join(path.sep));
    if (!fs.existsSync(fullPath)) {
      const hint = smb.isUncPath(base)
        ? ` (partage caché nécessitant peut-être une authentification — configurez les identifiants dans Admin → GED)`
        : '';
      return res.status(404).json({ message: `Fichier introuvable : ${fullPath}${hint}` });
    }
    sendHeaders();
    fs.createReadStream(fullPath).pipe(res);
  } catch (e) {
    console.error('[deploiements] file error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/conflicts — incohérences déploiements ↔ parc GLPI
// Trois types :
//   absent_glpi    : PC déployé (PLUS/PLUSMOINS) introuvable dans le parc
//   serie_conflit  : PC trouvé mais numéro de série différent
//   recupere_actif : PC marqué comme récupéré/retiré mais toujours "En service"
// ──────────────────────────────────────────────────────────────────────────────
async function conflicts(req, res) {
  try {
    const client = await pool.connect();
    try {
      const [absent, series, actifs] = await Promise.all([
        // 1. Ordinateurs déployés absents du parc GLPI
        client.query(`
          SELECT DISTINCT ON (f.uc_nouveau_num)
            'absent_glpi'::text AS type_conflit,
            f.uc_nouveau_num AS reference,
            NULL::text AS detail,
            f.date_deploiement,
            f.beneficiaire,
            f.direction,
            f.service,
            f.type_operation,
            f.materiel_type
          FROM hub_deploiements.fiches f
          WHERE f.uc_nouveau_num IS NOT NULL
            AND (f.type_flux IN ('PLUS','PLUSMOINS') OR f.type_flux IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM hub_parc.items i
              WHERE i.name = f.uc_nouveau_num AND NOT i.is_deleted
            )
          ORDER BY f.uc_nouveau_num, f.date_deploiement DESC NULLS LAST
          LIMIT 500
        `),
        // 2. Numéros de série en conflit (déploiement ≠ GLPI)
        client.query(`
          SELECT
            'serie_conflit'::text AS type_conflit,
            f.uc_nouveau_num AS reference,
            'Déploiement: ' || COALESCE(f.uc_nouveau_serie,'—') || ' / GLPI: ' || COALESCE(i.raw->>'serial','—') AS detail,
            f.date_deploiement,
            f.beneficiaire,
            f.direction,
            f.service,
            f.type_operation,
            f.materiel_type
          FROM hub_deploiements.fiches f
          JOIN hub_parc.items i ON i.name = f.uc_nouveau_num AND NOT i.is_deleted
          WHERE f.uc_nouveau_serie IS NOT NULL
            AND (i.raw->>'serial') IS NOT NULL
            AND f.uc_nouveau_serie <> (i.raw->>'serial')
          ORDER BY f.date_deploiement DESC NULLS LAST
          LIMIT 300
        `),
        // 3. Ordinateurs récupérés/retirés toujours "En service" dans GLPI
        client.query(`
          SELECT DISTINCT ON (f.uc_recupere_num)
            'recupere_actif'::text AS type_conflit,
            f.uc_recupere_num AS reference,
            'Statut GLPI: ' || COALESCE(i.raw->>'states_id','—') AS detail,
            f.date_deploiement,
            f.beneficiaire,
            f.direction,
            f.service,
            f.type_operation,
            f.materiel_type
          FROM hub_deploiements.fiches f
          JOIN hub_parc.items i ON i.name = f.uc_recupere_num AND NOT i.is_deleted
          WHERE f.uc_recupere_num IS NOT NULL
            AND (f.type_flux IN ('MOINS','PLUSMOINS') OR f.type_operation ILIKE '%retour%' OR f.type_operation ILIKE '%remplace%')
            AND LOWER(COALESCE(i.raw->>'states_id','')) LIKE '%service%'
          ORDER BY f.uc_recupere_num, f.date_deploiement DESC NULLS LAST
          LIMIT 300
        `),
      ]);

      const all = [
        ...absent.rows.map(r => ({ ...r, type_conflit: 'absent_glpi' })),
        ...series.rows.map(r => ({ ...r, type_conflit: 'serie_conflit' })),
        ...actifs.rows.map(r => ({ ...r, type_conflit: 'recupere_actif' })),
      ].sort((a, b) => {
        const order = { absent_glpi: 0, serie_conflit: 1, recupere_actif: 2 };
        return (order[a.type_conflit] ?? 9) - (order[b.type_conflit] ?? 9);
      });

      return res.json({
        total: all.length,
        by_type: {
          absent_glpi: absent.rows.length,
          serie_conflit: series.rows.length,
          recupere_actif: actifs.rows.length,
        },
        rows: all,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[deploiements] conflicts error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ── Lecture d'un fichier (Buffer), FS ou SMB ──────────────────────────────────
async function readFileBuffer(rel) {
  const base = getFichesBase();
  if (smb.isUncPath(base)) {
    let creds = {};
    try { creds = await storage.getStorageConfig(); } catch (e) {}
    if (creds && creds.login && creds.password) {
      const smbCfg = { root_path: base, login: creds.login, password: creds.password, domain: creds.domain || '' };
      const buf = await smb.readFileRel(smbCfg, rel);
      if (!buf) throw Object.assign(new Error('Fichier introuvable sur le partage'), { status: 404 });
      return buf;
    }
    if (process.platform !== 'win32') throw new Error('Partage UNC inaccessible sans identifiants (configurez-les dans Admin → GED)');
  }
  const fullPath = path.join(base, rel.split('/').join(path.sep));
  if (!fs.existsSync(fullPath)) throw Object.assign(new Error(`Fichier introuvable : ${fullPath}`), { status: 404 });
  return fs.readFileSync(fullPath);
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/preview?path=... — visionneuse inline
//   PDF / images : servi en inline (Content-Disposition: inline)
//   DOCX : converti en HTML via mammoth et renvoyé en text/html
// ──────────────────────────────────────────────────────────────────────────────
async function previewFile(req, res) {
  try {
    const rel = normalizeRel(req.query.path);
    if (!rel) return res.status(400).json({ message: 'Paramètre path manquant' });
    const ext = path.extname(rel).toLowerCase();
    const filename = path.basename(rel);
    const buf = await readFileBuffer(rel);

    // DOCX → HTML
    if ((ext === '.docx' || ext === '.doc') && mammoth) {
      const result = await mammoth.convertToHtml({ buffer: buf });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>body{font-family:system-ui,sans-serif;padding:24px 32px;max-width:860px;margin:0 auto;line-height:1.6;color:#1e293b}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:6px 10px}
        h1,h2,h3{color:#1e293b}img{max-width:100%}</style>
        <title>${filename}</title></head><body>${result.value}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    // PDF, images → inline
    res.setHeader('Content-Type', mimeFor(filename));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(buf);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ message: e.message });
    console.error('[deploiements] preview error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/deploiements/:id — modification d'une fiche
// ──────────────────────────────────────────────────────────────────────────────
async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'ID invalide' });
    const {
      date_deploiement, beneficiaire, direction, service, installateur, type_operation,
      uc_nouveau_num, uc_nouveau_serie, uc_nouveau_modele,
      uc_recupere_num, uc_recupere_serie, uc_recupere_modele,
      ecran1_nouveau_num, ecran1_nouveau_serie, ecran1_nouveau_modele,
      ecran1_recupere_num, ecran2_nouveau_serie,
      materiel_type, annee_materiel, neuf_reco, type_flux, quantite,
      autre_designation, fichier, fichier_lie,
    } = req.body;

    const r = await pool.connect();
    try {
      const result = await r.query(
        `UPDATE hub_deploiements.fiches SET
           date_deploiement   = $1,  beneficiaire      = $2,  direction         = $3,
           service            = $4,  installateur      = $5,  type_operation    = $6,
           uc_nouveau_num     = $7,  uc_nouveau_serie  = $8,  uc_nouveau_modele = $9,
           uc_recupere_num    = $10, uc_recupere_serie = $11, uc_recupere_modele= $12,
           ecran1_nouveau_num = $13, ecran1_nouveau_serie = $14, ecran1_nouveau_modele = $15,
           ecran1_recupere_num= $16, ecran2_nouveau_serie = $17,
           materiel_type      = $18, annee_materiel    = $19, neuf_reco         = $20,
           type_flux          = $21, quantite          = $22, autre_designation = $23,
           fichier            = $24, fichier_lie       = $25
         WHERE id = $26
         RETURNING *`,
        [
          date_deploiement || null, beneficiaire || null, direction || null,
          service || null, installateur || null, type_operation || null,
          uc_nouveau_num || null, uc_nouveau_serie || null, uc_nouveau_modele || null,
          uc_recupere_num || null, uc_recupere_serie || null, uc_recupere_modele || null,
          ecran1_nouveau_num || null, ecran1_nouveau_serie || null, ecran1_nouveau_modele || null,
          ecran1_recupere_num || null, ecran2_nouveau_serie || null,
          materiel_type || null, annee_materiel ? parseInt(annee_materiel) : null, neuf_reco || null,
          type_flux || null, quantite ? parseInt(quantite) : null, autre_designation || null,
          fichier || null, fichier_lie || null,
          id,
        ]
      );
      if (!result.rows.length) return res.status(404).json({ message: 'Fiche introuvable' });
      res.json(result.rows[0]);
    } finally { r.release(); }
  } catch (e) {
    console.error('[deploiements] update error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

module.exports = { list, kpis, matches, glpiProposals, serveFile, previewFile, update, conflicts };
