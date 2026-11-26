/**
 * Actions d'ÉCRITURE du MCP (tickets, tâches, réunions) — POST /api/dataquery/actions/*.
 *
 * Principe : on ne fait JAMAIS d'INSERT SQL direct. Chaque action appelle le contrôleur métier existant (numérotation, SLA,
 * notifications, historique…) avec l'identité de la PERSONNE connectée au MCP (session personnelle), donc créée « en son nom ».
 *
 * Verrous (cumulatifs) :
 *   1. passerelle apiKeyGate : une clé API en lecture seule est refusée pour tout POST hors lecture ;
 *      il faut donc une clé du périmètre `dataquery` en permission `read_write` ;
 *   2. 2e facteur : session personnelle (X-DQ-Session), comme pour la lecture ;
 *   3. droit d'écriture PAR AGENT et PAR ACTION (hub.dataquery_rights.write_actions : tickets | tasks | reunions), vide par défaut ;
 *   4. champs en liste blanche (rien d'autre n'est transmis aux contrôleurs) ; le demandeur / créateur est toujours l'agent connecté.
 * Chaque appel est tracé (audit dataquery).
 */
const { pgDb, getSqlite } = require('../../shared/database');
const rights = require('./dataquery.rights');

const text = (v, max) => (v === null || v === undefined ? '' : String(v)).trim().slice(0, max);

/** Utilisateur « applicatif » de l'agent connecté (champs attendus par les contrôleurs : id, username, role, email, displayName…). */
async function appUser(dq) {
    const username = dq.username;
    const hub = await pgDb.get('SELECT username, email, displayName AS "displayName", service_code, service_complement, role FROM hub.users WHERE LOWER(username) = LOWER(?)', [username]);
    let sql = null;
    try { sql = await getSqlite().get('SELECT id, username, role, email, displayName FROM users WHERE LOWER(username) = LOWER(?)', [username]); } catch { /* SQLite indisponible */ }
    return {
        id: sql?.id || null,
        username: sql?.username || hub?.username || username,
        // Rôle volontairement plafonné à « user » : le MCP ne donne jamais de droits d'administration.
        role: 'user',
        email: hub?.email || sql?.email || '',
        displayName: hub?.displayName || sql?.displayName || dq.displayName || username,
        service_code: hub?.service_code || null,
        service_complement: hub?.service_complement || null,
        via: 'mcp',
    };
}

/** Appelle un contrôleur Express (req, res) et renvoie { status, body }. */
function invoke(handler, { body, user, params = {}, req0 }) {
    return new Promise((resolve) => {
        const req = { body, user, params, query: {}, headers: req0.headers || {}, ip: req0.ip, method: 'POST', path: req0.path, get: (h) => (req0.headers || {})[String(h).toLowerCase()] };
        let status = 200;
        const res = {
            status(c) { status = c; return res; },
            json(b) { resolve({ status, body: b }); return res; },
            send(b) { resolve({ status, body: b }); return res; },
            setHeader() { return res; },
            set() { return res; },
        };
        Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 500, body: { message: e.message } }));
    });
}

const ACTIONS = ['tickets', 'tasks', 'reunions'];

async function authorize(req, res, action) {
    const r = await rights.rightsFor(req.dqUser.username);
    if (!(r.write_actions || []).includes(action)) {
        res.status(403).json({ error: `Création de « ${action} » non autorisée pour ${req.dqUser.username} (droit d'écriture à accorder dans /admin/mcp).` });
        return false;
    }
    return true;
}

const done = (req, res, action, out, summary) => {
    try { require('./dataquery.controller').audit(req, { action: `write_${action}`, sql: summary, error: out.status >= 400 ? String(out.body?.message || out.body?.error || out.status).slice(0, 300) : undefined }); } catch { /* audit facultatif */ }
    if (out.status >= 400) return res.status(out.status).json({ error: out.body?.message || out.body?.error || 'Création refusée', details: out.body });
    res.status(201).json({ ok: true, created: out.body });
};

