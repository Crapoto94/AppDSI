#!/usr/bin/env node
/**
 * Client en ligne de commande du module dataquery (lecture seule).
 *
 *   Usage sur le LAN uniquement (en DMZ, l'accès Internet passe par le serveur MCP) :
 *   DQ_BASE_URL=http://<backend>:3001  DQ_API_KEY=dsk_...  node dataquery-cli.js <commande>
 *
 * Double authentification : clé API + identification personnelle (AD).
 *   login <identifiant>            ouvre une session (mot de passe demandé, non affiché),
 *                                  enregistrée dans ~/.dataquery-session (droits 600)
 *   logout                         révoque la session
 *
 * Commandes :
 *   health                         état du module, personne connectée
 *   catalog [schema]               modules et tables accessibles
 *   describe <schema.table>        colonnes, PK, FK
 *   sample <schema.table> [n]      n premières lignes (défaut 10)
 *   query "<SQL>" [--max N] [--json] [--params '[1,"x"]']
 *
 * DQ_API_KEY peut être omise si un proxy injecte l'en-tête X-API-Key.
 * Sortie : tableau texte lisible, ou JSON brut avec --json.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = (process.env.DQ_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const KEY = process.env.DQ_API_KEY || '';
const SESSION_FILE = path.join(os.homedir(), '.dataquery-session');
const readSession = () => { try { return fs.readFileSync(SESSION_FILE, 'utf8').trim(); } catch { return ''; } };

function askHidden(prompt) {
    return new Promise((resolve) => {
        const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s); };
        rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
    });
}

async function call(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (KEY) headers['X-API-Key'] = KEY;
    const session = readSession();
    if (session && !path.endsWith('/auth/login')) headers['X-DQ-Session'] = session;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}/api/dataquery${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
        console.error(`HTTP ${res.status}: ${data.error || data.raw || text}${data.hint ? `\n→ ${data.hint}` : ''}`);
        process.exit(1);
    }
    return data;
}

function table(columns, rows) {
    if (rows.length === 0) return '(aucune ligne)';
    const cell = (v) => {
        if (v === null || v === undefined) return '∅';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.replace(/\s+/g, ' ').slice(0, 80);
    };
    const widths = columns.map(c => Math.max(c.length, ...rows.map(r => cell(r[c]).length)));
    const line = (vals) => vals.map((v, i) => v.padEnd(widths[i])).join(' │ ');
    return [line(columns), widths.map(w => '─'.repeat(w)).join('─┼─'), ...rows.map(r => line(columns.map(c => cell(r[c]))))].join('\n');
}

function opt(args, name) {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
}

(async () => {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    if (json) args.splice(args.indexOf('--json'), 1);
    const max = opt(args, '--max');
    const params = opt(args, '--params');
    const [cmd, ...rest] = args;
    const out = (d, fmt) => console.log(json ? JSON.stringify(d, null, 2) : fmt(d));

    switch (cmd) {
        case 'login': {
            if (!rest[0]) throw new Error('Usage : login <identifiant Windows>');
            const password = process.env.DQ_PASSWORD || await askHidden('Mot de passe Windows : ');
            const d = await call('POST', '/auth/login', { username: rest[0], password, client: 'CLI dataquery' });
            fs.writeFileSync(SESSION_FILE, d.session, { mode: 0o600 });
            return console.log(`Session ouverte pour ${d.user.displayName} jusqu'au ${new Date(d.expires_at).toLocaleString('fr-FR')}`);
        }
        case 'logout':
            await call('POST', '/auth/logout');
            fs.rmSync(SESSION_FILE, { force: true });
            return console.log('Session révoquée');
        case 'health':
            return out(await call('GET', '/health'), d => JSON.stringify(d, null, 2));
        case 'catalog': {
            const q = rest[0] ? `?schema=${encodeURIComponent(rest[0])}` : '';
            return out(await call('GET', `/catalog${q}`), d => d.modules.map(m =>
                `■ ${m.schema}${m.module ? ` — ${m.module}` : ''} (${m.tables.length} tables)\n` +
                m.tables.map(t => `   ${t.table}${t.kind !== 'table' ? ` [${t.kind}]` : ''} ~${t.estimated_rows} lignes${t.columns_masked ? ' (colonnes masquées)' : ''}`).join('\n')
            ).join('\n'));
        }
        case 'describe': {
            const [schema, tbl] = String(rest[0] || '').split('.');
            if (!tbl) throw new Error('Usage : describe <schema.table>');
            return out(await call('GET', `/catalog/${encodeURIComponent(schema)}/${encodeURIComponent(tbl)}`), d =>
                `${d.schema}.${d.table}${d.module ? ` — ${d.module}` : ''}\n` +
                table(['name', 'type', 'nullable', 'primary_key', 'comment'], d.columns) +
                (d.foreign_keys.length ? `\n\nFK :\n${d.foreign_keys.map(f => `  ${f.definition}`).join('\n')}` : '') +
                (d.masked_columns_count ? `\n\n${d.masked_columns_count} colonne(s) sensible(s) masquée(s)` : ''));
        }
        case 'sample': {
            const [schema, tbl] = String(rest[0] || '').split('.');
            if (!tbl) throw new Error('Usage : sample <schema.table> [n]');
            const desc = await call('GET', `/catalog/${encodeURIComponent(schema)}/${encodeURIComponent(tbl)}`);
            const cols = desc.columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(', ');
            const n = parseInt(rest[1], 10) || 10;
            return out(await call('POST', '/query', { sql: `SELECT ${cols} FROM "${schema}"."${tbl}"`, max_rows: n }),
                d => table(d.columns, d.rows) + (d.truncated ? `\n… (limité à ${d.max_rows} lignes)` : ''));
        }
        case 'query': {
            if (!rest[0]) throw new Error('Usage : query "<SQL>"');
            const body = { sql: rest[0] };
            if (max) body.max_rows = parseInt(max, 10);
            if (params) body.params = JSON.parse(params);
            return out(await call('POST', '/query', body), d =>
                table(d.columns, d.rows) + `\n${d.row_count} ligne(s) en ${d.duration_ms} ms${d.truncated ? ` — TRONQUÉ à ${d.max_rows} (utiliser --max ou affiner)` : ''}`);
        }
        default:
            console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 24).map(l => l.replace(/^ \*\s?/, '')).join('\n'));
    }
})().catch(e => { console.error(e.message); process.exit(1); });
