#!/usr/bin/env node
/**
 * Vérifie les guides de modules du MCP (backend/modules/dataquery/dataquery.guides.js) contre le DDL de shared/pg_db.js :
 *   - chaque table citée existe ;
 *   - chaque requête type ne référence que des tables et colonnes qui existent (contrôle statique, sans base de données).
 * Usage : node backend/scripts/check-dataquery-guides.js      (code de sortie 1 si une anomalie est trouvée)
 */
const fs = require('fs');
const path = require('path');
const { GUIDES } = require('../modules/dataquery/dataquery.guides');

const ddl = fs.readFileSync(path.join(__dirname, '../shared/pg_db.js'), 'utf8');

function tableColumns(name) {
    const start = ddl.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
    if (start < 0) return null;
    const end = ddl.indexOf(');', start);
    const cols = new Set();
    for (const raw of ddl.slice(start, end).split('\n').slice(1)) {
        const l = raw.trim().replace(/,$/, '');
        if (!l || /^(--|PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK)/i.test(l)) continue;
        const m = /^([a-z_0-9]+)\s+[A-Za-z]/.exec(l);
        if (m) cols.add(m[1].toLowerCase());
    }
    return cols;
}

// Mots SQL et fonctions autorisés dans les requêtes types
const SQL_WORDS = new Set(('select from where group by order limit join left inner on and or not is null as case when then else end count sum round max min avg ' +
    'date_trunc extract year month coalesce nulls last first desc asc interval current_date between ilike like distinct jsonb_typeof jsonb_array_length ' +
    'in exists true false with over partition union all having int integer text numeric date days day months').split(' '));

let problems = 0;
const fail = (msg) => { problems++; console.error('  ✗', msg); };

for (const g of GUIDES) {
    console.log(`Guide « ${g.key} »`);
    const known = new Map(); // table -> colonnes
    for (const t of g.tables) {
        const cols = tableColumns(t.table);
        if (!cols) { fail(`table inconnue du DDL : ${t.table}`); continue; }
        known.set(t.table, cols);
    }
    for (const ex of g.examples) {
        const refs = [...ex.sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+\.[a-z_]+)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi)];
        const tables = new Map(); const aliases = new Set();
        for (const [, t, a] of refs) {
            if (!known.has(t)) { fail(`« ${ex.question} » : table ${t} absente du guide ou du DDL`); continue; }
            tables.set(t, known.get(t));
            if (a && !SQL_WORDS.has(a.toLowerCase())) aliases.add(a.toLowerCase());
        }
        const allowed = new Set([...SQL_WORDS, ...aliases]);
        for (const cols of tables.values()) for (const c of cols) allowed.add(c);
        for (const [, a] of ex.sql.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)/gi)) allowed.add(a.toLowerCase()); // alias de sortie
        for (const [, t] of refs.map((r) => [0, r[1]])) { allowed.add(t.split('.')[0]); allowed.add(t.split('.')[1]); }
        const body = ex.sql.replace(/'[^']*'/g, ' ').replace(/\$\d+/g, ' ').replace(/::[a-z]+/gi, ' ').replace(/\b\d+\b/g, ' ');
        for (const [w] of body.matchAll(/[a-z_][a-z0-9_]*/gi)) {
            if (!allowed.has(w.toLowerCase())) fail(`« ${ex.question} » : identifiant inconnu « ${w} »`);
        }
        const nParams = new Set([...ex.sql.matchAll(/\$(\d+)/g)].map((m) => m[1])).size;
        if (nParams !== (ex.params || []).length) fail(`« ${ex.question} » : ${nParams} paramètre(s) dans le SQL, ${(ex.params || []).length} fourni(s)`);
        if (!/^\s*(SELECT|WITH)\b/i.test(ex.sql)) fail(`« ${ex.question} » : la requête type doit être en lecture seule`);
    }
}
console.log(problems ? `\n${problems} anomalie(s).` : '\nTous les guides sont cohérents avec le DDL.');
process.exit(problems ? 1 : 0);
