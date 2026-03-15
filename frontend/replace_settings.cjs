const fs = require('fs');

let content = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');

const regexSettings = /{currentView === 'settings' && \([\s\S]*?opacity: 0\.6 \}\}>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>\s*<\/div>\n\s*\)}/;
const replacementSettings = `{currentView === 'settings' && (
              <SettingsViewStudio headers={headers} activePositions={activePositions} fetchAvailablePositions={fetchAvailablePositions} setShowActivePositionsModal={setShowActivePositionsModal} />
            )}`;
if (regexSettings.test(content)) {
    content = content.replace(regexSettings, replacementSettings);
    console.log('Replaced Settings block');
} else {
    console.log('regexSettings did not match!');
}

const divStr1 = `<div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', flexShrink: 0 }}>
                                     {agent.nom.charAt(0)}{agent.prenom.charAt(0)}
                                   </div>`;
const divStr2 = `<div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                                 {agent.nom.charAt(0)}{agent.prenom.charAt(0)}
                               </div>`;
if (content.indexOf(divStr1) !== -1) {
    content = content.replace(divStr1, '<AgentAvatar agent={agent} />');
    console.log('Replaced avatar 1 block');
} else {
    console.log('avatar 1 did not match!');
}

if (content.indexOf(divStr2) !== -1) {
    content = content.replace(divStr2, '<AgentAvatar agent={agent} />');
    console.log('Replaced avatar 2 block');
} else {
    console.log('avatar 2 did not match!');
}

fs.writeFileSync('src/pages/StudioRH.tsx', content);
