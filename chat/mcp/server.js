/**
 * Serveur MCP AppDSI — DMZ (chat.ivry94.fr/mcp)
 *
 * Expose en LECTURE SEULE les données de tous les modules de l'application
 * (tickets, transcript manager, photocopieurs, contrats, projets…) à un client
 * MCP (Claude…), en s'appuyant sur le module backend /api/dataquery.
 *
 * DOUBLE AUTHENTIFICATION (OAuth 2.1 + PKCE, conforme à la spécification MCP) :
 *   Lors de l'autorisation du connecteur, la personne saisit sur la page
 *   /mcp/login (frontend chat) :
 *     1. sa CLÉ API dataquery (dsk_…, périmètre « dataquery », avec expiration) ;
 *     2. son IDENTIFICATION PERSONNELLE (identifiant Windows + mot de passe AD).
 *   Le backend vérifie les deux et ouvre une session personnelle (8 h max),
 *   liée à la clé. Le jeton OAuth remis au client ne vaut que pour cette session
 *   et n'est connu que de ce serveur (mémoire uniquement, jamais sur disque).
 *   Chaque appel au backend présente À NOUVEAU les deux facteurs (clé + session).
 *
 * TRAÇAGE : tous les flux entrants (client → MCP) et sortants (MCP → backend)
 * sont écrits dans des fichiers JSONL (cf. trace.js), secrets masqués. Le même
 * identifiant de trace est transmis au backend (X-Trace-Id) et figure dans son
 * journal d'audit hub.dataquery_audit.
 */
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as trace from './trace.js';
import { loginPage } from './login-page.js';

const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
if (!BACKEND_URL) { console.error('BACKEND_URL doit être défini'); process.exit(1); }
const PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `https://${process.env.CHAT_DOMAIN || 'chat.ivry94.fr'}`).replace(/\/+$/, '');
const RESOURCE = `${PUBLIC_URL}/mcp`;
const PORT = parseInt(process.env.MCP_PORT, 10) || 5176;
const HOST = process.env.MCP_HOST || '127.0.0.1';

const PENDING_TTL_MS = 10 * 60 * 1000;   // demande d'autorisation en attente de login
const CODE_TTL_MS = 2 * 60 * 1000;       // code d'autorisation OAuth (usage unique)
const MAX_LOGIN_ATTEMPTS = 5;            // par demande d'autorisation
const MAX_CLIENTS = 1000;

// ── Stockage en mémoire (perdu au redémarrage : les personnes se reconnectent) ──
const clients = new Map();   // client_id → { client_name, redirect_uris, created_at }
const pending = new Map();   // request_id → demande d'autorisation
const codes = new Map();     // code → { ...grant, expires }
const tokens = new Map();    // sha256(access_token) → grant

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const randomId = (bytes = 32) => b64url(crypto.randomBytes(bytes));
const tokenKey = (t) => sha256(t).toString('hex');
const safeEqual = (a, b) => {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
    for (const [k, v] of codes) if (v.expires < now) codes.delete(k);
    for (const [k, v] of tokens) if (v.expires < now) tokens.delete(k);
}, 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

const clientIp = (req) => req.headers['x-real-ip'] || req.socket.remoteAddress;

