// patch2.cjs — applique les changements restants sur la version commitée
const fs = require('fs');
let c = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');

// ─── 1. Rename "Utilisateurs" → "Agents" in menu ─────────────────────────────
c = c.replace(`{ id: 'users', title: "Utilisateurs", icon: Users },`,
              `{ id: 'users', title: "Agents", icon: Users },`);
console.log('1. Menu renommé');

// ─── 2. Default limit 50 → 10 ─────────────────────────────────────────────────
c = c.replace('const [limit, setLimit] = useState(50);',
              'const [limit, setLimit] = useState(10);');
console.log('2. Limit par défaut → 10');

// ─── 3. Header title "Liste des utilisateurs" → "Liste des agents" ────────────
c = c.replace('>Liste des utilisateurs<', '>Liste des agents<');
console.log('3. Titre modifié');

// ─── 4. Breadcrumb for new views ──────────────────────────────────────────────
c = c.replace(
  `{currentView === 'users' ? 'Liste des utilisateurs' : \r\n                 currentView === 'dashboard' ? 'Tableau de bord' :\r\n                 currentView === 'encadrants' ? 'Encadrants' :\r\n                 currentView === 'settings' ? 'Param\u00e8tres' : 'Logs de synchronisation'}`,
  `{currentView === 'users' ? 'Agents' : \r\n                 currentView === 'dashboard' ? 'Tableau de bord' :\r\n                 currentView === 'encadrants' ? 'Encadrants' :\r\n                 currentView === 'onboarding' ? 'Onboarding' :\r\n                 currentView === 'services' ? 'Services & Directions' :\r\n                 currentView === 'alignments' ? 'Alignements' :\r\n                 currentView === 'settings' ? 'Param\u00e8tres' : 'Logs de synchronisation'}`
);
console.log('4. Breadcrumb étendu');

// ─── 5. Replace the column header "Départ/Arrivée" → "Statut" ─────────────────
// Find it by detecting the specific TH that has "Départ/Arrivée"
const departHead = 'D\u00e9part/Arriv\u00e9e';
const idx = c.indexOf(departHead);
if (idx === -1) { console.error('5. NOT FOUND: Départ/Arrivée TH'); }
else {
  // Find the full <th ...>Départ/Arrivée</th> to replace
  const thStart = c.lastIndexOf('<th', idx);
  const thEnd = c.indexOf('</th>', idx) + 5;
  const oldTH = c.substring(thStart, thEnd);
  const newTH = oldTH.replace('D\u00e9part/Arriv\u00e9e', 'Statut');
  c = c.substring(0, thStart) + newTH + c.substring(thEnd);
  console.log('5. Header Départ/Arrivée → Statut');
}

// ─── 6. Replace departure date cell content ────────────────────────────────────
const oldDepCell = `                                {agent.DATE_DEPART ? (\r\n                                  <div style={{ color: new Date(agent.DATE_DEPART) <= new Date() ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>\r\n                                     D\u00e9part: {formatDateFr(agent.DATE_DEPART)}\r\n                                  </div>\r\n                                ) : (agent.DATE_ARRIVEE && agent.DATE_ARRIVEE !== '' && new Date(agent.DATE_ARRIVEE) > new Date()) ? (\r\n                                  <div style={{ color: '#3b82f6', fontWeight: 600 }}>\r\n                                     Arriv\u00e9e: {formatDateFr(agent.DATE_ARRIVEE)}\r\n                                  </div>\r\n                                ) : '-'}`;
const newDepCell = `                                {(() => {
                                  const now = new Date();
                                  const dep = agent.DATE_DEPART ? new Date(agent.DATE_DEPART) : null;
                                  const arr = agent.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE) : null;
                                  if (dep && dep <= now) return <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#fef2f2', borderRadius: '4px' }}>Parti</span>;
                                  if (arr && arr > now) return <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#eff6ff', borderRadius: '4px' }}>Prochaine arriv\u00e9e</span>;
                                  if (arr && (now.getTime() - arr.getTime()) < 30 * 24 * 3600 * 1000) return <span style={{ color: '#059669', fontWeight: 700, fontSize: '11px', padding: '2px 6px', background: '#ecfdf5', borderRadius: '4px' }}>Nouveau</span>;
                                  return <span style={{ color: '#059669', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#ecfdf5', borderRadius: '4px' }}>Actif</span>;
                                })()}`;
