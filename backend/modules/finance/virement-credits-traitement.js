const { pool, getSqlite } = require('../../shared/database');
const { searchADUsersByQuery } = require('../../shared/ad_helper');
const apmMail = require('../../shared/apm_mail');
const { getMagappBaseUrl } = require('../../shared/app_url');

// Espace de traitement des virements de crédits par la direction des finances.
// - Accès : liste finance.virements_traitants. Un administrateur (admin / superadmin) désigne le premier agent ; ensuite
//   toute personne de la liste peut en ajouter ou en retirer.
// - Chaque acquittement (fait / en cours / refusé) envoie un e-mail au demandeur.

const STATUTS = {
    fait: { subject: 'traitée', phrase: 'a été <strong>traitée</strong> par la direction des finances.' },
    en_cours: { subject: 'en cours de traitement', phrase: 'est <strong>en cours de traitement</strong> par la direction des finances.' },
    refuse: { subject: 'refusée par la direction des finances', phrase: 'a été <strong>refusée</strong> par la direction des finances.' },
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isAdmin = (u) => !!u && ['superadmin', 'admin'].includes(u.role);

async function isTraitant(user) {
    if (!user || !user.username) return false;
    const r = await pool.query('SELECT 1 FROM finance.virements_traitants WHERE username = LOWER(TRIM($1))', [user.username]);
    return r.rows.length > 0;
}

async function rights(user) {
    const traitant = await isTraitant(user);
    let admin = isAdmin(user);
    if (!traitant && !admin && user && user.username) {
        const r = await pool.query('SELECT role FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [user.username]);
        admin = isAdmin(r.rows[0]);
    }
    return { traitant, canManage: traitant || admin };
}

async function listTraitants() {
    const r = await pool.query('SELECT username, display_name, email, added_by, added_at FROM finance.virements_traitants ORDER BY display_name, username');
    return r.rows;
}

// Recherche d'un agent à ajouter : Active Directory (source de vérité des agents)
// puis hub.users (agents déjà connus en base), résultats fusionnés et dédoublonnés.
async function searchAD(q) {
    try {
        const db = getSqlite();
        if (!db) return [];
        const settings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!settings || !settings.is_enabled) return [];
        const res = await searchADUsersByQuery(q, settings);
        return (res || []).map(u => ({
            username: u.username, displayName: u.displayName || u.username, email: u.email || '',
        }));
    } catch (e) { console.warn('[VirementCredits] recherche AD:', e.message); return []; }
}

async function searchHub(q) {
    const words = String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
    if (!words.length) return [];
    const params = words.map(w => `%${w.replace(/[\\%_]/g, '\\$&')}%`);
    const where = params.map((_, i) => `(COALESCE(displayname, '') || ' ' || username || ' ' || COALESCE(email, '')) ILIKE $${i + 1}`).join(' AND ');
    const r = await pool.query(`SELECT username, displayname, email FROM hub.users WHERE ${where} ORDER BY displayname, username LIMIT 15`, params);
    return r.rows.map(u => ({ username: u.username, displayName: u.displayname || u.username, email: u.email || '' }));
}

async function searchUsers(q) {
    const raw = String(q || '').trim();
    if (raw.length < 2) return [];
    const [ad, hub] = await Promise.all([
        searchAD(raw),
        searchHub(raw).catch(e => { console.warn('[VirementCredits] recherche hub.users:', e.message); return []; }),
    ]);
    const out = [];
    const seen = new Set();
    for (const u of [...ad, ...hub]) {
        const key = String(u.username || u.email || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(u);
    }
    return out.slice(0, 15);
}

async function addTraitant(username, addedBy, displayName, email) {
    const uname = String(username || '').trim();
    if (!uname) throw { status: 400, message: 'Agent manquant' };
    const r = await pool.query('SELECT username, displayname, email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [uname]);
    let u = r.rows[0];
    if (!u) {
        // Agent trouvé via l'AD mais pas encore connu en base : on crée le miroir minimal.
        try {
            const ins = await pool.query(
                `INSERT INTO hub.users (username, displayname, email, role, is_approved)
                 VALUES ($1, $2, $3, 'user', 1)
                 ON CONFLICT (username) DO UPDATE SET
                   displayname = COALESCE(EXCLUDED.displayname, hub.users.displayname),
                   email = COALESCE(EXCLUDED.email, hub.users.email)
                 RETURNING username, displayname, email`,
                [uname.toLowerCase(), displayName || null, email || null]);
            u = ins.rows[0];
        } catch (e) { console.warn('[VirementCredits] création hub.users:', e.message); }
    }
    if (!u) throw { status: 404, message: 'Agent introuvable' };
    await pool.query(
        `INSERT INTO finance.virements_traitants (username, display_name, email, added_by) VALUES (LOWER(TRIM($1)), $2, $3, $4)
         ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email`,
        [u.username, u.displayname || displayName || u.username, u.email || email || null, addedBy]);
}

async function removeTraitant(username) {
    await pool.query('DELETE FROM finance.virements_traitants WHERE username = LOWER(TRIM($1))', [username || '']);
}

// E-mail au demandeur. Renvoie l'adresse utilisée, ou null si aucune.
async function notifyRequester(row, statut, comment) {
    let to = String(row.created_by_email || '').trim();
    if (!to.includes('@')) {
        const r = await pool.query('SELECT email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [row.created_by_username || '']);
        to = String((r.rows[0] && r.rows[0].email) || '').trim();
    }
    if (!to.includes('@')) return null;
    const m = STATUTS[statut];
    const total = Number(row.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const link = `${await getMagappBaseUrl()}/?virement=${row.id}`;
    const label = statut === 'refuse' ? 'Raison du refus' : 'Commentaire';
    await apmMail.sendMail({
        to: [to], cc: [],
        subject: `Demande de virement de crédits n°${row.id} ${m.subject}`,
        content: `<p>Bonjour,</p><p>Votre demande de virement de crédits n°${row.id}${row.service ? ' (' + esc(row.service) + ')' : ''} de ${esc(total)} € ${m.phrase}</p>`
            + (comment ? `<p><strong>${label} :</strong><br>${esc(comment).replace(/\n/g, '<br>')}</p>` : '')
            + `<p><a href="${esc(link)}">Voir la demande dans MagApp</a></p>`,
        attachments: [],
    });
    return to;
}

module.exports = { STATUTS, rights, listTraitants, searchUsers, addTraitant, removeTraitant, notifyRequester };