// ── Traçage de tout flux entrant ────────────────────────────────────────────
app.use((req, res, next) => {
    const started = Date.now();
    req.trace = { id: crypto.randomUUID(), user: null, client_id: null };
    res.setHeader('X-Trace-Id', req.trace.id);
    const chunks = [];
    let size = 0;
    const keep = (c, enc) => {
        if (c == null) return;
        const b = Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8');
        size += b.length;
        if (size <= 4 * 1024 * 1024) chunks.push(b);
    };
    const write = res.write.bind(res), end = res.end.bind(res);
    res.write = (c, enc, cb) => { keep(c, enc); return write(c, enc, cb); };
    res.end = (c, enc, cb) => { if (typeof c !== 'function') keep(c, enc); return end(c, enc, cb); };
    res.on('finish', () => {
        const rpc = req.body && typeof req.body === 'object' && req.body.jsonrpc
            ? [].concat(req.body).map(m => m.method + (m.params?.name ? `:${m.params.name}` : '')).join(',')
            : undefined;
        trace.write({
            flow: 'entrant', trace_id: req.trace.id, ip: clientIp(req),
            user: req.trace.user, client_id: req.trace.client_id,
            method: req.method, url: trace.redactUrl(req.originalUrl), rpc,
            user_agent: req.headers['user-agent'],
            req_headers: trace.headers(req.headers), req_body: trace.body(req.body),
            status: res.statusCode, res_headers: trace.headers(res.getHeaders()),
            res_body: trace.body(Buffer.concat(chunks)), res_bytes: size,
            duration_ms: Date.now() - started,
        });
    });
    next();
});

// ── Appels sortants vers le backend (tracés) ────────────────────────────────
async function backend(req, method, path, { apiKey, session, body } = {}) {
    const url = `${BACKEND_URL}/api/dataquery${path}`;
    const headers = { Accept: 'application/json', 'X-Trace-Id': req.trace.id, 'X-Real-IP': String(clientIp(req) || '') };
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (session) headers['X-DQ-Session'] = session;
    if (body) headers['Content-Type'] = 'application/json';
    const started = Date.now();
    let status = 0, text = '', error;
    try {
        const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(35000) });
        status = r.status;
        text = await r.text();
    } catch (e) {
        error = e.message;
    }
    trace.write({
        flow: 'sortant', trace_id: req.trace.id, user: req.trace.user, client_id: req.trace.client_id,
        method, url, req_headers: trace.headers(headers), req_body: trace.body(body),
        status, res_body: trace.body(text), error, duration_ms: Date.now() - started,
    });
    if (error) return { status: 502, data: { error: `Backend injoignable : ${error}` } };
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) || `HTTP ${status}` }; }
    return { status, data };
}

