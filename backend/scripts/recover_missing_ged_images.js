/**
 * Rattrapage : retrouve, sur CE poste, les fichiers image (module
 * /consommables et /prets) qui ont été enregistrés par erreur en stockage
 * local — probablement le repli par défaut de shared/storage.js
 * (backend/consommables/..., backend/prets/...) faute de storage.root_path
 * configuré sur ce poste — au lieu du partage GED partagé, et les COPIE au
 * bon endroit sur le partage.
 *
 * Les lignes en base (Postgres, hub_consommables.designation_images et
 * hub_prets.equipment) sont déjà correctes et partagées par tous les postes
 * (storage/consommables/... , storage/prets/...) : une fois les fichiers
 * physiques copiés au bon endroit sur le partage, elles redeviennent
 * valides PARTOUT (y compris le serveur), sans toucher à la base ni au code.
 *
 * Non destructif :
 *   - ne supprime jamais rien côté source (ce poste)
 *   - ne réécrit jamais un fichier déjà présent côté partage
 *
 * Usage (depuis le dossier backend/) :
 *   node scripts/recover_missing_ged_images.js                     # dry-run, cherche sous backend/
 *   node scripts/recover_missing_ged_images.js --execute           # copie réellement
 *   node scripts/recover_missing_ged_images.js --root "D:\ailleurs" [--execute]
 *     (si les fichiers ne sont pas retrouvés sous backend/, préciser un autre
 *      dossier de recherche, ex. l'ancien clone du repo ou le dossier où
 *      pointait storage.root_path sur ce poste)
 */
const fs = require('fs');
const path = require('path');

