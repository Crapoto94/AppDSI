// fix_avatar2.cjs
const fs = require('fs');
let c = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');

const borderMarker = "border: (agent.DATE_ARRIVEE && agent.DATE_ARRIVEE !== '' && new Date";
const bidx = c.indexOf(borderMarker);
if (bidx === -1) { console.log('Already done'); process.exit(0); }

// Search backwards for the <div with width: '40px'
// Use a simple approach: search backwards line by line
const before = c.substring(0, bidx);
const linesBefore = before.split('\n');
let startLine = -1;
for (let i = linesBefore.length - 1; i >= Math.max(0, linesBefore.length - 20); i--) {
  if (linesBefore[i].includes("width: '40px'")) {
    startLine = i;
    break;
  }
}
console.log('startLine (0-indexed):', startLine);
if (startLine === -1) { console.error('Not found'); process.exit(1); }

// Reconstruct position
const linesBefore2 = c.split('\n');
let charPos = 0;
for (let i = 0; i < startLine; i++) charPos += linesBefore2[i].length + 1; // +1 for \n

// But account for \r\n
const crlf = c.includes('\r\n');
const lineLen = linesBefore2[startLine].length + (crlf ? 2 : 1);

// Actually find the <div> start — go back further to find the <div style={{
const precedingDivMarker = '                                  <div style={{ ';
let searchFrom = charPos - 200;
const divStart = c.indexOf(precedingDivMarker, searchFrom);
console.log('divStart', divStart);
if (divStart === -1) {
  // Try with different format
  const alt = '<div style={{\r\n                                    width';
  const altIdx = c.lastIndexOf(alt, bidx);
  console.log('alt idx', altIdx);
  if (altIdx !== -1) {
    // Find closing </div> 
    const contentStart = c.indexOf('>', altIdx) + 1;
    const closeDiv = c.indexOf('</div>', contentStart) + 6;
    const oldBlock = c.substring(altIdx, closeDiv);
    console.log('Replacing:', oldBlock.substring(0, 100));
    c = c.substring(0, altIdx) + '                                  <AgentAvatar agent={agent} onClick={() => loadAgentDetails(agent)} />' + c.substring(closeDiv);
    fs.writeFileSync('src/pages/StudioRH.tsx', c);
    console.log('Done!');
  } else {
    console.error('Cannot find anywhere');
  }
  process.exit(0);
}
const contentStart = c.indexOf('>', divStart) + 1;
const closeDiv = c.indexOf('</div>', contentStart) + 6;
const oldBlock = c.substring(divStart, closeDiv);
console.log('Replacing:', oldBlock.substring(0, 100));
c = c.substring(0, divStart) + '                                  <AgentAvatar agent={agent} onClick={() => loadAgentDetails(agent)} />' + c.substring(closeDiv);
fs.writeFileSync('src/pages/StudioRH.tsx', c);
console.log('Done!');