// ── Métadonnées OAuth (RFC 9728 / RFC 8414) ─────────────────────────────────
const protectedResource = (req, res) => res.json({
    resource: RESOURCE,
    authorization_servers: [PUBLIC_URL],
    bearer_methods_supported: ['header'],
    resource_name: 'AppDSI — données (lecture seule)',
});
const authServer = (req, res) => res.json({
    issuer: PUBLIC_URL,
    authorization_endpoint: `${PUBLIC_URL}/mcp/oauth/authorize`,
    token_endpoint: `${PUBLIC_URL}/mcp/oauth/token`,
    registration_endpoint: `${PUBLIC_URL}/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['dataquery'],
});
app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], protectedResource);
app.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp',
         '/.well-known/openid-configuration'], authServer);

// ── Inscription dynamique des clients (RFC 7591) ────────────────────────────
// Ouverte (exigée par les clients MCP) : elle ne donne accès à rien sans les
// deux facteurs. Redirections acceptées : https://… ou boucle locale http.
const validRedirect = (u) => {
    try {
        const x = new URL(u);
        if (x.hash) return false;
        if (x.protocol === 'https:') return true;
        return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname);
    } catch { return false; }
};
app.post('/mcp/oauth/register', express.json({ limit: '20kb' }), (req, res) => {
    const { redirect_uris, client_name } = req.body || {};
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0 || redirect_uris.length > 10 || !redirect_uris.every(validRedirect)) {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris : https://… ou http://localhost uniquement' });
    }
    if (clients.size >= MAX_CLIENTS) clients.delete(clients.keys().next().value);
    const client_id = `mcp_${randomId(18)}`;
    const name = String(client_name || 'Client MCP').slice(0, 100);
    clients.set(client_id, { client_name: name, redirect_uris, created_at: Date.now() });
    req.trace.client_id = client_id;
    res.status(201).json({
        client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris,
        token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'],
    });
});

// ── Autorisation : redirige vers la page de connexion du frontend chat ──────
app.get('/mcp/oauth/authorize', (req, res) => {
    const q = req.query;
    const client = clients.get(String(q.client_id || ''));
    if (!client) return res.status(400).send('Client inconnu : reconnectez le connecteur MCP (inscription expirée).');
    req.trace.client_id = q.client_id;
    const redirectUri = q.redirect_uri ? String(q.redirect_uri) : (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
    if (!redirectUri || !client.redirect_uris.includes(redirectUri)) return res.status(400).send('redirect_uri non enregistrée pour ce client.');
    const back = (error, description) => {
        const u = new URL(redirectUri);
        u.searchParams.set('error', error);
        if (description) u.searchParams.set('error_description', description);
        if (q.state) u.searchParams.set('state', String(q.state));
        return res.redirect(302, u.toString());
    };
    if (q.response_type !== 'code') return back('unsupported_response_type');
    if (!q.code_challenge || q.code_challenge_method !== 'S256') return back('invalid_request', 'PKCE S256 obligatoire');
    if (q.resource && String(q.resource).replace(/\/+$/, '') !== RESOURCE) return back('invalid_target', `resource attendue : ${RESOURCE}`);
    const id = randomId(24);
    pending.set(id, {
        client_id: String(q.client_id), client_name: client.client_name, redirect_uri: redirectUri,
        state: q.state ? String(q.state) : null, code_challenge: String(q.code_challenge),
        scope: String(q.scope || 'dataquery'), attempts: 0, expires: Date.now() + PENDING_TTL_MS,
    });
    res.redirect(302, `/mcp/login?request=${encodeURIComponent(id)}`);
});

// Page de connexion autonome : utilisée quand le MCP est exposé SANS le front React du chat (ex. interne, derrière le chat interne).
// Dans le conteneur DMZ, nginx sert /mcp/login par le front React : cette route n'est alors pas atteinte.
app.get('/mcp/login', loginPage);

// Informations affichées par la page de connexion.
app.get('/mcp/oauth/request/:id', (req, res) => {
    const p = pending.get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Demande expirée ou inconnue : relancez la connexion depuis votre client MCP.' });
    req.trace.client_id = p.client_id;
    res.json({ client_name: p.client_name, redirect_host: new URL(p.redirect_uri).host, expires_at: new Date(p.expires).toISOString() });
});

const finishRedirect = (p, params) => {
    const u = new URL(p.redirect_uri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (p.state) u.searchParams.set('state', p.state);
    return u.toString();
};

// Double authentification : clé API + identifiants AD, vérifiés par le backend.
app.post('/mcp/oauth/login', express.json({ limit: '10kb' }), async (req, res) => {
    const { request, username, password, api_key } = req.body || {};
    const p = pending.get(String(request || ''));
    if (!p) return res.status(404).json({ error: 'Demande expirée ou inconnue : relancez la connexion depuis votre client MCP.' });
    req.trace.client_id = p.client_id;
    req.trace.user = String(username || '').trim().toLowerCase() || null;
    if (typeof api_key !== 'string' || !/^dsk_[A-Za-z0-9]{20,200}$/.test(api_key.trim())) {
        return res.status(400).json({ error: 'Clé API invalide (format dsk_…)' });
    }
    if (!username || !password) return res.status(400).json({ error: 'Identifiant Windows et mot de passe requis' });
    if (++p.attempts > MAX_LOGIN_ATTEMPTS) {
        pending.delete(request);
        return res.status(429).json({ error: 'Trop de tentatives : relancez la connexion depuis votre client MCP.' });
    }
    const r = await backend(req, 'POST', '/auth/login', {
        apiKey: api_key.trim(),
        body: { username: String(username), password: String(password), client: `MCP · ${p.client_name}` },
    });
    if (r.status !== 200 || !r.data?.session) {
        return res.status(r.status >= 400 && r.status < 600 ? r.status : 502).json({ error: r.data?.error || 'Échec de l\'authentification' });
    }
    pending.delete(request);
    const code = randomId(32);
    codes.set(code, {
        client_id: p.client_id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, scope: p.scope,
        apiKey: api_key.trim(), session: r.data.session, user: r.data.user,
        session_expires: Date.parse(r.data.expires_at), expires: Date.now() + CODE_TTL_MS,
    });
    req.trace.user = r.data.user?.username || req.trace.user;
    res.json({ redirect: finishRedirect(p, { code }), user: r.data.user, expires_at: r.data.expires_at });
});

app.post('/mcp/oauth/deny', express.json({ limit: '5kb' }), (req, res) => {
    const p = pending.get(String(req.body?.request || ''));
    if (!p) return res.status(404).json({ error: 'Demande expirée ou inconnue' });
    req.trace.client_id = p.client_id;
    pending.delete(req.body.request);
    res.json({ redirect: finishRedirect(p, { error: 'access_denied', error_description: 'Refusé par l\'utilisateur' }) });
});

// ── Échange du code contre un jeton d'accès (PKCE obligatoire) ──────────────
app.post('/mcp/oauth/token', express.urlencoded({ extended: false, limit: '10kb' }), express.json({ limit: '10kb' }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = req.body || {};
    const fail = (error, description, status = 400) => res.status(status).json({ error, error_description: description });
    if (b.grant_type !== 'authorization_code') return fail('unsupported_grant_type', 'Seul authorization_code est accepté (pas de jeton de rafraîchissement : reconnexion à expiration)');
    const c = codes.get(String(b.code || ''));
    if (!c || c.expires < Date.now()) return fail('invalid_grant', 'Code invalide ou expiré');
    codes.delete(b.code); // usage unique, même en cas d'échec ci-dessous
    req.trace.client_id = c.client_id;
    req.trace.user = c.user?.username;
    if (b.client_id && b.client_id !== c.client_id) return fail('invalid_grant', 'client_id différent');
    if (b.redirect_uri && b.redirect_uri !== c.redirect_uri) return fail('invalid_grant', 'redirect_uri différente');
    if (typeof b.code_verifier !== 'string' || !safeEqual(b64url(sha256(b.code_verifier)), c.code_challenge)) {
        return fail('invalid_grant', 'code_verifier PKCE invalide');
    }
    const accessToken = randomId(32);
    const expires = Math.min(c.session_expires || 0, Date.now() + 24 * 3600 * 1000);
    tokens.set(tokenKey(accessToken), {
        client_id: c.client_id, apiKey: c.apiKey, session: c.session, user: c.user, scope: c.scope, expires,
    });
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: Math.max(Math.floor((expires - Date.now()) / 1000), 0), scope: c.scope });
});

// ── Point d'entrée MCP (Streamable HTTP, sans état) ─────────────────────────
const unauthorized = (res, description) => {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"` +
        (description ? `, error="invalid_token", error_description="${description}"` : ''));
    return res.status(401).json({ error: 'invalid_token', error_description: description || 'Authentification requise' });
};

