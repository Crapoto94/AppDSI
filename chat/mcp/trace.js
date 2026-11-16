/**
 * Traçage de TOUS les flux du serveur MCP, une ligne JSON par échange :
 *   - flux « entrant » : chaque requête HTTP reçue (client MCP / navigateur) et sa réponse ;
 *   - flux « sortant » : chaque appel au backend LAN et sa réponse.
 *
 * Fichiers : ${MCP_TRACE_DIR}/mcp-trace-AAAA-MM-JJ.jsonl (un par jour, UTC).
 * Les secrets (mots de passe, clé API, jetons, codes OAuth, verifier PKCE…) ne sont
 * jamais écrits : ils sont remplacés par une empreinte courte (sha256, 10 car.) qui
 * permet de corréler deux lignes sans exposer la valeur.
 *
 * MCP_TRACE_BODIES = full (défaut) : corps complets, tronqués à MCP_TRACE_MAX_BYTES ;
 *                    meta          : uniquement taille + empreinte des corps.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = process.env.MCP_TRACE_DIR || '/var/log/appdsi-mcp';
const MODE = process.env.MCP_TRACE_BODIES === 'meta' ? 'meta' : 'full';
const MAX_BYTES = parseInt(process.env.MCP_TRACE_MAX_BYTES, 10) || 2 * 1024 * 1024;

const SECRET_KEYS = /^(password|passwd|pwd|api_key|apikey|x-api-key|authorization|x-dq-session|session|code|code_verifier|access_token|refresh_token|client_secret|token|id_token|cookie|set-cookie)$/i;

export const fingerprint = (v) => v == null || v === '' ? null
    : 'sha256:' + crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 10);

/** Copie profonde en masquant les champs sensibles (par nom de clé). */
export function redact(value, depth = 0) {
    if (value == null || depth > 12) return value;
    if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SECRET_KEYS.test(k) ? `[masqué ${fingerprint(v)}]` : redact(v, depth + 1);
        }
        return out;
    }
    // Secrets portés par une URL (ex. redirect "…?code=…" renvoyé au navigateur).
    if (typeof value === 'string' && /^https?:\/\/\S+\?/.test(value)) return redactUrl(value);
    return value;
}

/** Masque les paramètres sensibles d'une URL (?code=…, ?api_key=…). */
export function redactUrl(url) {
    try {
        const u = new URL(url, 'http://x');
        for (const k of [...u.searchParams.keys()]) {
            if (SECRET_KEYS.test(k)) u.searchParams.set(k, `[masqué ${fingerprint(u.searchParams.get(k))}]`);
        }
        return url.startsWith('http') ? u.toString() : u.pathname + u.search;
    } catch { return url; }
}

/** Prépare un corps pour la trace : objet masqué, ou texte (JSON détecté) tronqué. */
export function body(raw) {
    if (raw == null || raw === '') return null;
    let text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null;
    if (MODE === 'meta') {
        const s = text ?? JSON.stringify(raw);
        return { bytes: Buffer.byteLength(s), empreinte: fingerprint(s) };
    }
    let obj = text == null ? raw : null;
    if (text != null) { try { obj = JSON.parse(text); } catch { /* texte brut */ } }
    if (obj != null && typeof obj === 'object') {
        const s = JSON.stringify(redact(obj));
        if (Buffer.byteLength(s) <= MAX_BYTES) return redact(obj);
        return { tronque: true, bytes: Buffer.byteLength(s), debut: s.slice(0, MAX_BYTES) };
    }
    if (text.length > MAX_BYTES) return { tronque: true, bytes: Buffer.byteLength(text), debut: text.slice(0, MAX_BYTES) };
    return text;
}

export function headers(h) {
    const out = {};
    for (const [k, v] of Object.entries(h || {})) out[k] = SECRET_KEYS.test(k) ? `[masqué ${fingerprint(v)}]` : v;
    return out;
}

let current = { day: null, file: null, stream: null, checked: 0 };
function stream() {
    const day = new Date().toISOString().slice(0, 10);
    // Rouvre aussi le fichier s'il a été déplacé/supprimé (rotation, purge) : sinon
    // les écritures partiraient dans un fichier supprimé et seraient perdues.
    const now = Date.now();
    let missing = false;
    if (current.file && now - current.checked > 5000) {
        current.checked = now;
        missing = !fs.existsSync(current.file);
    }
    if (current.day !== day || missing) {
        current.stream?.end();
        fs.mkdirSync(DIR, { recursive: true, mode: 0o750 });
        const file = path.join(DIR, `mcp-trace-${day}.jsonl`);
        current = { day, file, checked: now, stream: fs.createWriteStream(file, { flags: 'a', mode: 0o640 }) };
        current.stream.on('error', (e) => console.error('[TRACE] écriture impossible :', e.message));
    }
    return current.stream;
}

export function write(record) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    stream().write(line + '\n');
}

export const traceDir = DIR;
export const traceMode = MODE;
