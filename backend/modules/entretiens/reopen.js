/**
 * Demandes de RÉOUVERTURE d'un entretien clôturé.
 *
 * Un entretien clôturé n'offre plus que trois choses à l'évaluateur : afficher le CREP original, afficher la version numérique, demander la réouverture.
 * La demande est OBLIGATOIREMENT justifiée ; elle prévient les administrateurs par e-mail et apparaît dans leur menu « Demandes de réouverture ».
 * Un administrateur l'accepte (l'entretien redevient modifiable) ou la refuse (avec une note) ; le demandeur est prévenu par e-mail.
 */
const { pgDb } = require('../../shared/database');

let ready = null;
function ensureTable() {
    if (!ready) {
        ready = (async () => {
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.reopen_requests (
                id SERIAL PRIMARY KEY,
                entretien_id INTEGER NOT NULL,
                requested_by TEXT DEFAULT '',
                requested_email TEXT DEFAULT '',
                requested_name TEXT DEFAULT '',
                reason TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'en_attente',
                decided_by TEXT DEFAULT '',
                decided_at TIMESTAMPTZ,
                decision_note TEXT DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`);
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_reopen_requests_ent ON hub_entretiens.reopen_requests (entretien_id, id DESC)');
        })().catch((e) => { ready = null; throw e; });
    }
    return ready;
}

/** Dernière demande d'un entretien (pour l'afficher à l'évaluateur). */
async function latestFor(entretienId) {
    try {
        await ensureTable();
        return await pgDb.get(
            'SELECT id, status, reason, created_at, decided_at, decision_note FROM hub_entretiens.reopen_requests WHERE entretien_id = ? ORDER BY id DESC LIMIT 1', [entretienId]) || null;
    } catch (e) { return null; }
}

async function create({ entretien, actor, reason }) {
    await ensureTable();
    const pending = await pgDb.get("SELECT id FROM hub_entretiens.reopen_requests WHERE entretien_id = ? AND status = 'en_attente'", [entretien.id]);
    if (pending) throw Object.assign(new Error('Une demande de réouverture est déjà en attente pour cet entretien.'), { status: 409 });
    const r = await pgDb.run(
        `INSERT INTO hub_entretiens.reopen_requests (entretien_id, requested_by, requested_email, requested_name, reason)
         VALUES (?, ?, ?, ?, ?)`,
        [entretien.id, actor.username || '', actor.email || '', actor.displayName || actor.username || '', reason]);
    return r.lastID;
}

async function list(status) {
    await ensureTable();
    const where = status ? 'WHERE r.status = ?' : '';
    return pgDb.all(
        `SELECT r.*, e.agent_nom, e.agent_prenom, e.direction, e.service, e.poste, e.evaluator_nom, e.campaign_id, e.statut AS entretien_statut,
                c.annee, c.statut AS campagne_statut
         FROM hub_entretiens.reopen_requests r
         LEFT JOIN hub_entretiens.entretiens e ON e.id = r.entretien_id
         LEFT JOIN hub_entretiens.campaigns c ON c.id = e.campaign_id
         ${where} ORDER BY (r.status = 'en_attente') DESC, r.id DESC LIMIT 300`, status ? [status] : []);
}

/** Adresses des administrateurs du module (table des administrateurs + comptes connus de l'annuaire). */
async function adminEmails() {
    const set = new Set();
    try {
        const rows = await pgDb.all(
            `SELECT LOWER(COALESCE(NULLIF(a.email, ''), u.email)) AS email
             FROM hub_entretiens.admins a LEFT JOIN hub.users u ON LOWER(u.username) = LOWER(a.username)`);
        for (const r of rows) if (r.email && r.email.includes('@')) set.add(r.email);
    } catch (e) { /* aucune adresse */ }
    return [...set];
}

module.exports = { ensureTable, latestFor, create, list, adminEmails };
