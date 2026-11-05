/**
 * Analyse fine des chats en direct (live) : pour chaque session, qui a répondu, combien de messages, délais de réponse…
 *   GET /api/live/analysis?from=YYYY-MM-DD&to=YYYY-MM-DD&chat_type=ville|ecole   → KPI + une ligne par chat
 *   GET /api/live/analysis/:id                                                   → détail d'un chat (chronologie des messages)
 * Réservé aux techniciens / superviseurs / admins (les messages contiennent des échanges avec des agents).
 *
 * Définitions :
 *  - attente de prise en charge : création de la session → prise en charge par un technicien (claimed_at) ;
 *  - 1re réponse : 1er message du demandeur → 1er message d'un technicien ;
 *  - délai de réponse : pour chaque série de messages du demandeur, délai jusqu'à la réponse suivante d'un technicien ;
 *  - durée : création → clôture (ou dernière activité si le chat n'est pas clos).
 */
const { pgDb } = require('../../shared/database');
const { resolveTicketRole } = require('../tickets/middleware/ticket-permissions');

const sec = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)) : null);
const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function allowed(req, res) {
    try {
        const role = await resolveTicketRole(req.user);
        if (['technician', 'supervisor', 'admin', 'superadmin'].includes(role)) return true;
    } catch (e) { /* refus ci-dessous */ }
    res.status(403).json({ message: 'Permission refusée : rôle technicien requis' });
    return false;
}

/** Noms affichables des utilisateurs (hub.users), par identifiant en minuscules : le chat ne stocke souvent que l'identifiant. */
async function displayNames(usernames) {
    const list = [...new Set(usernames.filter(Boolean).map((u) => String(u).toLowerCase()))];
    const map = new Map();
    if (!list.length) return map;
    try {
        const rows = await pgDb.all(`SELECT LOWER(username) AS u, displayname AS n FROM hub.users WHERE LOWER(username) = ANY($1::text[])`, [list]);
        for (const r of rows) if (r.n && r.n !== r.u) map.set(r.u, r.n);
    } catch (e) { /* repli : identifiants */ }
    return map;
}

/** Métriques d'une session à partir de ses messages (triés par date). */
function analyse(session, messages, rating, names = new Map()) {
    const nm = (username, fallback) => names.get(String(username || '').toLowerCase()) || fallback || username || '';
    const tech = messages.filter((m) => m.sender_type === 'tech');
    const user = messages.filter((m) => m.sender_type === 'user');
    const firstUser = user[0] ? user[0].created_at : session.created_at;
    const firstTech = tech[0] ? tech[0].created_at : null;

    // Délais de réponse : 1er message non répondu du demandeur → message suivant d'un technicien
    const responses = [];
    let waitingSince = null;
    const timeline = messages.map((m) => {
        let reponse_s = null;
        if (m.sender_type === 'user') {
            if (!waitingSince) waitingSince = m.created_at;
        } else if (m.sender_type === 'tech' && waitingSince) {
            reponse_s = sec(waitingSince, m.created_at);
            responses.push(reponse_s);
            waitingSince = null;
        }
        return {
            id: m.id, sender_type: m.sender_type, sender_name: nm(m.sender_username, m.sender_name), sender_username: m.sender_username || '',
            content: m.content || '', created_at: m.created_at, attachment_name: m.attachment_name || null, attachment_url: m.attachment_url || null,
            reponse_s,
        };
    });

    // Qui a répondu : messages par technicien
    const byTech = new Map();
    for (const m of tech) {
        const key = (m.sender_username || m.sender_name || '?').toLowerCase();
        const cur = byTech.get(key) || { username: m.sender_username || key, name: nm(m.sender_username, m.sender_name || key), messages: 0 };
        cur.messages++;
        byTech.set(key, cur);
    }
    const lastMsg = messages.length ? messages[messages.length - 1].created_at : null;
    const end = session.closed_at || lastMsg || session.last_activity_at;
    return {
        id: session.id, ticket_id: session.ticket_id, ticket_title: session.ticket_title || null,
        user: nm(session.user_username, session.user_display_name) || '', user_username: session.user_username || '',
        tech: session.tech_username ? nm(session.tech_username, session.tech_display_name) : (session.tech_display_name || null), tech_username: session.tech_username || null,
        chat_type: session.chat_type || 'ville', auth_method: session.auth_method || null, status: session.status, close_reason: session.close_reason || null,
        created_at: session.created_at, claimed_at: session.claimed_at, closed_at: session.closed_at,
        attente_prise_en_charge_s: sec(session.created_at, session.claimed_at),
        premiere_reponse_s: firstTech ? sec(firstUser, firstTech) : null,
        reponse_moyenne_s: avg(responses), reponse_max_s: responses.length ? Math.max(...responses) : null, nb_reponses: responses.length,
        duree_s: sec(session.created_at, end),
        echange_s: messages.length > 1 ? sec(messages[0].created_at, lastMsg) : 0,
        msgs_total: messages.length, msgs_user: user.length, msgs_tech: tech.length,
        pieces_jointes: messages.filter((m) => m.attachment_url).length,
        sans_reponse: tech.length === 0,
        repondants: [...byTech.values()].sort((a, b) => b.messages - a.messages),
        satisfaction: rating ? { rating: Number(rating.rating), comment: rating.comment || null } : null,
        timeline,
    };
}

