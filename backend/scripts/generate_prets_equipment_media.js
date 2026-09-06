/**
 * Renseigne une description basique et une image générique (SVG généré
 * localement — carte colorée + icône, aucun téléchargement internet, même
 * esprit que backend/download-designation-images.js) pour tout matériel du
 * module /prets qui n'en a pas encore. Ne touche JAMAIS une fiche déjà
 * renseignée manuellement (description non vide, ou image déjà uploadée —
 * ex. la vraie photo de la DJI Osmo n'est pas remplacée).
 *
 * Usage :
 *   node scripts/generate_prets_equipment_media.js            # dry-run
 *   node scripts/generate_prets_equipment_media.js --execute  # écriture réelle
 */

const { pgDb, setupDb } = require('../shared/database');
const storage = require('../shared/storage');
const docsService = require('../shared/documents.service');

const isExecute = process.argv.includes('--execute');
const MODULE = 'prets';

// Classification par mots-clés (ordre = priorité, du plus spécifique au plus
// générique) : description auto + icône/couleur de la carte visuelle.
const CATALOG = [
  { match: /interactif|tni\b|tableau num[ée]rique/i, desc: n => `${n} — écran numérique interactif disponible en prêt auprès de la DSI pour vos présentations et réunions.`, color: '#7c3aed', icon: 'monitor' },
  { match: /imprimante/i, desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#334155', icon: 'printer' },
  { match: /ordinateur|portable\b|laptop|\bpc\b/i, desc: n => `${n} disponible en prêt auprès de la DSI, prêt à l'emploi pour vos déplacements ou remplacements temporaires.`, color: '#2563eb', icon: 'laptop' },
  { match: /tablette|ipad/i, desc: n => `${n} disponible en prêt auprès de la DSI, pratique pour vos déplacements.`, color: '#0891b2', icon: 'tablet' },
  { match: /smartphone|t[ée]l[ée]phone/i, desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#0284c7', icon: 'phone' },
  { match: /dji|cam[ée]ra|webcam|action ?cam/i, desc: n => `${n} disponible en prêt auprès de la DSI pour vos besoins de captation ou de visioconférence.`, color: '#dc2626', icon: 'camera' },
  { match: /vid[ée]oprojecteur|projecteur/i, desc: n => `${n} disponible en prêt auprès de la DSI pour vos réunions et présentations.`, color: '#ea580c', icon: 'projector' },
  { match: /routeur|modem|galet|hotspot|\b4g\b|\b5g\b/i, desc: n => `${n} disponible en prêt auprès de la DSI pour une connexion internet mobile temporaire.`, color: '#16a34a', icon: 'router' },
  { match: /carte sd|cl[ée] usb|carte m[ée]moire/i, desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#78716c', icon: 'usb' },
  { match: /[ée]cran|moniteur/i, desc: n => `${n} — écran externe disponible en prêt auprès de la DSI pour compléter un poste de travail.`, color: '#7c3aed', icon: 'monitor' },
  { match: /clavier/i, desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#475569', icon: 'keyboard' },
  { match: /souris/i, desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#475569', icon: 'mouse' },
  { match: /casque|micro|audio/i, desc: n => `${n} disponible en prêt auprès de la DSI pour vos appels et visioconférences.`, color: '#16a34a', icon: 'headset' },
  { match: /c[âa]ble|adaptateur|chargeur/i, desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#78716c', icon: 'cable' },
];
const DEFAULT_ENTRY = { desc: n => `${n} disponible en prêt auprès de la DSI.`, color: '#0078a4', icon: 'box' };

// Le nom de l'article est bien plus fiable que sa catégorie (ex. "Modem /
// Routeur 5G" classé par erreur dans la catégorie "Ordinateurs" côté
// catalogue) — on ne retombe sur la catégorie qu'en dernier recours, si le
// nom seul ne correspond à aucun mot-clé.
function classify(name, categoryName) {
  return CATALOG.find(c => c.match.test(name))
    || CATALOG.find(c => c.match.test(categoryName || ''))
    || DEFAULT_ENTRY;
}

// Icônes dessinées à la main (formes géométriques simples, aucune dépendance
// externe) — même principe que la génération SVG déjà utilisée pour les
// désignations de consommables.
const ICONS = {
  laptop: '<rect x="70" y="70" width="100" height="62" rx="4" fill="none" stroke="white" stroke-width="5"/><path d="M55 140 h130 l-10 16 h-110 z" fill="white"/>',
  monitor: '<rect x="65" y="60" width="110" height="72" rx="4" fill="none" stroke="white" stroke-width="5"/><rect x="105" y="132" width="30" height="14" fill="white"/><rect x="90" y="146" width="60" height="6" rx="3" fill="white"/>',
  camera: '<rect x="60" y="80" width="120" height="70" rx="8" fill="none" stroke="white" stroke-width="5"/><circle cx="120" cy="115" r="24" fill="none" stroke="white" stroke-width="5"/><rect x="95" y="65" width="30" height="18" rx="3" fill="white"/>',
  projector: '<rect x="55" y="90" width="90" height="50" rx="6" fill="none" stroke="white" stroke-width="5"/><circle cx="165" cy="115" r="22" fill="none" stroke="white" stroke-width="5"/><circle cx="165" cy="115" r="9" fill="white"/>',
  tablet: '<rect x="80" y="55" width="80" height="110" rx="8" fill="none" stroke="white" stroke-width="5"/><circle cx="120" cy="148" r="4" fill="white"/>',
  keyboard: '<rect x="55" y="90" width="130" height="50" rx="6" fill="none" stroke="white" stroke-width="5"/><line x1="70" y1="105" x2="170" y2="105" stroke="white" stroke-width="3"/><line x1="70" y1="120" x2="170" y2="120" stroke="white" stroke-width="3"/>',
  mouse: '<rect x="100" y="65" width="40" height="70" rx="20" fill="none" stroke="white" stroke-width="5"/><line x1="120" y1="65" x2="120" y2="95" stroke="white" stroke-width="4"/>',
  headset: '<path d="M65 120 a55 55 0 0 1 110 0" fill="none" stroke="white" stroke-width="5"/><rect x="55" y="115" width="18" height="34" rx="6" fill="white"/><rect x="167" y="115" width="18" height="34" rx="6" fill="white"/>',
  phone: '<rect x="92" y="55" width="56" height="110" rx="10" fill="none" stroke="white" stroke-width="5"/><line x1="110" y1="145" x2="130" y2="145" stroke="white" stroke-width="4"/>',
  cable: '<path d="M60 90 q30 -30 60 0 q30 30 60 0" fill="none" stroke="white" stroke-width="6"/><circle cx="60" cy="90" r="8" fill="white"/><circle cx="180" cy="90" r="8" fill="white"/>',
  printer: '<rect x="80" y="65" width="80" height="35" rx="3" fill="none" stroke="white" stroke-width="5"/><rect x="60" y="95" width="120" height="45" rx="6" fill="none" stroke="white" stroke-width="5"/><rect x="90" y="140" width="60" height="18" fill="white"/>',
  router: '<rect x="55" y="100" width="130" height="35" rx="8" fill="none" stroke="white" stroke-width="5"/><line x1="80" y1="100" x2="70" y2="65" stroke="white" stroke-width="5"/><line x1="160" y1="100" x2="170" y2="65" stroke="white" stroke-width="5"/><circle cx="150" cy="117" r="4" fill="white"/><circle cx="165" cy="117" r="4" fill="white"/>',
  usb: '<path d="M85 60 h35 v25 l15 15 v55 h-65 v-55 l15 -15 z" fill="none" stroke="white" stroke-width="5"/><rect x="100" y="60" width="10" height="15" fill="white"/>',
  box: '<rect x="70" y="75" width="100" height="80" rx="6" fill="none" stroke="white" stroke-width="5"/><line x1="70" y1="100" x2="170" y2="100" stroke="white" stroke-width="4"/>',
};

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function buildSvg(name, entry) {
  const icon = ICONS[entry.icon] || ICONS.box;
  const label = escapeXml(truncate(name, 26));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200" width="240" height="200">
  <rect width="240" height="200" rx="14" fill="${entry.color}"/>
  <g transform="translate(0,-6)">${icon}</g>
  <text x="120" y="180" font-size="15" font-weight="600" text-anchor="middle" fill="white" font-family="Arial, sans-serif">${label}</text>
</svg>`;
}

async function main() {
  console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');
  // Charge la config de stockage réelle (SQLite app_settings) avant tout appel
  // à storage.saveFile — cf. CLAUDE.md "SQLite indisponible en script standalone".
  await setupDb();

  const rows = await pgDb.all(`
    SELECT e.id, e.name, e.description, e.image_path, c.display_name AS category_display_name
    FROM hub_prets.equipment e LEFT JOIN hub_prets.categories c ON c.id = e.category_id
    ORDER BY e.id
  `);
  console.log(`Matériel dans la base : ${rows.length}`);
  if (rows.length === 0) { process.exit(0); }

  let descFilled = 0, imgFilled = 0, skipped = 0;

  for (const row of rows) {
    const needsDesc = !row.description || !row.description.trim();
    const needsImg = !row.image_path || !row.image_path.trim();
    if (!needsDesc && !needsImg) {
      console.log(`  ⏭️  #${row.id} "${row.name}" — déjà complet, ignoré`);
      skipped++;
      continue;
    }

    const entry = classify(row.name, row.category_display_name);

    if (needsDesc) {
      const description = entry.desc(row.name);
      console.log(`  📝 #${row.id} "${row.name}" → "${description}"`);
      if (isExecute) {
        await pgDb.run('UPDATE hub_prets.equipment SET description = $1, updated_at = NOW() WHERE id = $2', [description, row.id]);
      }
      descFilled++;
    }

    if (needsImg) {
      const svg = buildSvg(row.name, entry);
      const buffer = Buffer.from(svg, 'utf8');
      const file = { buffer, originalname: 'generique.svg', mimetype: 'image/svg+xml', size: buffer.length };
      console.log(`  🖼️  #${row.id} "${row.name}" → image générique (icône "${entry.icon}")`);
      if (isExecute) {
        const saved = await storage.saveFile(MODULE, `equipment-${row.id}`, file);
        await pgDb.run('UPDATE hub_prets.equipment SET image_path = $1, updated_at = NOW() WHERE id = $2', [saved.dbPath, row.id]);
        try {
          await docsService.registerExternalUpload({
            module: MODULE, entityType: 'equipment_image', entityId: row.id, title: file.originalname,
            filename: saved.filename, originalName: file.originalname, mimetype: file.mimetype,
            size: file.size, storageRef: saved.dbPath, uploadedBy: null,
          });
        } catch (e) { console.warn(`  [DOCS] register échoué pour #${row.id}:`, e.message); }
      }
      imgFilled++;
    }
  }

  console.log('\n--- Résumé ---');
  console.log(`Descriptions générées${isExecute ? '' : ' (simulation)'} : ${descFilled}`);
  console.log(`Images génériques générées${isExecute ? '' : ' (simulation)'} : ${imgFilled}`);
  console.log(`Déjà complets (ignorés) : ${skipped}`);
  if (!isExecute) console.log('\nDry-run terminé — relancer avec --execute pour écrire réellement.');
  process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
