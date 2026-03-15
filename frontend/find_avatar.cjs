// find_avatar.cjs - debug
const fs = require('fs');
const c = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');
const marker = "background: '#f1f5f9'";
const idx = c.indexOf(marker);
console.log('idx=' + idx);
if (idx > -1) {
  const start = c.lastIndexOf('<div style={{', idx);
  console.log('divStart=' + start);
  console.log('snippet:', JSON.stringify(c.substring(start, start + 40)));
  // Find lines
  const linesBefore = c.substring(0, start).split('\n').length;
  console.log('approx line:', linesBefore);
}
// Also search for the unique border line
const borderLine = "border: (agent.DATE_ARRIVEE";
const bidx = c.indexOf(borderLine);
console.log('borderLine idx=' + bidx);
if (bidx > -1) {
  const lineNo = c.substring(0, bidx).split('\n').length;
  console.log('borderLine approx line:', lineNo);
}
