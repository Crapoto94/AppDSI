#!/usr/bin/env node
/**
 * Import du fichier de synthèse deploy.xlsx → hub_deploiements.fiches
 *
 * Stratégie de fusion (le fichier Excel est prioritaire sur les données AI) :
 *  - Si uc_nouveau_num trouve une fiche existante : UPDATE des champs
 *    direction / service / beneficiaire / type_operation / date / meta.
 *  - Sinon : INSERT avec source = 'deploy_excel'.
 *
 * Usage : node scripts/import_deploy_excel.js [chemin_vers_deploy.xlsx]
 */
'use strict';

const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../shared/pg_db');

const EXCEL_PATH = process.argv[2] || path.resolve(__dirname, '../../deploy.xlsx');

// ── Helpers ───────────────────────────────────────────────────────────────────
function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return (s === '' || s.toLowerCase() === 'nan' || s === 'VOIR FICHE') ? null : s;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) { const d = new Date(v); return isNaN(d) ? null : d; }
  const s = String(v).trim();
  if (!s) return null;
  // Try parsing as a number (Excel serial date)
  const n = Number(s);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  // Try DD/MM/YYYY or ISO
  const parts = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    const [, d, m, y] = parts;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    return new Date(year, parseInt(m) - 1, parseInt(d));
  }
  const iso = new Date(s);
  return isNaN(iso) ? null : iso;
}

function normalizeYear(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/\D+/g, '');
  if (!s || s === '1900') return null;
  const n = parseInt(s);
  if (n < 100) return n < 50 ? 2000 + n : 1900 + n;
  if (n >= 2000 && n <= 2100) return n;
  return null;
}

// Extrait les références d'équipement d'un champ multi-valeur (séparés par /)
// Retourne { uc, ecrans: [ec1, ec2, ...], autres: [...] }
function parseEquipRefs(raw) {
  const result = { uc: null, ecrans: [], autres: [] };
  if (!raw) return result;
  const items = String(raw).split('/').map(s => s.trim()).filter(s => s && s !== 'VOIR FICHE');
  for (const item of items) {
    const up = item.toUpperCase();
    if (/^UC\d+/i.test(up) || /^PO\d+/i.test(up)) {
      result.uc = result.uc || item; // premier UC/PO trouvé
    } else if (/^EC\d+/i.test(up)) {
      result.ecrans.push(item);
    } else {
      result.autres.push(item);
    }
  }
  return result;
}

// Normalise un code direction (enlève espaces, harmonise)
function normalizeDir(v) {
  if (!v) return null;
  return String(v).trim().toUpperCase().replace(/\s+/g, ' ');
}

// ── Lecture du fichier Excel ──────────────────────────────────────────────────
console.log(`[import] Lecture de ${EXCEL_PATH}…`);
const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, dateNF: 'dd/mm/yyyy' });
const ws = wb.Sheets['DATA'] || wb.Sheets[wb.SheetNames[0]];
// header: 1 pour lire la 1re ligne comme en-tête
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });

// Ligne 0 = en-têtes
const headers = raw[0].map(h => String(h || '').trim());
console.log('[import] Colonnes :', headers.join(' | '));

// Trouve l'index d'un en-tête (insensible à la casse, ignore les espaces)
function col(name) {
  const n = name.toLowerCase().replace(/\s/g, '');
  const idx = headers.findIndex(h => h.toLowerCase().replace(/\s/g, '') === n);
  return idx;
}

// Index des colonnes clés
const IDX = {
  date:           headers.findIndex((h, i) => i === 0 || h === '' || h === ' '),
  type_inter:     col("Type d'inter"),
  nombre:         col('Nombre'),
  materiel:       col('MATERIEL'),
  direction:      col('Direction'),
  service:        col('Service'),
  utilisateur:    col('Utilisateur'),
  ancien:         col('Ancien Matériel'),
  nouveau:        col('Nouveau Matériel'),
  commentaire:    col('Commentaire'),
  type_flux:      col('TYPE'),
  ordi:           col('ORDI'),
  annee_materiel: col('ANNEE'),
  neuf_reco:      col('NEUF'),
};
// La colonne date est souvent la 1re colonne (index 0)
if (IDX.date === -1) IDX.date = 0;

console.log('[import] Index colonnes :', JSON.stringify(IDX));