// Chemins BD attendus (hub_consommables.designation_images.image_path et
// hub_prets.equipment.image_path) — extraits de la base partagée le
// 2026-09-07. Ne PAS modifier à la main : sert juste à savoir quel fichier
// (nom + emplacement final) chercher.
const MANIFEST = {
  "consommables": [
    "storage/consommables/BROTHER_HL-L8260CDW/1788686492078-934602262-8260.webp",
    "storage/consommables/BROTHER_MFC_L3760_CDW__BROTHER_HL_L3240_CDW/1788684868590-49000903-1779481240481_1779481240463_brother_mfc_l3760_cdw__brother_hl_l3240_cdw.jpg",
    "storage/consommables/Brother_2940/1788689579122-333588512-2940.webp",
    "storage/consommables/Brother_DCP-L3550CDW__A4_____Brother_MFC_L3770_CDW____Brother_HL-_L3240_CDW/1788687441777-633838392-3550.jpg",
    "storage/consommables/Brother_DCP-L5500/1788688223073-83120741-tambour.jpg",
    "storage/consommables/Brother_DCP-L_5500_DN/1788689309345-831438408-5500.jpg",
    "storage/consommables/Brother_DCP-L_5510_DW/1788689494338-481098899-5510.webp",
    "storage/consommables/Brother_DCP_8110_DN/1788685316000-483910031-8100.png",
    "storage/consommables/Brother_MFC5890__A3_/1788685476645-361445229-MFC5890CN_left.png",
    "storage/consommables/Brother_MFC_8220/1788689789936-209422268-8220.jpg",
    "storage/consommables/Brother_T96/1788689605210-184707532-t96.jpg",
    "storage/consommables/CD-R_700_Mb_Fuji__paquet_de_10_/1788688025508-600573721-cd-r.webp",
    "storage/consommables/CD-R_700_Mb__paquet_de_10_/1788688038951-688505487-cd-r.webp",
    "storage/consommables/Canon_I-Sensys_LBP_633CDW___A4_/1788686213810-364372147-633.jpg",
    "storage/consommables/Canon_L200__L240_250_300_350/1788689850864-523940729-l200-2.jpg",
    "storage/consommables/Canon_L_100___L_120__L140/1788688279212-933673824-l100.jpg",
    "storage/consommables/Canon_L_2000___L_2000_IP/1788689881230-880788650-L2000.jpg",
    "storage/consommables/Canon_L_380_S___Canon_L400/1788689814395-814635262-l400.jpg",
    "storage/consommables/Canon_L_800/1788689668165-227484738-l800.jpg",
    "storage/consommables/Canon_i-SENSYS_MF4150/1788689918684-149341971-4150.jpg",
    "storage/consommables/Cl__USB_3.0_-_16_Go_Sandisk/1788687837217-543488773-usb.webp",
    "storage/consommables/Cl__USB_3.2_-_32_Go_-_Verbatim/1788687828028-589622232-usb.webp",
    "storage/consommables/DVD_R__4_7_Go__Fuji__paquet_de_10_/1788687759140-367699488-dvd.jpg",
    "storage/consommables/DVD_R__4_7_Go___paquet_de_10_/1788689165430-503538959-dvd.jpg",
    "storage/consommables/D_poussi_rant_gaz_-_A_rosol_650_ml/1788688148055-89560257-dep.webp",
    "storage/consommables/HP_Color_Laserjet_CP2025N__A4_/1788687282423-130210628-2025.jpg",
    "storage/consommables/HP_Color_Laserjet_CP5225DN__A3_/1788687084913-134493592-5220.webp",
    "storage/consommables/HP_Color_Laserjet_Ent._M555_DN/1788686696301-377374456-554.webp",
    "storage/consommables/HP_Color_Laserjet_Ent._M652DN/1788687191312-45807226-652.jpg",
    "storage/consommables/HP_Color_Laserjet_Pro_M452DN__A4_/1788687133426-947018398-452.webp",
    "storage/consommables/HP_Color_Laserjet_Pro_M454DW__A4___HP_Color_Laserjet_Pro_MFP_M479DW__HP_Color_Laserjet_Ent._M455_DN/1788686635193-932323965-hp.webp",
    "storage/consommables/HP_Color_Laserjet_pro_CP1025_NW__A4_/1788686435714-270585808-1005.jpg",
    "storage/consommables/HP_Deskjet_1280c__A4_/1788685606501-635672512-1280.jpg",
    "storage/consommables/HP_LaserJet_1005__1200/1788686855005-266653075-1200.webp",
    "storage/consommables/HP_LaserJet_1010___1015___1020__1022/1788688879956-878724446-1010.jpg",
    "storage/consommables/HP_LaserJet_1300/1788688923517-379334651-1300.webp",
    "storage/consommables/HP_LaserJet_1320_N-TN/1788689252735-402398194-1320.webp",
    "storage/consommables/HP_LaserJet_2200__EP32_/1788688574310-426311734-2200.jpg",
    "storage/consommables/HP_LaserJet_2300_DN/1788686747352-228624786-2300.jpg",
    "storage/consommables/HP_LaserJet_2420_N/1788688967063-580344091-2420.jpg",
    "storage/consommables/HP_LaserJet_4250_DTN/1788689216646-320216532-4250.webp",
    "storage/consommables/HP_LaserJet_P_1102/1788687585514-926687322-1102.webp",
    "storage/consommables/HP_LaserJet_P_3005/1788689007545-561049637-3005.jpg",
    "storage/consommables/HP_LaserJet_P_3015/1788686986121-800620602-3015.jpg",
    "storage/consommables/HP_LaserJet__P2014___2015/1788689049834-630284039-2014.webp",
    "storage/consommables/HP_Laserjet_Ent._M507_DN/1788688524784-377966077-507.webp",
    "storage/consommables/HP_Laserjet_P4015/1788686906170-919088314-4015.webp",
    "storage/consommables/HP_Laserjet_P_1606_DN/1788687550615-878173119-1606.webp",
    "storage/consommables/HP_Laserjet_Pro_4002_DN___MFP_4102_FDW/1788689534896-436180909-4002.webp",
    "storage/consommables/HP_Laserjet_Pro_400_Color_M451DN__A4_/1788686392184-658038078-400.webp",
    "storage/consommables/HP_Laserjet_Pro_400_M401_DNE/1788688401589-286237231-400.webp",
    "storage/consommables/HP_Laserjet_Pro_M203DW/1788687660813-56930116-203.jpg",
    "storage/consommables/HP_Laserjet_Pro_M402_DN___MFP_M426FDN/1788687624391-556776346-402.webp",
    "storage/consommables/HP_Laserjet_Pro_M404_DN___MFP_M428DW/1788688342257-925661813-404.webp",
    "storage/consommables/HP_Laserjet_Pro_MFP_M127_FW/1788688436260-165965833-127.jpg",
    "storage/consommables/HP_Laserjet_Pro_MFP_M201DW/1788688475407-31616380-201.jpg",
    "storage/consommables/HP_OFFICEJET_6500__A4__-_7500A__A3_/1788685932127-409576088-6500.webp",
    "storage/consommables/HP_OFFICEJET_7510_-_7612_wide_format__A3_/1788685988801-967933118-7612.webp",
    "storage/consommables/HP_OfficeJet_250_All_In_One__A4_/1788685844706-881111255-250.webp",
    "storage/consommables/HP_OfficeJet_H_470B__A4_/1788685800039-786551183-470.jpg",
    "storage/consommables/HP_OfficeJet_Pro_9730e__A3_/1788685659851-507131040-9730.jpg",
    "storage/consommables/HP_Officejet_Pro_7740_MFP__A3_/1788686032873-694949291-7740.jpg",
    "storage/consommables/HP_PageWide_Pro_477_DW__A4_/1788686339960-659455842-477.webp",
    "storage/consommables/Lexmark_E_460/1788688647603-241313718-460.jpg",
    "storage/consommables/Lexmark_Prospect_Pro_205__A4_/1788685734842-766069878-205.jpg",
    "storage/consommables/Mousse__Antistatique__-_A_rosol_650ml/1788688155551-297725454-mousse.jpg",
    "storage/consommables/Samsung_ML_2545___2580/1788688796619-227214971-2580.jpg",
    "storage/consommables/Samsung_ML_3710_ND/1788688838169-194804474-3710.jpg",
    "storage/consommables/Samsung_ML__2851/1788688655295-332032087-2851.webp",
    "storage/consommables/Samsung_Xpress_SL-C430W/1788687347972-306912265-430.png",
    "storage/consommables/Tapis_de_souris_personnalisable/1788688134770-273243001-tapis.jpg",
    "storage/consommables/X_rox_VersaLink_C7000V_DN__A3_/1788686276271-483432244-c7000.jpg"
  ],
  "prets": [
    "storage/prets/equipment-4/1788699394693-238719864-Camera-sport-Dji-Osmo-Pocket-3-Noir.jpg"
  ]
};
// NB : les 12 autres images du module /prets (icônes génériques auto-générées)
// n'ont pas besoin d'être récupérées ici — elles sont régénérées directement
// via scripts/generate_prets_equipment_media.js, aucun fichier source à retrouver.

