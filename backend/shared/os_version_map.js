// ── Correspondance build Windows → nom de version marketing ───────────────────
// AD ne renvoie que operatingSystem ("Microsoft Windows 10 Pro") et
// operatingSystemVersion ("10.0 (19045)"). On en déduit une famille lisible
// (Windows 10 / Windows 11 / Windows Server 2019…) et une version marketing
// (22H2, 24H2…) à partir du numéro de build, seule donnée fiable dans osversion.
const WIN10_BUILDS = {
  10240: '1507', 10586: '1511', 14393: '1607', 15063: '1703', 16299: '1709',
  17134: '1803', 17763: '1809', 18362: '1903', 18363: '1909',
  19041: '2004', 19042: '20H2', 19043: '21H1', 19044: '21H2', 19045: '22H2',
};
const WIN11_BUILDS = {
  21390: 'Insider (Dev)', 22000: '21H2', 22621: '22H2', 22631: '23H2',
  26100: '24H2', 26200: '25H2', 29585: 'Insider (Canary)',
};
// Plus haut build officiellement sorti (hors Insider) : sert de repère pour le
// fallback ci-dessous — au-delà, un build inconnu est presque sûrement un canal
// Insider/Canary (numérotation qui avance vite, sans nom marketing fixe).
const WIN11_LATEST_STABLE_BUILD = 26200;
const SERVER_BUILDS = {
  9600: '2012 R2', 14393: '2016', 17763: '2019', 20348: '2022', 26100: '2025',
};

// Nom marketing + date de sortie initiale par version majeure de macOS.
// Source : https://en.wikipedia.org/wiki/MacOS_version_history
const MACOS_NAMES = {
  '10.9': { name: 'Mavericks', release: '2013-10-22' },
  '10.10': { name: 'Yosemite', release: '2014-10-16' },
  '10.11': { name: 'El Capitan', release: '2015-09-30' },
  '10.12': { name: 'Sierra', release: '2016-09-20' },
  '10.13': { name: 'High Sierra', release: '2017-09-25' },
  '10.14': { name: 'Mojave', release: '2018-09-24' },
  '10.15': { name: 'Catalina', release: '2019-10-07' },
  '11': { name: 'Big Sur', release: '2020-11-12' },
  '12': { name: 'Monterey', release: '2021-10-25' },
  '13': { name: 'Ventura', release: '2022-10-24' },
  '14': { name: 'Sonoma', release: '2023-09-26' },
  '15': { name: 'Sequoia', release: '2024-09-16' },
  '26': { name: 'Tahoe', release: '2025-09-15' },
};

// Fin de support (édition Home/Pro/Pro Education/Pro for Workstations, canal General
// Availability) par version marketing. Source :
// https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client
// (dates confirmées) et windows10/11-release-information (dernière build livrée avant
// arrêt, pour les versions plus anciennes non listées sur la page "supported-versions").
// 'ended' = confirmé en fin de support mais sans date exacte publiée sur ces pages.
const WIN10_EOL = {
  '1507': '2017-05-09', '1511': '2017-10-10', '1607': '2018-04-10', '1703': '2018-10-09',
  '1709': '2019-04-09', '1803': '2019-11-12', '1809': '2020-11-10', '1903': '2020-12-08',
  '1909': '2021-05-11', '2004': '2021-12-14', '20H2': '2022-05-10', '21H1': '2022-12-13',
  '21H2': '2023-06-13', '22H2': '2025-10-14',
};
const WIN11_EOL = {
  '21H2': '2024-10-08', '22H2': '2025-10-14', '23H2': 'ended',
  '24H2': '2026-10-13', '25H2': '2027-10-12',
};

function extractBuild(osversion) {
  if (!osversion) return null;
  const m = String(osversion).match(/\((\d+)\)/) || String(osversion).match(/(\d{4,6})/);
  return m ? parseInt(m[1], 10) : null;
}

function fmtFrDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Statut de support Windows : compare la date de fin de support (Home/Pro) à aujourd'hui.
function windowsSupport(table, versionLabel) {
  const eol = table[versionLabel];
  if (!eol) return { supported: null, label: 'Statut de support inconnu' };
  if (eol === 'ended') return { supported: false, label: 'Non supporté' };
  const supported = new Date() < new Date(eol);
  return supported
    ? { supported: true, label: `Supporté jusqu'au ${fmtFrDate(eol)}` }
    : { supported: false, label: `Non supporté (support terminé le ${fmtFrDate(eol)})` };
}