const controller = {
    ACTIONS,

    // POST /api/dataquery/actions/tickets { title, content, type?, priority?, requester_phone? }
    async createTicket(req, res) {
        try {
            if (!(await authorize(req, res, 'tickets'))) return;
            const b = req.body || {};
            const title = text(b.title, 500);
            if (!title) return res.status(400).json({ error: 'title requis' });
            const user = await appUser(req.dqUser);
            const type = [2, '2', 'request', 'demande'].includes(b.type) ? 2 : 1;
            const body = {
                title, content: text(b.content, 20000), type,
                priority: Math.min(5, Math.max(2, parseInt(b.priority, 10) || 3)),
                requester_phone: text(b.requester_phone, 40) || undefined,
                // Le demandeur est TOUJOURS l'agent connecté (aucun ticket au nom d'un tiers via le MCP).
                requester_name: user.displayName, requester_email: user.email,
                source: 'MCP',
            };
            // Un incident exige un téléphone (règle du module) : à défaut, on bascule en demande plutôt que d'inventer un numéro.
            if (type === 1 && !body.requester_phone) body.type = 2;
            const { create } = require('../tickets/tickets.controller');
            const out = await invoke(create, { body, user, req0: req });
            done(req, res, 'tickets', out, `ticket « ${title} »`);
        } catch (e) { res.status(500).json({ error: e.message }); }
    },

    // POST /api/dataquery/actions/tasks { description, echeance?, priority?, ticket_id? }
    async createTask(req, res) {
        try {
            if (!(await authorize(req, res, 'tasks'))) return;
            const b = req.body || {};
            const description = text(b.description, 4000);
            if (!description) return res.status(400).json({ error: 'description requise' });
            const user = await appUser(req.dqUser);
            const body = {
                description,
                echeance: /^\d{4}-\d{2}-\d{2}/.test(text(b.echeance, 30)) ? text(b.echeance, 30) : null,
                priority: ['basse', 'normale', 'haute', 'urgente'].includes(b.priority) ? b.priority : 'normale',
                // Tâche personnelle de l'agent connecté, éventuellement rattachée à un ticket.
                is_team_task: false, assignees: [], is_public: false,
            };
            if (b.ticket_id) { body.context_source = 'ticket'; body.context_id = parseInt(b.ticket_id, 10) || null; body.context_title = text(b.context_title, 300) || null; }
            const { createTask } = require('../tasks/tasks.controller');
            const out = await invoke((r, s) => createTask.call(require('../tasks/tasks.controller'), r, s), { body, user, req0: req });
            done(req, res, 'tasks', out, `tâche « ${description.slice(0, 80)} »`);
        } catch (e) { res.status(500).json({ error: e.message }); }
    },

    // POST /api/dataquery/actions/reunions { titre, date_reunion, lieu?, description?, duree_minutes?, ordre_du_jour?, participants? }
    async createReunion(req, res) {
        try {
            if (!(await authorize(req, res, 'reunions'))) return;
            const b = req.body || {};
            const titre = text(b.titre, 300);
            const date = text(b.date_reunion, 40);
            if (!titre) return res.status(400).json({ error: 'titre requis' });
            if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return res.status(400).json({ error: 'date_reunion requise (ISO, ex. 2026-12-08T14:00)' });
            const user = await appUser(req.dqUser);
            const participants = (Array.isArray(b.participants) ? b.participants : []).slice(0, 30).map(p => ({
                nom: text(p.nom, 100), prenom: text(p.prenom, 100), email: text(p.email, 200), service: text(p.service, 120),
                type_presence: 'metier', statut_presence: 'present',
            })).filter(p => p.nom || p.email);
            const body = {
                titre, date_reunion: date, annee: new Date(date).getFullYear() || undefined,
                lieu: text(b.lieu, 200) || null, description: text(b.description, 5000) || null,
                duree_minutes: Math.min(600, Math.max(5, parseInt(b.duree_minutes, 10) || 60)),
                ordre_du_jour: text(b.ordre_du_jour, 5000) || null,
                participants,
                source: 'MCP',
                // Pas d'invitation Outlook automatique depuis le MCP.
                create_outlook: false, is_teams: false,
            };
            const reunions = require('../rencontres/reunions.controller');
            const out = await invoke(reunions.create, { body, user, req0: req });
            done(req, res, 'reunions', out, `réunion « ${titre} »`);
        } catch (e) { res.status(500).json({ error: e.message }); }
    },
};

module.exports = controller;
