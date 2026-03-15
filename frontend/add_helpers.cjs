const fs = require('fs');

let content = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');

// 1. Inject getManagerStyle
const getManagerStyleStr = `
const getManagerStyle = (poste: string) => {
  if (!poste) return null;
  const p = poste.toUpperCase();
  if (p.startsWith('DIRECTEUR·TRICE GENERAL·E')) return MANAGEMENT_LEVELS[0];
  if (p.startsWith('DIRECTEUR·TRICE D')) return MANAGEMENT_LEVELS[1];
  if (p.startsWith('RESPONSABLE DU SERVICE')) return MANAGEMENT_LEVELS[2];
  if (p.startsWith('RESPONSABLE DU SECTEUR')) return MANAGEMENT_LEVELS[3];
  return null;
};
`;

if (!content.includes('const getManagerStyle')) {
   const insertIdx = content.indexOf('const EncadrantsView');
   content = content.substring(0, insertIdx) + getManagerStyleStr + '\n' + content.substring(insertIdx);
}

// 2. We need an AgentAvatar component to handle the UI consistently.
const agentAvatarStr = `
const AgentAvatar = ({ agent }: { agent: any }) => {
  const mStyle = getManagerStyle(agent.POSTE_L || agent.poste_l);
  const color = mStyle ? mStyle.color : '#64748b';
  const bg = mStyle ? mStyle.color + '22' : '#f1f5f9';
  const border = mStyle ? \`2px solid \${mStyle.color}33\` : '2px solid transparent';
  
  // Handling inactive dashed borders if necessary
  const isInactive = agent.is_active_position === false || agent.date_plusvu || (agent.DATE_DEPART && new Date(agent.DATE_DEPART) <= new Date());
  const finalBorder = isInactive ? '2px dashed #94a3b8' : border;
  
  return (
    <div style={{
      width: '40px', minWidth: '40px', height: '40px', 
      background: bg,
      color: color,
      borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
      fontSize: '14px', fontWeight: 700,
      border: finalBorder,
      flexShrink: 0
    }}>
      {(agent.PRENOM || agent.prenom || '')[0]}{(agent.NOM || agent.nom || '')[0]}
    </div>
  );
};
`;

if (!content.includes('const AgentAvatar')) {
   const insertIdx2 = content.indexOf('const EncadrantsView');
   content = content.substring(0, insertIdx2) + agentAvatarStr + '\n' + content.substring(insertIdx2);
}

fs.writeFileSync('src/pages/StudioRH.tsx', content);
console.log('Helpers injected!');
