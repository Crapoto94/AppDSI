#!/usr/bin/env node
'use strict';
/**
 * Génère l'historique des versions d'un module à partir des messages de commit git.
 *
 * RÈGLE GÉNÉRALE (tous les modules) : un module a un numéro de version et un historique des « nouveautés », visibles des
 * administrateurs en cliquant sur le numéro. L'historique est nourri par les descriptions des commits : écrire des messages
 * de commit lisibles en français (« feat(module): ce qui change pour l'utilisateur »), puis relancer ce script avant le déploiement.
 *
 * Usage : node backend/scripts/gen-module-changelog.js <module> <chemin> [<chemin> ...]
 * Exemple : node backend/scripts/gen-module-changelog.js entretiens backend/modules/entretiens backend/modules/ep-base backend/modules/ep-ville magapp-frontend/src/ep
 * Commits à écarter (ils touchent les fichiers du module sans le concerner) : backend/modules/<module>/version-exclude.json,
 * liste [{ "commit": "abc12345", "motif": "…" }].
 * Sortie : backend/modules/<module>/version-history.json  { module, version, date, releases: [{version, date, groups: {nouveautes, ameliorations, corrections}}] }
 *
 * Numérotation (module pas encore stabilisé : 0.x.y) : CHAQUE commit est une version. Le premier est 0.1.0 ; ensuite une « feat » fait +1 mineur
 * (0.x.0) et tout autre commit (fix, perf, refactor, docs…) fait +1 correctif (0.x.y). Le passage en 1.0.0 se décide à la main (option --majeur=1).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [mod, ...paths] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!mod || !paths.length) { console.error('Usage : node gen-module-changelog.js <module> <chemin> [<chemin> ...]'); process.exit(1); }

const root = path.resolve(__dirname, '..', '..');
const raw = execFileSync('git', ['log', '--reverse', '--date=short', '--format=%x1e%ad%x1f%h%x1f%s%x1f%b', '--', ...paths], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const SKIP = /^(merge|wip|tmp|chore\(release\))/i;
const parse = (subject) => {
    const m = String(subject).match(/^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/);
    return m ? { type: m[1].toLowerCase(), text: m[3].trim() } : { type: 'autre', text: String(subject).trim() };
};
const sentence = (t) => { const s = String(t).trim().replace(/\s+/g, ' '); return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[.\s]+$/, '') : ''; };
/** Un message de commit long (« A ; B ; C ») devient plusieurs puces. */
const bullets = (text) => {
    // Coupe sur « ; » uniquement hors parenthèses
    const parts = []; let depth = 0; let cur = '';
    for (const ch of String(text)) {
        if (ch === '(' || ch === '«') depth += 1;
        if (ch === ')' || ch === '»') depth = Math.max(0, depth - 1);
        if (ch === ';' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts.map(sentence).filter(Boolean);
};

let excluded = [];
const excludeFile = path.join(root, 'backend', 'modules', mod, 'version-exclude.json');
if (fs.existsSync(excludeFile)) excluded = JSON.parse(fs.readFileSync(excludeFile, 'utf8')).map(x => x.commit);

const commits = [];
for (const rec of raw.split('').slice(1)) {
    const [date, hash, subject] = rec.split('');
    if (!subject || SKIP.test(subject.trim()) || excluded.some(x => x.startsWith(hash) || hash.startsWith(x))) continue;
    const { type, text } = parse(subject.trim());
    const group = type === 'feat' ? 'nouveautes' : type === 'fix' ? 'corrections' : 'ameliorations';
    commits.push({ date, hash, type, group, bullets: bullets(text) });
}

// Un commit = une version. 0.1.0 pour le premier ; « feat » : +1 mineur ; sinon : +1 correctif.
const majeurArg = (process.argv.find(a => a.startsWith('--majeur=')) || '').split('=')[1];
let major = majeurArg ? Number(majeurArg) : 0, minor = 0, patch = 0;
const releases = commits.map((c, i) => {
    if (i === 0) { minor = 1; patch = 0; } else if (c.type === 'feat') { minor += 1; patch = 0; } else patch += 1;
    const groups = { nouveautes: [], ameliorations: [], corrections: [] };
    groups[c.group] = c.bullets;
    return { version: `${major}.${minor}.${patch}`, date: c.date, commit: c.hash, groups };
});

const last = releases[releases.length - 1] || { version: '1.0.0', date: '' };
const out = { module: mod, version: last.version, date: last.date, releases: releases.reverse() };
const file = path.join(root, 'backend', 'modules', mod, 'version-history.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`${mod} : version ${out.version} (${last.date}), ${out.releases.length} versions, ${out.releases.reduce((n, r) => n + Object.values(r.groups).flat().length, 0)} entrées → ${path.relative(root, file)}`);
