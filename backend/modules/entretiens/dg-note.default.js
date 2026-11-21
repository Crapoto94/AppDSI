// Modèle de la note à la Direction générale : le texte (Markdown) est dans dg-note.default.md.
const fs = require('fs');
const path = require('path');

let content = '';
try { content = fs.readFileSync(path.join(__dirname, 'dg-note.default.md'), 'utf8'); } catch (e) { console.error('[ENTRETIENS] modèle de note DG introuvable:', e.message); }
module.exports = content;