const isExecute = process.argv.includes('--execute');
const rootArgIdx = process.argv.indexOf('--root');
const searchRoot = rootArgIdx !== -1 && process.argv[rootArgIdx + 1]
  ? process.argv[rootArgIdx + 1]
  : path.join(__dirname, '..'); // = backend/, repli par défaut de shared/storage.js
const DEST_ROOT = '\\\\10.103.131.136\\editions$\\DSIHUB'; // storage.root_path partagé

/** Indexe récursivement tous les fichiers sous `dir` par nom de fichier. */
function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walk(full, out);
    } else {
      out.set(ent.name, full);
    }
  }
}

function main() {
  console.log(isExecute ? '=== MODE EXÉCUTION (copie réelle) ===' : '=== MODE DRY-RUN (relancer avec --execute pour copier) ===');

  if (!fs.existsSync(DEST_ROOT)) {
    console.error(`❌ Partage GED introuvable (${DEST_ROOT}).`);
    console.error('   Connecte-toi au VPN / réseau de la DSI puis relance le script.');
    process.exit(1);
  }

  console.log(`Recherche des fichiers sous : ${searchRoot}`);
  const found = new Map();
  walk(searchRoot, found);
  console.log(`${found.size} fichiers indexés sous ${searchRoot}\n`);

  const all = [...MANIFEST.consommables, ...MANIFEST.prets];
  let copied = 0, already = 0, missing = 0;
  const missingList = [];

  for (const rel of all) {
    const relNoPrefix = rel.replace(/^storage\//, '');
    const destAbs = path.join(DEST_ROOT, ...relNoPrefix.split('/'));
    const basename = path.basename(rel);

    if (fs.existsSync(destAbs)) { already++; continue; }

    const srcAbs = found.get(basename);
    if (!srcAbs) { missing++; missingList.push(rel); continue; }

    console.log(`  ${isExecute ? '✅ copié' : '(dry-run) à copier'} : ${srcAbs}\n      → ${destAbs}`);
    if (isExecute) {
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.copyFileSync(srcAbs, destAbs);
    }
    copied++;
  }

  console.log('\n--- Résumé ---');
  console.log(`Déjà présents sur le partage : ${already}`);
  console.log(`Copiés${isExecute ? '' : ' (simulation)'} : ${copied}`);
  console.log(`Introuvables sur ce poste : ${missing}`);
  if (missingList.length) {
    console.log('\nFichiers toujours introuvables (chercher ailleurs et relancer avec --root) :');
    missingList.forEach(f => console.log(`  - ${f}`));
  }
  if (!isExecute) console.log('\nDry-run terminé — relancer avec --execute pour copier réellement.');
}

main();
