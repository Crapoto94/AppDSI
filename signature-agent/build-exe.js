#!/usr/bin/env node
/**
 * Construit l'exécutable autonome de l'agent (Windows) : dist/DSIHubSignatureAgent.exe
 *  - Node « Single Executable Application » : le runtime Node et agent.js sont embarqués, aucune installation de Node
 *    n'est requise sur le poste ;
 *  - sous-système « fenêtré » : aucune fenêtre console (l'agent tourne en arrière-plan ; journal dans
 *    %LOCALAPPDATA%\DSIHubSignatureAgent\agent.log).
 * Usage (sur un poste de développement, avec Node 20+ et un accès à npm) : node build-exe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dist = path.join(__dirname, 'dist');
const exe = path.join(dist, 'DSIHubSignatureAgent.exe');
const blob = path.join(dist, 'agent.blob');

function run(cmd, args, opts = {}) {
  const r = spawnSync(/\s/.test(cmd) ? `"${cmd}"` : cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) { console.error(`Échec : ${cmd} ${args.join(' ')}`); process.exit(1); }
}

// On vide le dossier sans le supprimer : un Explorateur ou un antivirus qui l'a ouvert bloquerait sa suppression
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(dist)) fs.rmSync(path.join(dist, f), { recursive: true, force: true });

// 1. Blob SEA (agent.js)
const cfg = path.join(dist, 'sea-config.json');
fs.writeFileSync(cfg, JSON.stringify({ main: path.join(__dirname, 'agent.js'), output: blob, disableExperimentalSEAWarning: true }));
run(process.execPath, ['--experimental-sea-config', cfg]);

// 2. Copie du runtime Node puis injection du blob
fs.copyFileSync(process.execPath, exe);
run('npx', ['--yes', 'postject', `"${exe}"`, 'NODE_SEA_BLOB', `"${blob}"`, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);

// 3. Sous-système « Windows » (2) à la place de « Console » (3) : plus de fenêtre noire
const buf = fs.readFileSync(exe);
const pe = buf.readUInt32LE(0x3c);
if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') { console.error('Exécutable PE invalide.'); process.exit(1); }
buf.writeUInt16LE(2, pe + 24 + 68);
fs.writeFileSync(exe, buf);

fs.rmSync(blob, { force: true });
fs.rmSync(cfg, { force: true });
console.log(`\nExécutable prêt : ${exe} (${(fs.statSync(exe).size / 1048576).toFixed(0)} Mo)`);