function requireBearer(req, res, next) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!m) return unauthorized(res);
    const grant = tokens.get(tokenKey(m[1]));
    if (!grant || grant.expires < Date.now()) return unauthorized(res, 'Jeton inconnu ou expiré');
    // Clé API présentée en plus par le client (facultatif) : doit être celle de l'autorisation.
    const presented = req.headers['x-api-key'];
    if (presented && !safeEqual(presented, grant.apiKey)) return unauthorized(res, 'Clé API différente de celle de l\'autorisation');
    req.grant = grant;
    req.grantKey = tokenKey(m[1]);
    req.trace.user = grant.user?.username;
    req.trace.client_id = grant.client_id;
    next();
}

function buildServer(req) {
    const server = new McpServer(
        { name: 'appdsi-dataquery', version: '1.0.0' },
        { instructions:
            'Lecture des données PostgreSQL (écriture limitée à la CRÉATION de tickets, tâches et réunions, si la personne y est autorisée) : accès aux données PostgreSQL de l\'application DSI de la Ville d\'Ivry ' +
            '(tickets, transcript manager, photocopieurs, contrats, projets, consommables, finance, parc, réseau, télécom, boîtes partagées, vols et pertes de matériel…). ' +
            'Démarche : 1) dsi_catalog pour trouver le module (schéma) et les tables — pour parc, telecom, contrats, boites_partagees et vols_pertes, appeler d\'abord dsi_module_guide (tables clés, règles, requêtes types) ; 2) dsi_describe_table pour les colonnes ; ' +
            '3) dsi_query avec du SQL PostgreSQL (SELECT/WITH uniquement, noms qualifiés schema.table, paramètres $1…). ' +
            'Les colonnes sensibles (mots de passe, jetons…) sont masquées. Toutes les requêtes sont tracées au nom de la personne connectée.' },
    );
    const call = async (method, path, body) => {
        const r = await backend(req, method, path, { apiKey: req.grant.apiKey, session: req.grant.session, body });
        if (r.status === 401) tokens.delete(req.grantKey); // session révoquée/expirée : forcer une nouvelle autorisation
        const text = JSON.stringify(r.data, null, r.data?.rows ? 0 : 1);
        return r.status >= 400
            ? { isError: true, content: [{ type: 'text', text: `Erreur ${r.status} : ${r.data?.error || text}${r.data?.hint ? `\n${r.data.hint}` : ''}` }] }
            : { content: [{ type: 'text', text }] };
    };
    const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    server.registerTool('dsi_catalog', {
        title: 'Lister les modules et tables',
        description: 'Liste les modules de l\'application (schémas PostgreSQL : hub_tickets, transcript, hub_copieurs…) et leurs tables accessibles, avec un nombre de lignes estimé. Filtrer par schéma pour réduire la sortie.',
        inputSchema: { schema: z.string().max(100).optional().describe('Schéma à lister (ex. hub_tickets). Vide = tous.') },
        annotations: ro,
    }, ({ schema }) => call('GET', `/catalog${schema ? `?schema=${encodeURIComponent(schema)}` : ''}`));
    server.registerTool('dsi_describe_table', {
        title: 'Décrire une table',
        description: 'Colonnes (types, nullabilité, commentaires), clé primaire et clés étrangères d\'une table.',
        inputSchema: { schema: z.string().max(100), table: z.string().max(200) },
        annotations: ro,
    }, ({ schema, table }) => call('GET', `/catalog/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`));
    server.registerTool('dsi_query', {
        title: 'Exécuter une requête SQL (lecture seule)',
        description: 'Exécute une requête PostgreSQL en lecture seule (SELECT, WITH, TABLE, VALUES, EXPLAIN). Une seule instruction, 15 s max, 500 lignes par défaut (max 5000). Utiliser $1, $2… avec params pour les valeurs.',
        inputSchema: {
            sql: z.string().min(1).max(20000),
            params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(100).optional(),
            max_rows: z.number().int().min(1).max(5000).optional(),
        },
        annotations: ro,
    }, ({ sql, params, max_rows }) => call('POST', '/query', { sql, params, max_rows }));
    server.registerTool('dsi_module_guide', {
        title: 'Guide d\'un module métier',
        description: 'Guide des modules métier : parc (matériel, lignes mobiles), telecom (lignes fixes, factures, coûts), contrats (échéances, montants), boites_partagees, vols_pertes (vol et perte de matériel). ' +
            'Sans paramètre : liste des modules documentés. Avec module : tables clés et colonnes importantes, règles d\'interprétation (pièges de typage, valeurs à vérifier) et REQUÊTES TYPES prêtes à adapter pour dsi_query. ' +
            'À consulter AVANT d\'écrire du SQL sur ces modules.',
        inputSchema: { module: z.string().max(50).optional().describe('parc | telecom | contrats | boites_partagees | vols_pertes. Vide = liste.') },
        annotations: ro,
    }, ({ module }) => call('GET', `/guides${module ? `?module=${encodeURIComponent(module)}` : ''}`));
    // ── Écriture (création uniquement, jamais de suppression ni de modification) ──
    // Exige une clé API read_write + le droit d'écriture de la personne (admin /admin/mcp) ; créé AU NOM de la personne connectée.
    const wr = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
    server.registerTool('dsi_create_ticket', {
        title: 'Créer un ticket',
        description: "Crée un ticket au nom de la personne connectée (demandeur = elle). Un incident exige requester_phone ; sans téléphone le ticket est créé comme demande. Confirmer le titre et le contenu avec l'utilisateur avant l'appel.",
        inputSchema: {
            title: z.string().min(1).max(500).describe('Titre du ticket'),
            content: z.string().max(20000).optional().describe('Description détaillée'),
            type: z.enum(['incident', 'demande']).optional().describe('incident (défaut) ou demande'),
            priority: z.number().int().min(2).max(5).optional().describe('2 (haute) à 5 (très basse), 3 par défaut'),
            requester_phone: z.string().max(40).optional().describe('Téléphone du demandeur (requis pour un incident)'),
        },
        annotations: wr,
    }, ({ title, content, type, priority, requester_phone }) => call('POST', '/actions/tickets', { title, content, type: type === 'demande' ? 'request' : 'incident', priority, requester_phone }));
    server.registerTool('dsi_create_task', {
        title: 'Créer une tâche',
        description: "Crée une tâche personnelle pour la personne connectée, éventuellement liée à un ticket (ticket_id). Confirmer avec l'utilisateur avant l'appel.",
        inputSchema: {
            description: z.string().min(1).max(4000),
            echeance: z.string().max(30).optional().describe('Échéance ISO, ex. 2026-12-31'),
            priority: z.enum(['basse', 'normale', 'haute', 'urgente']).optional(),
            ticket_id: z.number().int().optional().describe('Numéro du ticket auquel rattacher la tâche'),
        },
        annotations: wr,
    }, ({ description, echeance, priority, ticket_id }) => call('POST', '/actions/tasks', { description, echeance, priority, ticket_id }));
    server.registerTool('dsi_create_reunion', {
        title: 'Créer une réunion',
        description: "Crée une réunion (sans invitation Outlook). La personne connectée en est l'organisatrice et participante. Confirmer avec l'utilisateur avant l'appel.",
        inputSchema: {
            titre: z.string().min(1).max(300),
            date_reunion: z.string().min(10).max(40).describe('Date et heure ISO, ex. 2026-12-08T14:00'),
            lieu: z.string().max(200).optional(),
            description: z.string().max(5000).optional(),
            duree_minutes: z.number().int().min(5).max(600).optional(),
            ordre_du_jour: z.string().max(5000).optional(),
            participants: z.array(z.object({ nom: z.string().max(100), prenom: z.string().max(100).optional(), email: z.string().max(200).optional(), service: z.string().max(120).optional() })).max(30).optional(),
        },
        annotations: wr,
    }, (args) => call('POST', '/actions/reunions', args));
    server.registerTool('dsi_whoami', {
        title: 'Session et limites',
        description: 'Personne connectée, clé utilisée, état du module et limites appliquées.',
        inputSchema: {},
        annotations: ro,
    }, () => call('GET', '/health'));
    return server;
}

app.post('/mcp', express.json({ limit: '200kb' }), requireBearer, async (req, res) => {
    const server = buildServer(req);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (e) {
        console.error('[MCP] erreur :', e.message);
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erreur interne' }, id: null });
    }
});
app.all('/mcp', (req, res) => res.status(405).set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Méthode non autorisée (serveur sans état : POST uniquement)' }, id: null }));

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(PORT, HOST, () => {
    console.log(`[MCP] ${RESOURCE} → écoute ${HOST}:${PORT}, backend ${BACKEND_URL}, traces ${trace.traceDir} (${trace.traceMode})`);
});
