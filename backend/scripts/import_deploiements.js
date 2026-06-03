'use strict';

/**
 * Script d'import des fiches de déploiement depuis Excel
 * Usage : node backend/scripts/import_deploiements.js
 */

const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../shared/pg_db');

const XLSX_FILE = 'C:\\dev\\scan_fiches\\scan_fiches_resultat_v4.xlsx';
const SHEET_NAME = 'Scan fiches';

/**
 * Nettoie une valeur : trim + null si vide ou 'nan'
 */
function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'nan') return null;
  return s;
}

/**
 * Convertit une date Excel en chaîne ISO YYYY-MM-DD
 * Supporte : numéro de série Excel, format DD/MM/YYYY, objet Date
 */
function parseDate(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    // Numéro de série Excel : convertir via XLSX.utils.format_cell ou manuellement
    const dt = XLSX.SSF.parse_date_code(v);
    if (dt) {
      const y = dt.y;
      const m = String(dt.m).padStart(2, '0');
      const d = String(dt.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return null;
  }
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'nan') return null;
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  // YYYY-MM-DD déjà
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

async function main() {
  console.log('[import] Lecture du fichier Excel...');
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });
  if (!wb.SheetNames.includes(SHEET_NAME)) {
    console.error(`Feuille "${SHEET_NAME}" introuvable. Feuilles disponibles :`, wb.SheetNames);
    process.exit(1);
  }
  const ws = wb.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  console.log(`[import] ${rows.length} lignes lues`);

  const client = await pool.connect();
  try {
    // Créer le schéma/table si non existant
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_deploiements;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_deploiements.fiches (
        id SERIAL PRIMARY KEY,
        fichier TEXT,
        fichier_lie TEXT,
        date_deploiement DATE,
        beneficiaire TEXT,
        direction TEXT,
        service TEXT,
        site TEXT,
        installateur TEXT,
        type_operation TEXT,
        uc_nouveau_num TEXT,
        uc_nouveau_serie TEXT,
        uc_nouveau_modele TEXT,
        uc_recupere_num TEXT,
        uc_recupere_serie TEXT,
        uc_recupere_modele TEXT,
        ecran1_nouveau_num TEXT,
        ecran1_nouveau_serie TEXT,
        ecran1_nouveau_modele TEXT,
        ecran1_recupere_num TEXT,
        ecran1_recupere_serie TEXT,
        ecran1_recupere_modele TEXT,
        ecran2_nouveau_serie TEXT,
        ecran2_nouveau_modele TEXT,
        autre_designation TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const fichier       = clean(row['Fichier']);
        const fichier_lie   = clean(row['Fichier lié']);
        const date_dep      = parseDate(row['Date']);
        const beneficiaire  = clean(row['Bénéficiaire']);
        const direction     = clean(row['Direction']);
        const service       = clean(row['Service']);
        const site          = clean(row['Site']);
        const installateur  = clean(row['Installateur']);
        const type_op       = clean(row["Type d'opération"]);
        const uc_n_num      = clean(row['N° UC (nouveau)']);
        const uc_n_serie    = clean(row['N° Série UC (nouveau)']);
        const uc_n_mod      = clean(row['Modèle UC (nouveau)']);
        const uc_r_num      = clean(row['N° UC (récupéré)']);
        const uc_r_serie    = clean(row['N° Série UC (récupéré)']);
        const uc_r_mod      = clean(row['Modèle UC (récupéré)']);
        const e1_n_num      = clean(row['N° Écran 1 (nouveau)']);
        const e1_n_serie    = clean(row['N° Série Écran 1 (nouveau)']);
        const e1_n_mod      = clean(row['Modèle Écran 1 (nouveau)']);
        const e1_r_num      = clean(row['N° Écran 1 (récupéré)']);
        const e1_r_serie    = clean(row['N° Série Écran 1 (récupéré)']);
        const e1_r_mod      = clean(row['Modèle Écran 1 (récupéré)']);
        const e2_n_serie    = clean(row['N° Série Écran 2 (nouveau)']);
        const e2_n_mod      = clean(row['Modèle Écran 2 (nouveau)']);
        const autre         = clean(row['Autre désignation']);

        await client.query(`
          INSERT INTO hub_deploiements.fiches (
            fichier, fichier_lie, date_deploiement, beneficiaire, direction, service, site, installateur,
            type_operation, uc_nouveau_num, uc_nouveau_serie, uc_nouveau_modele,
            uc_recupere_num, uc_recupere_serie, uc_recupere_modele,
            ecran1_nouveau_num, ecran1_nouveau_serie, ecran1_nouveau_modele,
            ecran1_recupere_num, ecran1_recupere_serie, ecran1_recupere_modele,
            ecran2_nouveau_serie, ecran2_nouveau_modele, autre_designation
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15,
            $16, $17, $18,
            $19, $20, $21,
            $22, $23, $24
          )
          ON CONFLICT DO NOTHING
        `, [
          fichier, fichier_lie, date_dep, beneficiaire, direction, service, site, installateur,
          type_op, uc_n_num, uc_n_serie, uc_n_mod,
          uc_r_num, uc_r_serie, uc_r_mod,
          e1_n_num, e1_n_serie, e1_n_mod,
          e1_r_num, e1_r_serie, e1_r_mod,
          e2_n_serie, e2_n_mod, autre,
        ]);
        inserted++;
      } catch (e) {
        console.error('[import] Erreur ligne:', e.message, row['Fichier']);
        errors++;
      }
    }

    // Compte final
    const countRes = await client.query('SELECT COUNT(*)::int AS n FROM hub_deploiements.fiches');
    console.log(`[import] Terminé : ${inserted} insérées, ${skipped} ignorées, ${errors} erreurs`);
    console.log(`[import] Total en base : ${countRes.rows[0].n}`);
  } finally {
    client.release();
  }
}

main().catch(e => { console.error('[import] Fatal:', e.message); process.exit(1); });