async function loadSessions(where, params) {
    return pgDb.all(
        `SELECT ls.*, t.title AS ticket_title FROM hub_tickets.live_sessions ls
           LEFT JOIN hub_tickets.tickets t ON t.glpi_id = ls.ticket_id
          WHERE ${where} ORDER BY ls.created_at DESC`, params);
}

async function getAnalysis(req, res) {
    try {
        if (!(await allowed(req, res))) return;
        const isoDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
        const to = isoDate(req.query.to) || new Date().toISOString().slice(0, 10);
        const from = isoDate(req.query.from) || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const type = ['ville', 'ecole'].includes(req.query.chat_type) ? req.query.chat_type : null;

        const params = [from, to];
        let where = `ls.created_at >= $1::date AND ls.created_at < ($2::date + 1)`;
        if (type) { params.push(type); where += ` AND COALESCE(ls.chat_type, 'ville') = $3`; }
        const sessions = await loadSessions(where, params);
        const ids = sessions.map((s) => s.id);
        const msgs = ids.length ? await pgDb.all(
            `SELECT id, session_id, sender_type, sender_name, sender_username, content, created_at, attachment_name, attachment_url
               FROM hub_tickets.live_messages WHERE session_id = ANY($1::int[]) ORDER BY session_id, created_at, id`, [ids]) : [];
        const sats = ids.length ? await pgDb.all(`SELECT session_id, rating, comment FROM hub_tickets.live_satisfaction WHERE session_id = ANY($1::int[])`, [ids]) : [];
        const bySession = new Map(); for (const m of msgs) (bySession.get(m.session_id) || bySession.set(m.session_id, []).get(m.session_id)).push(m);
        const satBy = new Map(sats.map((r) => [r.session_id, r]));

        const names = await displayNames([...sessions.flatMap((s) => [s.user_username, s.tech_username]), ...msgs.map((m) => m.sender_username)]);
        const chats = sessions.map((s) => { const a = analyse(s, bySession.get(s.id) || [], satBy.get(s.id), names); delete a.timeline; return a; });

        // KPI globaux et par technicien
        const answered = chats.filter((c) => !c.sans_reponse);
        const first = answered.map((c) => c.premiere_reponse_s).filter((x) => x != null);
        const attente = chats.map((c) => c.attente_prise_en_charge_s).filter((x) => x != null);
        const durees = chats.map((c) => c.duree_s).filter((x) => x != null);
        const ratings = chats.filter((c) => c.satisfaction).map((c) => c.satisfaction.rating);
        const techMap = new Map();
        for (const c of chats) {
            for (const r of c.repondants) {
                const key = r.username.toLowerCase();
                const cur = techMap.get(key) || { username: r.username, name: r.name, chats: 0, messages: 0, premieres: [], reponses: [] };
                cur.chats++; cur.messages += r.messages;
                if (c.premiere_reponse_s != null && c.tech_username && c.tech_username.toLowerCase() === key) cur.premieres.push(c.premiere_reponse_s);
                if (c.reponse_moyenne_s != null && c.tech_username && c.tech_username.toLowerCase() === key) cur.reponses.push(c.reponse_moyenne_s);
                techMap.set(key, cur);
            }
        }
        const countBy = (fn) => { const o = {}; for (const c of chats) { const k = fn(c) || 'n/a'; o[k] = (o[k] || 0) + 1; } return o; };
        res.json({
            from, to, chat_type: type,
            kpis: {
                total: chats.length, repondus: answered.length, sans_reponse: chats.length - answered.length,
                premiere_reponse_moy_s: avg(first), premiere_reponse_mediane_s: median(first),
                attente_moy_s: avg(attente), duree_moy_s: avg(durees),
                msgs_moy: chats.length ? Math.round((chats.reduce((s, c) => s + c.msgs_total, 0) / chats.length) * 10) / 10 : 0,
                msgs_total: chats.reduce((s, c) => s + c.msgs_total, 0),
                satisfaction_moy: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 100) / 100 : null, satisfaction_nb: ratings.length,
                par_motif_cloture: countBy((c) => c.close_reason || (c.status === 'closed' ? 'clos' : c.status)),
                par_type: countBy((c) => c.chat_type),
            },
            techniciens: [...techMap.values()].map((t) => ({ username: t.username, name: t.name, chats: t.chats, messages: t.messages, premiere_reponse_moy_s: avg(t.premieres), reponse_moyenne_s: avg(t.reponses) }))
                .sort((a, b) => b.messages - a.messages),
            chats,
        });
    } catch (e) {
        console.error('[LIVE] getAnalysis error:', e);
        res.status(500).json({ message: e.message });
    }
}

async function getAnalysisDetail(req, res) {
    try {
        if (!(await allowed(req, res))) return;
        const id = parseInt(req.params.id, 10);
        const sessions = await loadSessions('ls.id = $1', [id]);
        if (!sessions.length) return res.status(404).json({ message: 'Chat introuvable' });
        const msgs = await pgDb.all(
            `SELECT id, session_id, sender_type, sender_name, sender_username, content, created_at, attachment_name, attachment_url
               FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at, id`, [id]);
        const sat = await pgDb.get(`SELECT rating, comment FROM hub_tickets.live_satisfaction WHERE session_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
        const names = await displayNames([sessions[0].user_username, sessions[0].tech_username, ...msgs.map((m) => m.sender_username)]);
        res.json(analyse(sessions[0], msgs, sat, names));
    } catch (e) {
        console.error('[LIVE] getAnalysisDetail error:', e);
        res.status(500).json({ message: e.message });
    }
}

module.exports = { getAnalysis, getAnalysisDetail };