// Ordre chronologique explicite des versions majeures macOS : NE PAS dériver de
// Object.keys(MACOS_NAMES) (ni d'un tri parseFloat) — JS trie les clés "numériques"
// ('11'..'26') avant les clés non-numériques ('10.9'..'10.15') quel que soit l'ordre
// d'écriture, et "10.15" < "10.9" en flottant : les deux inversent l'ordre réel.
const MACOS_MAJOR_ORDER = [
  '10.9', '10.10', '10.11', '10.12', '10.13', '10.14', '10.15',
  '11', '12', '13', '14', '15', '26',
];

// Statut de support macOS : Apple ne publie pas de date de fin de support fixe — la
// politique observée est de fournir des mises à jour de sécurité à la version en cours
// et aux deux précédentes. Au-delà, la version est considérée non supportée.
function macosSupport(major) {
  const idx = MACOS_MAJOR_ORDER.indexOf(major);
  if (idx === -1) return { supported: null, label: 'Statut de support inconnu' };
  const supported = idx >= MACOS_MAJOR_ORDER.length - 3;
  return supported
    ? { supported: true, label: 'Supporté (dans les 3 dernières versions macOS)' }
    : { supported: false, label: 'Non supporté (plus dans les 3 dernières versions macOS)' };
}

// { family, versionLabel, sortKey } — sortKey = build number (0/-1 si inconnu), pour trier
// les versions de la plus récente à la plus ancienne au sein d'une famille.
function classifyOs(operatingsystem, osversion) {
  const os = (operatingsystem || '').trim();
  const build = extractBuild(osversion);
  const lower = os.toLowerCase();

  if (!os) return { family: 'Inconnu', versionLabel: 'Inconnu', sortKey: -1, isServer: false, support: null };

  if (lower.includes('server')) {
    const yearMatch = os.match(/20\d{2}(\s*r2)?/i);
    const family = yearMatch ? `Windows Server ${yearMatch[0].toUpperCase().replace('R2', 'R2')}` : os;
    const versionLabel = (build && SERVER_BUILDS[build]) ? SERVER_BUILDS[build] : (build ? `Build ${build}` : 'Inconnu');
    // Cycle de support Server non modélisé ici (dépend de LTSC/CBB) : non renseigné.
    return { family, versionLabel, sortKey: build || 0, isServer: true, support: null };
  }

  if (lower.includes('windows 11')) {
    let versionLabel = 'Inconnu';
    if (build && WIN11_BUILDS[build]) versionLabel = WIN11_BUILDS[build];
    else if (build && build > WIN11_LATEST_STABLE_BUILD) versionLabel = `Insider (${build})`;
    else if (build) versionLabel = `Build ${build}`;
    return { family: 'Windows 11', versionLabel, sortKey: build || 0, isServer: false, support: windowsSupport(WIN11_EOL, versionLabel) };
  }

  if (lower.includes('windows 10')) {
    const versionLabel = (build && WIN10_BUILDS[build]) ? WIN10_BUILDS[build] : (build ? `Build ${build}` : 'Inconnu');
    return { family: 'Windows 10', versionLabel, sortKey: build || 0, isServer: false, support: windowsSupport(WIN10_EOL, versionLabel) };
  }

  // macOS : selon l'ancienneté du Mac, l'AD renvoie "macOS" ou l'ancien nom
  // "Mac OS X" comme operatingSystem — dans les deux cas la vraie version
  // (ex: "14.6") est dans osversion, jamais dans operatingsystem. On regroupe
  // donc toujours sous une seule famille "macOS" (avant ce cas dédié, "macOS"
  // et "Mac OS X" formaient deux familles séparées, d'où un total sous-compté).
  if (lower.startsWith('macos') || lower.startsWith('mac os')) {
    // Les suffixes entre parenthèses ("10.15 (2026)", "26.5 (84)") sont un
    // identifiant de build interne, pas une donnée Apple standard : on l'ignore
    // pour l'affichage et le tri, on ne garde que le numéro de version X.Y.Z.
    const verClean = (osversion || '').replace(/\s*\([^)]*\)/, '').trim();
    if (!verClean) return { family: 'macOS', versionLabel: 'Inconnu', sortKey: 0, isServer: false, support: null };
    const major = verClean.startsWith('10.') ? verClean.split('.').slice(0, 2).join('.') : verClean.split('.')[0];
    const info = MACOS_NAMES[major];
    const parts = verClean.split('.').map(n => parseInt(n, 10) || 0);
    const sortKey = (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
    const versionLabel = info ? `${verClean} ${info.name} · ${fmtFrDate(info.release)}` : verClean;
    return { family: 'macOS', versionLabel, sortKey, isServer: false, support: macosSupport(major) };
  }

  // Autres OS (Windows 7/8, Linux…) : famille = libellé brut tel quel, comptés comme
  // "poste de travail" (aucun ne correspond à un OS serveur connu ici).
  return { family: os, versionLabel: osversion || 'Inconnu', sortKey: build || 0, isServer: false, support: null };
}

module.exports = { classifyOs, extractBuild };