if (c.includes(oldDepCell)) {
  c = c.replace(oldDepCell, newDepCell);
  console.log('6. Departure cell → status badges');
} else {
  // Try alternate with \n instead of \r\n
  const alt = oldDepCell.replace(/\r\n/g, '\n');
  if (c.includes(alt)) { c = c.replace(alt, newDepCell); console.log('6. Departure cell (LF) → status badges'); }
  else console.error('6. NOT FOUND: departure date cell');
}

// ─── 7. Replace avatar div in agent table  ─────────────────────────────────────
// The big inline avatar div, find by unique substring
const bigAvStart = 'width: \'40px\', \r\n                                    height: \'40px\', \r\n                                    background: \'#f1f5f9\'';
const bigAvStartAlt = "width: '40px', \r\n                                    height: '40px', \r\n                                    background: '#f1f5f9'";
let avatarStart = c.indexOf(bigAvStartAlt);
if (avatarStart === -1) {
  // try LF
  const lfVersion = bigAvStartAlt.replace(/\r\n/g, '\n');
  avatarStart = c.indexOf(lfVersion);
}
if (avatarStart !== -1) {
  // Find the enclosing <div starting from before
  const divOpen = c.lastIndexOf('<div style={{', avatarStart);
  // Find the matching </div>
  let depth = 1, pos = c.indexOf('>', divOpen) + 1;
  while (depth > 0 && pos < c.length) {
    const nextOpen = c.indexOf('<div', pos);
    const nextClose = c.indexOf('</div>', pos);
    if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + 4; }
    else if (nextClose !== -1) { depth--; if (depth === 0) { pos = nextClose + 6; } else pos = nextClose + 6; }
    else break;
  }
  const oldAvatar = c.substring(divOpen, pos);
  const newAvatar = `<AgentAvatar agent={agent} onClick={() => loadAgentDetails(agent)} />`;
  c = c.substring(0, divOpen) + newAvatar + c.substring(pos);
  console.log('7. Avatar div replaced with AgentAvatar component');
} else {
  // Maybe fix_all.cjs already replaced it earlier
  console.log('7. Avatar div not found (already replaced or different format)');
}

// ─── 8. License short name ────────────────────────────────────────────────────
const licOld = "agent.azure_license.includes('E5') ? 'E5' : \r\n                                           agent.azure_license.includes('E3') ? 'E3' : \r\n                                           agent.azure_license.includes('PREMIUM') ? 'BP' : \r\n                                           agent.azure_license.includes('STANDARD') ? 'BS' : \r\n                                           agent.azure_license.split('_').pop()";
const licNew = `(() => {
                                            const l = agent.azure_license;
                                            if (l.includes('E5')) return 'E5';
                                            if (l.includes('E3')) return 'E3';
                                            if (l.includes('E1')) return 'E1';
                                            if (l.includes('F3')) return 'F3';
                                            if (l.includes('F1')) return 'F1';
                                            if (l.includes('BUSINESS_PREMIUM')) return 'BP';
                                            if (l.includes('BUSINESS_STANDARD')) return 'BS';
                                            if (l.includes('BUSINESS_BASIC')) return 'BB';
                                            return l.split('_').slice(-1)[0];
                                          })()`;
if (c.includes(licOld)) { c = c.replace(licOld, licNew); console.log('8. License display updated'); }
else {
  const altLic = licOld.replace(/\r\n/g, '\n');
  if (c.includes(altLic)) { c = c.replace(altLic, licNew); console.log('8. License (LF) updated'); }
  else console.log('8. License not found (may have been updated)');
}

