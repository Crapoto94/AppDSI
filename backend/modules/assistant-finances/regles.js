/**
 * « Éduquer l'IA » : consignes données par les agents, reprises ensuite à chaque question.
 *
 * Une consigne est personnelle ; un administrateur peut la rendre commune à tous. Elle n'est transmise qu'au
 * modèle LOCAL, pour l'aider à comprendre la question : elle ne change ni le format de la demande, ni les droits
 * (revérifiés par le serveur), ni les chiffres.
 */
const { pool } = require('../../shared/database');

const MAX_LENGTH = 300;
const MAX_PER_AGENT = 30;
const isAdmin = (user) => ['admin', 'superadmin'].includes(user?.role);
const low = (v) => String(v || '').trim().toLowerCase();
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };

/** Consignes visibles de l'agent : les siennes et les communes. */
async function lister(user) {
    const { rows } = await pool.query(
        `SELECT id, texte, commune, username, created_at FROM finance.assistant_regles
          WHERE commune OR LOWER(username) = $1 ORDER BY commune DESC, id`, [low(user.username)]);
    return {
        admin: isAdmin(user),
        regles: rows.map(r => ({ id: r.id, texte: r.texte, commune: r.commune, auteur: r.username, modifiable: r.commune ? isAdmin(user) : low(r.username) === low(user.username) })),
    };
}

/** Textes à joindre à la question ; une base indisponible ne doit jamais empêcher de répondre. */
async function pourPrompt(user) {
    try {
        return (await lister(user)).regles.map(r => r.texte).slice(0, 40);
    } catch (e) {
        console.warn('[AssistantFinances] consignes illisibles :', e.message);
        return [];
    }
}

async function ajouter(user, { texte, commune } = {}) {
    const t = String(texte || '').replace(/\s+/g, ' ').trim();
    if (t.length < 8) throw fail(400, 'Écrivez la consigne en une phrase.');
    if (t.length > MAX_LENGTH) throw fail(400, `Consigne trop longue (${MAX_LENGTH} caractères maximum).`);
    if (commune && !isAdmin(user)) throw fail(403, 'Seul un administrateur peut donner une consigne valable pour tous.');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM finance.assistant_regles WHERE LOWER(username) = $1', [low(user.username)]);
    if (rows[0].n >= MAX_PER_AGENT) throw fail(400, `${MAX_PER_AGENT} consignes au maximum : supprimez-en une.`);
    await pool.query('INSERT INTO finance.assistant_regles (username, texte, commune) VALUES ($1, $2, $3)', [low(user.username), t, !!commune]);
    return lister(user);
}

async function supprimer(user, id) {
    const n = parseInt(id, 10);
    if (!n) throw fail(400, 'Consigne inconnue.');
    const r = await pool.query(
        `DELETE FROM finance.assistant_regles WHERE id = $1 AND (LOWER(username) = $2 AND NOT commune OR commune AND $3::boolean)`,
        [n, low(user.username), isAdmin(user)]);
    if (!r.rowCount) throw fail(403, 'Vous ne pouvez pas supprimer cette consigne.');
    return lister(user);
}

module.exports = { lister, pourPrompt, ajouter, supprimer };
