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

function extractBuild(osversion) {
  if (!osversion) return null;
  const m = String(osversion).match(/\((\d+)\)/) || String(osversion).match(/(\d{4,6})/);
  return m ? parseInt(m[1], 10) : null;
}

// { family, versionLabel, sortKey } — sortKey = build number (0/-1 si inconnu), pour trier
// les versions de la plus récente à la plus ancienne au sein d'une famille.
function classifyOs(operatingsystem, osversion) {
  const os = (operatingsystem || '').trim();
  const build = extractBuild(osversion);
  const lower = os.toLowerCase();

  if (!os) return { family: 'Inconnu', versionLabel: 'Inconnu', sortKey: -1 };

  if (lower.includes('server')) {
    const yearMatch = os.match(/20\d{2}(\s*r2)?/i);
    const family = yearMatch ? `Windows Server ${yearMatch[0].toUpperCase().replace('R2', 'R2')}` : os;
    const versionLabel = (build && SERVER_BUILDS[build]) ? SERVER_BUILDS[build] : (build ? `Build ${build}` : 'Inconnu');
    return { family, versionLabel, sortKey: build || 0 };
  }

  if (lower.includes('windows 11')) {
    let versionLabel = 'Inconnu';
    if (build && WIN11_BUILDS[build]) versionLabel = WIN11_BUILDS[build];
    else if (build && build > WIN11_LATEST_STABLE_BUILD) versionLabel = `Insider (${build})`;
    else if (build) versionLabel = `Build ${build}`;
    return { family: 'Windows 11', versionLabel, sortKey: build || 0 };
  }

  if (lower.includes('windows 10')) {
    const versionLabel = (build && WIN10_BUILDS[build]) ? WIN10_BUILDS[build] : (build ? `Build ${build}` : 'Inconnu');
    return { family: 'Windows 10', versionLabel, sortKey: build || 0 };
  }

  // Autres OS (Windows 7/8, Linux, macOS…) : famille = libellé brut tel quel.
  return { family: os, versionLabel: osversion || 'Inconnu', sortKey: build || 0 };
}

module.exports = { classifyOs, extractBuild };
