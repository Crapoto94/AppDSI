#!/usr/bin/env node
/**
 * Import du fichier "Perte Casse Vol Materiel.xlsx" (T:\AA Process Support SU\...)
 * dans hub_vols.thefts, et upload des documents associés trouvés dans /vol
 * vers le stockage GED (shared/storage.js) + hub_docs.
 *
 * Le fichier Excel et les documents sont fournis dans le dossier vol/ à la racine
 * du dépôt (copié depuis le partage T:\).
 *
 * Usage : node scripts/import_vols_excel.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { setupDb, pgDb, pool } = require('../shared/database');
const storage = require('../shared/storage');

const EXCEL_PATH = path.resolve(__dirname, '../../vol/Perte Casse Vol Materiel.xlsx');
const VOL_DIR = path.resolve(__dirname, '../../vol');
const MODULE = 'vols';

function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  return (s.toLowerCase() === 'nan') ? '' : s;
}

function excelDateToISO(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  return null;
}

function typeIncidentFromCategorie(cat) {
  const c = (cat || '').toLowerCase();
  if (c.startsWith('vol')) return 'vol';
  if (c.startsWith('perte')) return 'perte';
  if (c.startsWith('casse')) return 'casse';
  return 'vol';
}

function parcTypeFromMateriel(typeMateriel) {
  const t = (typeMateriel || '').toLowerCase();
  if (t.includes('pc portable') || t.includes('ordinateur')) return 'ordinateurs';
  if (t.includes('mobile') || t.includes('tablette') || t.includes('ipad') || t.includes('iphone')) return 'telephones_tablettes';
  return '';
}

function extractInventaire(materiel) {
  const m = (materiel || '').match(/PO\d{4,}/i);
  return m ? m[0].toUpperCase() : '';
}

// ── Mapping ligne Excel (index 0-based, ordre du fichier) -> documents trouvés dans /vol ──
// Vérifié manuellement par correspondance nom/date entre le tableau et les fichiers du dossier.
const DOC_MAP = {
  1:  ['Manuella RAMPNOUX courrier ivry carte sim.pdf', 'RAMPNOUX Manuella_retour_sim.pdf',
       'retour carte SIM PRO RAMPNOUX Manuella.msg',
       'Restitution carte Sim professionnelle et déclaration de perte du téléphone portable .msg'],
  5:  ['2022-10-28 14-07.pdf'],
  9:  ['2022 12 30 ADOM IMEI862282053115136.pdf'],
  11: ['TR CR infraction Claudette Jolo.msg', 'TR Vol de téléphone portable .msg', 'Vol de téléphone portable.msg'],
  13: ['2023 10 Dépot de Plainte tablette GRU.pdf'],
  14: ['2023 10 Dépot de Plainte tablette GRU.pdf'],
  16: ['BAROUCHE Said.pdf'],
  20: ['IRIARTE Josephine - Echange PO suite chute.pdf'],
  23: ['Mme ZEGUELLI Salima/3475_001.pdf', 'Mme ZEGUELLI Salima/3476_001.pdf',
       'Mme ZEGUELLI Salima/3477_001.pdf', 'Mme ZEGUELLI Salima/3478_001.pdf',
       'Mme ZEGUELLI Salima/pc volé.msg'],
  26: ['BELARCHI Yasmina- gardienne GS Barbusse.pdf'],
  32: ['PO23065 benlhouss Mourad.pdf'],
  42: ['2025 10 13 FIRMERY Stephane.pdf'],
  44: ['2025 11 LEHEUP Nathalie.pdf'],
  45: ['RAJERINERA PV Perte.pdf'],
  49: ['260504 B. Badia Plainte vol.pdf'],
  54: ['RE Tablette égarée en Fevrier .msg'],
};

// Fichiers du dossier /vol n'ayant pas de ligne correspondante identifiée dans l'Excel.
const UNMATCHED_FILES = [
  '2025 01 14 Vol A15 Mme ANELKA Caroline.pdf',
  '2026 01 20 CHEVE Mickael.pdf',
];

function mimeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.msg') return 'application/vnd.ms-outlook';
  return 'application/octet-stream';
}

async function uploadDocFor(theftId, relPath, nature) {
  const abs = path.join(VOL_DIR, relPath);
  if (!fs.existsSync(abs)) {
    console.warn(`  [!] Fichier introuvable, ignoré: ${relPath}`);
    return;
  }
  const buffer = fs.readFileSync(abs);
  const originalname = storage.fixUploadName(path.basename(relPath));
  const file = { buffer, originalname, mimetype: mimeFor(originalname), size: buffer.length };
  const saved = await storage.saveFile(MODULE, String(theftId), file);
  await pgDb.run(
    'INSERT INTO hub_vols.theft_documents (theft_id, file_path, file_name, nature, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    [theftId, saved.dbPath, originalname, nature, 'import_excel']
  );
  try {
    const docsService = require('../shared/documents.service');
    await docsService.registerExternalUpload({
      module: MODULE,
      entityType: 'attachment',
      entityId: theftId,
      title: nature || originalname,
      filename: saved.filename,
      originalName: originalname,
      mimetype: file.mimetype,
      size: file.size,
      storageRef: saved.dbPath,
      metadata: { nature, source: 'import_excel' },
      uploadedBy: 'import_excel',
    });
  } catch (e) {
    console.warn(`  [!] Enregistrement hub_docs échoué pour ${relPath}:`, e.message);
  }
  console.log(`  [+] Document ajouté: ${relPath} -> ${saved.dbPath}`);
}

async function main() {
  console.log('== Import Vols/Pertes/Casses depuis Excel ==');
  console.log('Fichier:', EXCEL_PATH);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('Fichier Excel introuvable:', EXCEL_PATH);
    process.exit(1);
  }

  // Initialise SQLite (nécessaire pour storage.js -> getStorageConfig via getSqlite()).
  await setupDb();

  // S'assure que les colonnes ajoutées récemment au schéma existent (le serveur
  // complet les crée au démarrage via setupPgDb ; ce script est autonome).
  await pool.query(`ALTER TABLE hub_vols.thefts ADD COLUMN IF NOT EXISTS type_incident VARCHAR(20) DEFAULT 'vol'`);
  await pool.query(`ALTER TABLE hub_vols.thefts ADD COLUMN IF NOT EXISTS agent_nom VARCHAR(255) DEFAULT ''`);
  await pool.query(`ALTER TABLE hub_vols.thefts ADD COLUMN IF NOT EXISTS agent_service VARCHAR(255) DEFAULT ''`);
  await pool.query(`ALTER TABLE hub_vols.thefts ADD COLUMN IF NOT EXISTS numero_ticket VARCHAR(255) DEFAULT ''`);

  // cellDates:false + conversion manuelle du sérial Excel : évite un décalage de
  // fuseau horaire d'un jour que XLSX.SSF/cellDates introduit sur les dates sans heure.
  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

  console.log(`Lignes trouvées: ${rows.length}`);

  // Purge des imports précédents pour permettre une ré-exécution idempotente.
  const already = await pgDb.all(`SELECT id FROM hub_vols.thefts WHERE created_by = 'import_excel'`);
  if (already.length) {
    console.log(`Suppression de ${already.length} ligne(s) importée(s) précédemment (ré-exécution idempotente)...`);
    for (const r of already) {
      const docs = await pgDb.all('SELECT file_path FROM hub_vols.theft_documents WHERE theft_id = ?', [r.id]);
      for (const d of docs) { if (d.file_path) await storage.deleteFile(d.file_path).catch(() => {}); }
      await pgDb.run('DELETE FROM hub_vols.theft_comments WHERE theft_id = ?', [r.id]);
      await pgDb.run('DELETE FROM hub_vols.theft_documents WHERE theft_id = ?', [r.id]);
      await pgDb.run('DELETE FROM hub_vols.thefts WHERE id = ?', [r.id]);
    }
  }

  let inserted = 0;
  const idByIndex = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = clean(row['NOM ']) || clean(row['NOM']);
    const prenom = clean(row['PRENOM ']) || clean(row['PRENOM']);
    const dirSvc = clean(row['DIR/Svc']);
    const categorie = clean(row['Categirie']);
    const typeMateriel = clean(row['Type Materiel']);
    const materiel = clean(row['MATERIEL']);
    const detail = clean(row['DETAIL']);
    const idGlpiRaw = clean(row['id GLPI']);
    const date = excelDateToISO(row['DATE']);

    const beneficiaire = [nom, prenom].filter(Boolean).join(' ');
    const type_incident = typeIncidentFromCategorie(categorie);
    const parc_type_key = parcTypeFromMateriel(typeMateriel);
    const numero_inventaire = extractInventaire(materiel);
    const numero_ticket = idGlpiRaw;
    const designation = materiel || typeMateriel || categorie || '(matériel non précisé)';

    const result = await pgDb.run(
      `INSERT INTO hub_vols.thefts
        (type_incident, designation, numero_inventaire, parc_type_key, parc_glpi_id,
         agent_nom, agent_service, beneficiaire_nom, beneficiaire_service,
         valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, numero_ticket,
         statut, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [type_incident, designation, numero_inventaire, parc_type_key, null,
       beneficiaire, dirSvc, beneficiaire, dirSvc,
       null, null, null, date, '', detail, numero_ticket,
       'declare', 'import_excel']
    );
    const theftId = result.lastID || result.id;
    idByIndex[i] = theftId;
    inserted++;
    console.log(`[${i}] #${theftId} ${type_incident.toUpperCase()} - ${beneficiaire || dirSvc} - ${designation}${numero_ticket ? ' (ticket ' + numero_ticket + ')' : ''}`);
  }

  console.log(`\n${inserted} dossier(s) créé(s). Association des documents...`);

  for (const [idxStr, files] of Object.entries(DOC_MAP)) {
    const idx = Number(idxStr);
    const theftId = idByIndex[idx];
    if (!theftId) { console.warn(`  [!] Pas de dossier pour l'index ${idx}`); continue; }
    for (const relPath of files) {
      try {
        await uploadDocFor(theftId, relPath, 'Autre');
      } catch (e) {
        console.warn(`  [!] Échec upload ${relPath}:`, e.message);
      }
    }
  }

  console.log('\nFichiers du dossier /vol non rattachés à une ligne du tableau (à traiter manuellement si besoin):');
  UNMATCHED_FILES.forEach(f => console.log(`  - ${f}`));

  console.log('\nImport terminé.');
  process.exit(0);
}

main().catch(e => {
  console.error('Erreur import:', e);
  process.exit(1);
});
