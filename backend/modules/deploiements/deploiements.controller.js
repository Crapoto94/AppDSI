'use strict';

const path = require('path');
const fs = require('fs');
const { pool } = require('../../shared/pg_db');
const { getSqlite } = require('../../shared/database');
const { searchADUsersByQuery } = require('../../shared/ad_helper');
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

// Normalise un nom (bénéficiaire) en clé : minuscules, sans accents, espaces compactés.
function normName(v) {
  if (!v) return '';
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Catégorie d'équipement : UNE seule expression SQL, source de vérité partagée
//    par le filtre et par le badge affiché (renvoyée comme colonne `equip_cat`).
// Codes : pc_portable_ecran, pc_fixe_ecran, pc_imp, pc_portable, pc_fixe,
//         imprimante, peripherique, ecran, autre.
const _mt  = `UPPER(TRIM(COALESCE(f.materiel_type,'')))`;
const _ucN = `UPPER(COALESCE(f.uc_nouveau_num,''))`;
const _ucR = `UPPER(COALESCE(f.uc_recupere_num,''))`;
const _ad  = `UPPER(COALESCE(f.autre_designation,''))`;
const _isPortable = `(${_ucN} LIKE 'PO%' OR (${_ucN}='' AND ${_ucR} LIKE 'PO%') OR ${_mt} LIKE 'PO%' OR ${_mt} = 'MACBOOK' OR ${_mt} LIKE 'MACBOOK%')`;
const _isFixe = `(${_ucN} LIKE 'UC%' OR (${_ucN}='' AND ${_ucR} LIKE 'UC%') OR ${_mt} LIKE 'UC%' OR ${_mt} IN ('AIO','IMAC') OR ${_mt} LIKE 'AIO%' OR ${_mt} LIKE 'IMAC%')`;
const _isImp = `(${_mt} IN ('IMP','SCANNER') OR ${_mt} LIKE 'IMP%' OR ${_mt} LIKE '%IMP%' OR ${_mt} LIKE 'SCAN%' OR f.type_operation ILIKE '%imprimante%')`;
const _isPeriph = `(${_mt} IN ('PERIPH','TABLETTE') OR ${_mt} LIKE 'PERIPH%' OR ${_mt} LIKE 'TABLET%' OR ${_mt} LIKE 'VIDEO%' OR ${_ad} LIKE 'PÉRIPH%' OR ${_ad} LIKE 'PERIPH%')`;
const _hasEcran = `(f.ecran1_nouveau_num IS NOT NULL OR f.ecran1_nouveau_serie IS NOT NULL OR f.ecran2_nouveau_serie IS NOT NULL OR f.ecran1_recupere_num IS NOT NULL OR ${_mt} LIKE '%EC%' OR ${_mt} = 'ECRAN' OR ${_ad} LIKE 'ÉCRAN%' OR ${_ad} LIKE 'ECRAN%')`;
const EQUIP_CAT_SQL = `
  CASE
    WHEN ${_isPortable} AND ${_hasEcran} THEN 'pc_portable_ecran'
    WHEN ${_isFixe}     AND ${_hasEcran} THEN 'pc_fixe_ecran'
    WHEN (${_isPortable} OR ${_isFixe}) AND ${_isImp} THEN 'pc_imp'
    WHEN ${_isPortable} THEN 'pc_portable'
    WHEN ${_isFixe}     THEN 'pc_fixe'
    WHEN ${_isImp}      THEN 'imprimante'
    WHEN ${_isPeriph}   THEN 'peripherique'
    WHEN ${_hasEcran}   THEN 'ecran'
    ELSE 'autre'
  END`;
// Familles du filtre (option UI) → codes de catégorie correspondants
const EQUIP_FAMILY = {
  pc_portable:  ['pc_portable', 'pc_portable_ecran'],
  pc_fixe:      ['pc_fixe', 'pc_fixe_ecran'],
  ecran:        ['ecran'],
  imprimante:   ['imprimante', 'pc_imp'],
  peripherique: ['peripherique'],
  autre:        ['autre'],
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/ — liste paginée + filtres
// ──────────────────────────────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const { direction, type_operation, installateur, annee, q, start = 0, limit = 50 } = req.query;
    const off = parseInt(start, 10) || 0;
    const lim = Math.min(parseInt(limit, 10) || 50, 5000);

    // Tri whitelisté : clé front → expression SQL
    const SORT_MAP = {
      date_deploiement: 'f.date_deploiement',
      source: 'f.source',
      equip_cat: `(${EQUIP_CAT_SQL})`,
      lieu: `COALESCE(uc.raw->>'locations_id', ec.raw->>'locations_id', pe.raw->>'locations_id')`,
      beneficiaire: 'f.beneficiaire',
      direction: 'f.direction',
      uc_nouveau_num: 'f.uc_nouveau_num',
      uc_nouveau_modele: 'f.uc_nouveau_modele',
      uc_recupere_num: 'f.uc_recupere_num',
      ecran: `(CASE WHEN f.ecran1_nouveau_num IS NOT NULL OR f.ecran1_nouveau_serie IS NOT NULL OR f.ecran2_nouveau_serie IS NOT NULL THEN 1 ELSE 0 END)`,
      installateur: 'f.installateur',
      type_operation: 'f.type_operation',
    };
    let orderBy = 'f.date_deploiement DESC NULLS LAST, f.id DESC';
    const sortExpr = SORT_MAP[req.query.sort];
    if (sortExpr) {
      const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      orderBy = `${sortExpr} ${dir} NULLS LAST, f.id DESC`;
    }

    let where = [];
    let params = [];
    let idx = 1;

    if (direction) { where.push(`f.direction = $${idx++}`); params.push(direction); }
    // Liste de directions (variantes regroupées côté front) : match insensible à la casse/espaces
    if (req.query.directions) {
      const list = String(req.query.directions).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (list.length) { where.push(`UPPER(TRIM(f.direction)) = ANY($${idx++}::text[])`); params.push(list); }
    }
    if (type_operation) { where.push(`f.type_operation = $${idx++}`); params.push(type_operation); }
    if (installateur) { where.push(`f.installateur = $${idx++}`); params.push(installateur); }
    if (annee) { where.push(`EXTRACT(YEAR FROM f.date_deploiement) = $${idx++}`); params.push(parseInt(annee, 10)); }
    if (req.query.equip) {
      const codes = EQUIP_FAMILY[req.query.equip];
      if (codes) { where.push(`(${EQUIP_CAT_SQL}) = ANY($${idx++}::text[])`); params.push(codes); }
    }
    if (q) {
      where.push(`(f.beneficiaire ILIKE $${idx} OR f.uc_nouveau_num ILIKE $${idx} OR f.uc_nouveau_serie ILIKE $${idx} OR f.direction ILIKE $${idx} OR f.service ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }

    const wClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const countSql = `SELECT COUNT(*)::int AS total FROM hub_deploiements.fiches f ${wClause}`;
    const dataSql = `
      SELECT
        f.*,
        f.glpi_document_id,
        (${EQUIP_CAT_SQL}) AS equip_cat,
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
      -- Jointures LATERAL limitées à 1 ligne : évite la duplication d'affichage
      -- quand plusieurs items du parc portent le même nom. On privilégie l'item
      -- dont le n° de série correspond à celui de la fiche.
      LEFT JOIN LATERAL (
        SELECT * FROM hub_parc.items i
        WHERE i.name = f.uc_nouveau_num AND NOT i.is_deleted
        ORDER BY (CASE WHEN i.raw->>'serial' = f.uc_nouveau_serie THEN 0 ELSE 1 END), i.glpi_id
        LIMIT 1
      ) uc ON true
      LEFT JOIN LATERAL (
        SELECT * FROM hub_parc.items i
        WHERE i.name = f.ecran1_nouveau_num AND NOT i.is_deleted
        ORDER BY (CASE WHEN i.raw->>'serial' = f.ecran1_nouveau_serie THEN 0 ELSE 1 END), i.glpi_id
        LIMIT 1
      ) ec ON true
      LEFT JOIN LATERAL (
        SELECT * FROM hub_parc.items i
        WHERE f.materiel_type = 'PERIPH' AND i.itemtype = 'Peripheral' AND NOT i.is_deleted
          AND i.raw->>'serial' = split_part(split_part(f.autre_designation,'(',2),')',1)
        ORDER BY i.glpi_id
        LIMIT 1
      ) pe ON true
      ${wClause}
      ORDER BY ${orderBy}
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
      const [total, byType, byDir, byAnnee, byAnneeEquip, byInstallateur, ficLie, matchStats, conflits] = await Promise.all([
        client.query('SELECT COUNT(*)::int AS n FROM hub_deploiements.fiches'),
        client.query(`SELECT type_operation, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE type_operation IS NOT NULL GROUP BY type_operation ORDER BY n DESC`),
        client.query(`SELECT direction, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE direction IS NOT NULL GROUP BY direction ORDER BY n DESC LIMIT 10`),
        client.query(`SELECT EXTRACT(YEAR FROM date_deploiement)::int AS annee, COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE date_deploiement IS NOT NULL GROUP BY 1 ORDER BY 1`),
        // Cadence annuelle décomposée par catégorie d'équipement
        client.query(`
          SELECT EXTRACT(YEAR FROM f.date_deploiement)::int AS annee, (${EQUIP_CAT_SQL}) AS cat, COUNT(*)::int AS n
          FROM hub_deploiements.fiches f
          WHERE f.date_deploiement IS NOT NULL
          GROUP BY 1, 2
          ORDER BY 1
        `),
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
        by_annee_equip: byAnneeEquip.rows,
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

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/facets — listes complètes pour les filtres
// (directions + installateurs avec comptes ; les types/années viennent des KPIs)
// ──────────────────────────────────────────────────────────────────────────────
async function facets(req, res) {
  try {
    const client = await pool.connect();
    try {
      const [dirs, insts, types] = await Promise.all([
        client.query(`SELECT direction, COUNT(*)::int n FROM hub_deploiements.fiches WHERE direction IS NOT NULL AND TRIM(direction) <> '' GROUP BY direction ORDER BY n DESC`),
        client.query(`SELECT installateur, COUNT(*)::int n FROM hub_deploiements.fiches WHERE installateur IS NOT NULL AND TRIM(installateur) <> '' GROUP BY installateur ORDER BY n DESC`),
        client.query(`SELECT type_operation, COUNT(*)::int n FROM hub_deploiements.fiches WHERE type_operation IS NOT NULL AND TRIM(type_operation) <> '' GROUP BY type_operation ORDER BY n DESC`),
      ]);
      return res.json({ directions: dirs.rows, installateurs: insts.rows, types: types.rows });
    } finally { client.release(); }
  } catch (e) {
    console.error('[deploiements] facets error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deploiements/installateurs/merge — fusionne des graphies d'installateur
//   body { keep: "mb", merge: ["MB","mm\\mb", …] }
// ──────────────────────────────────────────────────────────────────────────────
async function mergeInstallateurs(req, res) {
  try {
    const keep = (req.body?.keep || '').trim();
    const merge = Array.isArray(req.body?.merge) ? req.body.merge.map((s) => String(s).trim()).filter((s) => s && s !== keep) : [];
    if (!keep) return res.status(400).json({ message: 'Champ "keep" requis' });
    if (!merge.length) return res.status(400).json({ message: 'Aucune valeur à fusionner' });
    const r = await pool.connect();
    try {
      const result = await r.query(
        `UPDATE hub_deploiements.fiches SET installateur = $1 WHERE installateur = ANY($2::text[])`,
        [keep, merge]
      );
      return res.json({ keep, merged: merge, updated: result.rowCount });
    } finally { r.release(); }
  } catch (e) {
    console.error('[deploiements] mergeInstallateurs error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deploiements/installateurs/rename — renomme un installateur
//   body { from, to } : si "to" existe déjà, les fiches sont fusionnées dedans.
// ──────────────────────────────────────────────────────────────────────────────
async function renameInstallateur(req, res) {
  try {
    const from = (req.body?.from || '').trim();
    const to = (req.body?.to || '').trim();
    if (!from) return res.status(400).json({ message: 'from requis' });
    if (!to) return res.status(400).json({ message: 'Nouveau nom (to) requis' });
    if (from === to) return res.status(400).json({ message: 'Le nom est inchangé' });
    const client = await pool.connect();
    try {
      const existed = (await client.query(
        `SELECT COUNT(*)::int n FROM hub_deploiements.fiches WHERE installateur = $1`, [to]
      )).rows[0].n > 0;
      const result = await client.query(
        `UPDATE hub_deploiements.fiches SET installateur = $1 WHERE installateur = $2`, [to, from]
      );
      return res.json({ from, to, updated: result.rowCount, merged: existed });
    } finally { client.release(); }
  } catch (e) {
    console.error('[deploiements] renameInstallateur error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ── Table de cache AD (créée à la volée) ──────────────────────────────────────
async function ensureAdCacheTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS hub_deploiements.ad_match (
      name_norm    TEXT PRIMARY KEY,
      raw_name     TEXT,
      found        BOOLEAN NOT NULL DEFAULT false,
      display_name TEXT,
      email        TEXT,
      username     TEXT,
      service      TEXT,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deploiements/ad-match — état + map des correspondances en cache
// ──────────────────────────────────────────────────────────────────────────────
async function adMatchGet(req, res) {
  try {
    const client = await pool.connect();
    try {
      await ensureAdCacheTable(client);
      const [distinct, cache] = await Promise.all([
        client.query(`SELECT DISTINCT beneficiaire FROM hub_deploiements.fiches WHERE beneficiaire IS NOT NULL AND TRIM(beneficiaire) <> ''`),
        client.query(`SELECT name_norm, raw_name, found, display_name, email, username, service FROM hub_deploiements.ad_match`),
      ]);
      const distinctKeys = new Set();
      for (const r of distinct.rows) { const k = normName(r.beneficiaire); if (k) distinctKeys.add(k); }
      const map = {};
      let matched = 0;
      for (const r of cache.rows) {
        map[r.name_norm] = { found: r.found, display_name: r.display_name, email: r.email, username: r.username, service: r.service };
        if (distinctKeys.has(r.name_norm) && r.found) matched++;
      }
      const cachedKeys = new Set(cache.rows.map((r) => r.name_norm));
      const remaining = [...distinctKeys].filter((k) => !cachedKeys.has(k)).length;
      return res.json({ total: distinctKeys.size, cached: distinctKeys.size - remaining, remaining, matched, map });
    } finally { client.release(); }
  } catch (e) {
    console.error('[deploiements] adMatchGet error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deploiements/ad-match/run — traite un lot de bénéficiaires non cachés
//   body { batch?: 25, refresh?: bool }
// ──────────────────────────────────────────────────────────────────────────────
async function adMatchRun(req, res) {
  const batch = Math.min(parseInt(req.body?.batch, 10) || 25, 60);
  const refresh = !!req.body?.refresh;
  try {
    const adCfg = getSqlite() ? await getSqlite().get('SELECT * FROM ad_settings WHERE id = 1') : null;
    if (!adCfg || !adCfg.host) return res.status(503).json({ message: 'Active Directory non configuré (Admin → AD)' });

    const client = await pool.connect();
    let toProcess = [];
    let totalDistinct = 0, alreadyCached = 0;
    try {
      await ensureAdCacheTable(client);
      const distinct = await client.query(`SELECT beneficiaire FROM hub_deploiements.fiches WHERE beneficiaire IS NOT NULL AND TRIM(beneficiaire) <> ''`);
      // Première occurrence (nom brut) par clé normalisée
      const byKey = new Map();
      for (const r of distinct.rows) { const k = normName(r.beneficiaire); if (k && !byKey.has(k)) byKey.set(k, r.beneficiaire); }
      totalDistinct = byKey.size;
      const cache = await client.query(`SELECT name_norm FROM hub_deploiements.ad_match`);
      const cached = new Set(cache.rows.map((r) => r.name_norm));
      for (const [k, raw] of byKey) {
        if (!refresh && cached.has(k)) { alreadyCached++; continue; }
        toProcess.push({ key: k, raw });
      }
    } finally { client.release(); }

    const slice = toProcess.slice(0, batch);
    let processed = 0;
    for (const { key, raw } of slice) {
      let found = false, dn = null, email = null, username = null, service = null;
      try {
        const results = await searchADUsersByQuery(raw, adCfg);
        const match = (results || []).find((u) => u.email) || (results || [])[0];
        if (match) { found = true; dn = match.displayName || null; email = match.email || null; username = match.username || null; service = match.service || null; }
      } catch (e) { /* on cache quand même le « non trouvé » */ }
      const c2 = await pool.connect();
      try {
        await c2.query(
          `INSERT INTO hub_deploiements.ad_match (name_norm, raw_name, found, display_name, email, username, service, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, now())
           ON CONFLICT (name_norm) DO UPDATE SET raw_name=EXCLUDED.raw_name, found=EXCLUDED.found,
             display_name=EXCLUDED.display_name, email=EXCLUDED.email, username=EXCLUDED.username,
             service=EXCLUDED.service, updated_at=now()`,
          [key, raw, found, dn, email, username, service]
        );
      } finally { c2.release(); }
      processed++;
    }
    const remaining = toProcess.length - slice.length;
    return res.json({ processed, remaining, total: totalDistinct, done: remaining === 0 });
  } catch (e) {
    console.error('[deploiements] adMatchRun error:', e.message);
    return res.status(500).json({ message: e.message });
  }
}

// Colonnes de données fusionnables (tout sauf id / created_at).
const MERGE_COLS = [
  'fichier', 'fichier_lie', 'date_deploiement', 'beneficiaire', 'direction',
  'service', 'site', 'installateur', 'type_operation',
  'uc_nouveau_num', 'uc_nouveau_serie', 'uc_nouveau_modele',
  'uc_recupere_num', 'uc_recupere_serie', 'uc_recupere_modele',
  'ecran1_nouveau_num', 'ecran1_nouveau_serie', 'ecran1_nouveau_modele',
  'ecran1_recupere_num', 'ecran1_recupere_serie', 'ecran1_recupere_modele',
  'ecran2_nouveau_serie', 'ecran2_nouveau_modele', 'autre_designation',
  'source', 'quantite', 'materiel_type', 'annee_materiel', 'neuf_reco',
  'type_flux', 'est_ordi', 'materiel_refs', 'glpi_document_id',
];
function isEmptyVal(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') { const s = v.trim(); return s === '' || s === '—'; }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deploiements/merge — fusion manuelle de 2 fiches
//   body { keep_id, merge_id } : complète keep avec les champs vides remplis par
//   merge (jamais d'écrasement), puis supprime merge.
// ──────────────────────────────────────────────────────────────────────────────
async function mergePair(req, res) {
  const keepId = parseInt(req.body?.keep_id, 10);
  const mergeId = parseInt(req.body?.merge_id, 10);
  if (!keepId || !mergeId) return res.status(400).json({ message: 'keep_id et merge_id requis' });
  if (keepId === mergeId) return res.status(400).json({ message: 'Les deux fiches doivent être différentes' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const keepRes = await client.query('SELECT * FROM hub_deploiements.fiches WHERE id = $1', [keepId]);
    const mergeRes = await client.query('SELECT * FROM hub_deploiements.fiches WHERE id = $1', [mergeId]);
    if (!keepRes.rows.length || !mergeRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Fiche introuvable' }); }
    const keep = keepRes.rows[0];
    const merge = mergeRes.rows[0];

    const updates = {};
    for (const col of MERGE_COLS) {
      if (isEmptyVal(keep[col]) && !isEmptyVal(merge[col])) updates[col] = merge[col];
    }
    const cols = Object.keys(updates);
    if (cols.length) {
      const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await client.query(`UPDATE hub_deploiements.fiches SET ${set} WHERE id = $${cols.length + 1}`,
        [...cols.map((c) => updates[c]), keepId]);
    }
    await client.query('DELETE FROM hub_deploiements.fiches WHERE id = $1', [mergeId]);
    await client.query('COMMIT');

    const finalRow = await client.query('SELECT * FROM hub_deploiements.fiches WHERE id = $1', [keepId]);
    return res.json({ keep_id: keepId, merge_id: mergeId, filled: cols, row: finalRow.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[deploiements] mergePair error:', e.message);
    return res.status(500).json({ message: e.message });
  } finally { client.release(); }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deploiements/types/rename — renomme (et fusionne) un type d'opération
//   body { from, to } : si "to" existe déjà, les fiches rejoignent cette catégorie.
// ──────────────────────────────────────────────────────────────────────────────
async function renameType(req, res) {
  const from = req.body?.from;            // peut être null (= type vide)
  const to = (req.body?.to ?? '').trim();
  if (from === undefined) return res.status(400).json({ message: 'from requis' });
  if (!to) return res.status(400).json({ message: 'Nouveau nom (to) requis' });
  if (from === to) return res.status(400).json({ message: 'Le nom est inchangé' });
  const client = await pool.connect();
  try {
    // Existait-il déjà une catégorie nommée "to" ? (→ fusion)
    const existed = (await client.query(
      `SELECT COUNT(*)::int n FROM hub_deploiements.fiches WHERE type_operation = $1`, [to]
    )).rows[0].n > 0;
    const result = from === null
      ? await client.query(`UPDATE hub_deploiements.fiches SET type_operation = $1 WHERE type_operation IS NULL`, [to])
      : await client.query(`UPDATE hub_deploiements.fiches SET type_operation = $1 WHERE type_operation = $2`, [to, from]);
    return res.json({ from, to, updated: result.rowCount, merged: existed });
  } catch (e) {
    console.error('[deploiements] renameType error:', e.message);
    return res.status(500).json({ message: e.message });
  } finally { client.release(); }
}

module.exports = {
  list, kpis, matches, glpiProposals, serveFile, previewFile, update, conflicts,
  facets, mergeInstallateurs, renameInstallateur, adMatchGet, adMatchRun, mergePair, renameType,
};