// ─── 9. AgentAvatar — enrich with status/badges  ──────────────────────────────
// The fix_all.cjs already handles the AgentAvatar via unicode comments, but
// since unicode box-drawing breaks node string literals, we find it by index
const avatarCompStart = 'const AgentAvatar = ({ agent }';
const avatarCompEnd = '\r\n};\r\n\r\nconst OnboardingView';
const acIdx = c.indexOf(avatarCompStart);
const aeIdx = c.indexOf(avatarCompEnd, acIdx);
if (acIdx !== -1 && aeIdx !== -1) {
  const newAvatarComp = `const AgentAvatar = ({ agent, onClick }: { agent: any; onClick?: () => void }) => {
  const now = new Date();
  const lvl = agent?.management_level;
  const COLS: Record<string, string> = { dg: '#7c3aed', dir: '#1d4ed8', service: '#0369a1', secteur: '#0f766e' };
  const bg = lvl && COLS[lvl] ? COLS[lvl] + '22' : '#e2e8f0';
  const color = lvl && COLS[lvl] ? COLS[lvl] : '#64748b';
  const arrivalDate = agent?.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE) : null;
  const departDate = agent?.DATE_DEPART ? new Date(agent.DATE_DEPART) : null;
  const isDepart = !!(departDate && departDate <= now);
  const isFuture = !!(arrivalDate && arrivalDate > now);
  const isNew = !isDepart && !isFuture && !!(arrivalDate && (now.getTime() - arrivalDate.getTime()) < 30 * 24 * 3600 * 1000);
  const isInactive = !isDepart && !isFuture && agent?.is_active === false;
  let border = 'none';
  if (isDepart) border = '2px dashed #ef4444';
  else if (isFuture) border = '2px dashed #3b82f6';
  else if (isInactive) border = '2px dashed #94a3b8';
  return (
    <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', border, overflow: 'hidden', position: 'relative' }}>
        {agent?.nom?.charAt(0)}{agent?.prenom?.charAt(0)}
        {isDepart && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #ef444466 50%, transparent calc(50% + 1px))', pointerEvents: 'none' }} />}
      </div>
      {isNew && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#059669', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', lineHeight: '1.4' }}>NOUV</span>}
      {isFuture && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#3b82f6', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', lineHeight: '1.4' }}>PROCH</span>}
    </div>
  );
}`;
  c = c.substring(0, acIdx) + newAvatarComp + c.substring(aeIdx);
  console.log('9. AgentAvatar enriched');
} else {
  console.error('9. AgentAvatar component NOT found (acIdx=' + acIdx + ' aeIdx=' + aeIdx + ')');
}

// ─── 10. SettingsViewStudio — fetch Mourad Badoud ─────────────────────────────
c = c.replace(
  `axios.get('/api/admin/rh/agents', { headers, params: { limit: 1 } }).then(res => {
      const ag = Array.isArray(res.data?.agents) ? res.data.agents[0] : (Array.isArray(res.data) ? res.data[0] : null);
      if (ag) setExampleAgent(ag);
    }).catch(() => {});`,
  `axios.get('/api/admin/rh/agents', { headers, params: { q: 'BADOUD', limit: 5 } }).then(res => {
      const list = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      const mourad = list.find((a: any) => (a.nom || '').toUpperCase().includes('BADOUD'));
      const ag = mourad || list[0] || null;
      if (ag) setExampleAgent(ag);
    }).catch(() => {});`
);
console.log('10. Settings: fetch Mourad Badoud');

// ─── 11. Settings display: show RH value in select label ──────────────────────
c = c.replace(
  `{rhKeys.map(k => <option key={k} value={k}>{k}{exampleAgent?.[k] ? ' (' + exampleAgent[k] + ')' : ''}</option>)}`,
  `{rhKeys.map(k => <option key={k} value={k}>{k}{exampleAgent?.[k] ? ' \u2014 ' + String(exampleAgent[k]).substring(0, 40) : ''}</option>)}`
);
console.log('11. Settings: RH field values in select');

// ─── Save ─────────────────────────────────────────────────────────────────────
fs.writeFileSync('src/pages/StudioRH.tsx', c);
console.log('\nDone!');