// Parse toutes les lignes (skip header + lignes vides)
const rows = [];
for (let i = 1; i < raw.length; i++) {
  const r = raw[i];
  const dateVal = r[IDX.date];
  if (!dateVal || String(dateVal).trim() === '') continue; // ligne vide
  const d = parseDate(dateVal);
  if (!d) continue;

  const typeInter = clean(r[IDX.type_inter]);
  const nombre = parseInt(r[IDX.nombre]) || 1;
  const materiel = clean(r[IDX.materiel]);
  const direction = normalizeDir(r[IDX.direction]);
  const service = clean(r[IDX.service]);
  const utilisateur = clean(r[IDX.utilisateur]);
  const ancienRaw = clean(r[IDX.ancien]);
  const nouveauRaw = clean(r[IDX.nouveau]);
  const commentaire = clean(r[IDX.commentaire]);
  const typeFlux = clean(r[IDX.type_flux]);
  const ordi = IDX.ordi >= 0 ? (Number(r[IDX.ordi]) === 1) : null;
  const anneeMat = normalizeYear(IDX.annee_materiel >= 0 ? r[IDX.annee_materiel] : null);
  const neufReco = clean(IDX.neuf_reco >= 0 ? r[IDX.neuf_reco] : null);

  const nouveauRefs = parseEquipRefs(nouveauRaw);
  const ancienRefs  = parseEquipRefs(ancienRaw);

  rows.push({
    date: d,
    type_operation: typeInter,
    quantite: nombre,
    materiel_type: materiel,
    direction,
    service,
    beneficiaire: utilisateur,
    // Nouveau matériel → champs uc_nouveau, ecran1, ecran2
    uc_nouveau_num:     nouveauRefs.uc,
    ecran1_nouveau_num: nouveauRefs.ecrans[0] || null,
    ecran2_nouveau_num: nouveauRefs.ecrans[1] || null,
    // Ancien matériel → champs uc_recupere, ecran1_recupere
    uc_recupere_num:      ancienRefs.uc,
    ecran1_recupere_num:  ancienRefs.ecrans[0] || null,
    // Chaînes brutes pour référence
    materiel_refs: [nouveauRaw, ancienRaw].filter(Boolean).join(' | ') || null,
    commentaire,
    type_flux: typeFlux,
    est_ordi:  ordi,
    annee_materiel: anneeMat,
    neuf_reco: neufReco,
  });
}

console.log(`[import] ${rows.length} lignes valides à importer…`);

// ── Import en base ────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  let inserted = 0, updated = 0, skipped = 0;

  // Migration préalable : s'assure que les colonnes existent
  const alters = [
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'fiches'`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS quantite INTEGER`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS materiel_type TEXT`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS annee_materiel INTEGER`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS neuf_reco TEXT`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS type_flux TEXT`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS est_ordi BOOLEAN`,
    `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS materiel_refs TEXT`,
  ];
  for (const sql of alters) { try { await client.query(sql); } catch (e) { console.warn('ALTER WARN:', e.message); } }
  console.log('[import] Migration colonnes OK');

  try {
    await client.query('BEGIN');

    let sp = 0;
    for (const row of rows) {
      const spName = `sp${sp++}`;
      await client.query(`SAVEPOINT ${spName}`);
      try {
        // Cherche d'abord par uc_nouveau_num (le plus fiable)
        let existingId = null;
        if (row.uc_nouveau_num) {
          const r = await client.query(
            `SELECT id FROM hub_deploiements.fiches
             WHERE uc_nouveau_num = $1
             ORDER BY ABS(COALESCE(date_deploiement, '1900-01-01'::date) - $2::date) ASC
             LIMIT 1`,
            [row.uc_nouveau_num, row.date]
          );
          if (r.rows.length) existingId = r.rows[0].id;
        }

        if (existingId) {
          // UPDATE — le fichier Excel est prioritaire
          await client.query(
            `UPDATE hub_deploiements.fiches SET
               date_deploiement   = COALESCE($1, date_deploiement),
               type_operation     = COALESCE($2, type_operation),
               direction          = COALESCE($3, direction),
               service            = COALESCE($4, service),
               beneficiaire       = COALESCE($5, beneficiaire),
               ecran1_nouveau_num = COALESCE($6, ecran1_nouveau_num),
               uc_recupere_num    = COALESCE($7, uc_recupere_num),
               ecran1_recupere_num = COALESCE($8, ecran1_recupere_num),
               quantite           = $9,
               materiel_type      = $10,
               annee_materiel     = $11,
               neuf_reco          = $12,
               type_flux          = $13,
               est_ordi           = $14,
               materiel_refs      = $15,
               source             = 'deploy_excel'
             WHERE id = $16`,
            [
              row.date, row.type_operation, row.direction, row.service, row.beneficiaire,
              row.ecran1_nouveau_num, row.uc_recupere_num, row.ecran1_recupere_num,
              row.quantite, row.materiel_type, row.annee_materiel,
              row.neuf_reco, row.type_flux, row.est_ordi, row.materiel_refs, existingId,
            ]
          );
          updated++;
        } else {
          // INSERT
          await client.query(
            `INSERT INTO hub_deploiements.fiches
               (source, date_deploiement, type_operation, quantite, materiel_type,
                direction, service, beneficiaire,
                uc_nouveau_num, ecran1_nouveau_num,
                uc_recupere_num, ecran1_recupere_num,
                annee_materiel, neuf_reco, type_flux, est_ordi, materiel_refs, autre_designation)
             VALUES
               ('deploy_excel',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              row.date, row.type_operation, row.quantite, row.materiel_type,
              row.direction, row.service, row.beneficiaire,
              row.uc_nouveau_num, row.ecran1_nouveau_num,
              row.uc_recupere_num, row.ecran1_recupere_num,
              row.annee_materiel, row.neuf_reco, row.type_flux, row.est_ordi,
              row.materiel_refs, row.commentaire,
            ]
          );
          inserted++;
        }
        await client.query(`RELEASE SAVEPOINT ${spName}`);
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
        console.error(`[import] Skip (UC=${row.uc_nouveau_num}, date=${row.date?.toISOString?.()?.slice(0,10)}):`, e.message);
        skipped++;
      }
    }

    await client.query('COMMIT');
    console.log(`[import] ✓ Terminé — ${inserted} insérés, ${updated} mis à jour, ${skipped} erreurs`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[import] Erreur fatale :', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
