/**
 * Garde-fou « BETA » des entretiens professionnels de la Ville (MagApp).
 *
 * Tant que la fonctionnalité n'est pas publiée (réglage `show_entretiens_pro` décoché dans /admin/magapp), aucun mail
 * (notification, relance, invitation Outlook, parapheur de signature) ne part vers un agent, sauf vers les agents inscrits
 * à la BETA « Entretiens professionnels » (/admin/magapp, « Accès par fonctionnalité ») : cela permet de tester tout le
 * processus sans prévenir les vrais agents. Une fois publiée, tout le monde est prévenu normalement.
 *
 * Ne concerne que les entretiens de la Ville (`source = 'ville'`) : les entretiens de la DSI, déjà en production, ne changent pas.
 */
const { pgDb } = require('./database');

const FEATURE = 'entretiens_pro';
const SCOPE = 'entretiens_pro'; // valeur de `hub_parapheur.parapheurs.mail_scope`

let cache = { at: 0, published: false, emails: new Set() };

async function load() {
    if (Date.now() - cache.at < 15000) return cache;
    let published = false;
    const emails = new Set();
    try {
        const s = await pgDb.get('SELECT show_entretiens_pro FROM magapp.settings WHERE id = 1');
        published = !!(s && s.show_entretiens_pro);
        if (!published) {
            const rows = await pgDb.all(
                `SELECT LOWER(fu.email) AS email, LOWER(u.email) AS user_email
                 FROM magapp.feature_users fu
                 LEFT JOIN hub.users u ON fu.username IS NOT NULL AND fu.username <> '' AND LOWER(u.username) = LOWER(fu.username)
                 WHERE fu.feature = ?`, [FEATURE]);
            for (const r of rows) { if (r.email) emails.add(r.email); if (r.user_email) emails.add(r.user_email); }
        }
    } catch (e) {
        // En cas de doute (base indisponible), on n'envoie rien : mieux vaut un mail manquant qu'un mail de test à un vrai agent.
        console.error('[EP BETA] lecture du réglage impossible, envois bloqués :', e.message);
    }
    cache = { at: Date.now(), published, emails };
    return cache;
}

/** Peut-on envoyer un mail à cette adresse pour un entretien de la Ville ? */
async function allowed(email) {
    const c = await load();
    if (c.published) return true;
    const e = String(email || '').trim().toLowerCase();
    return !!e && c.emails.has(e);
}

/**
 * Même question pour un entretien quelconque : seuls les entretiens de la Ville (source 'ville') sont filtrés.
 * Journalise les envois bloqués.
 */
async function allowedForEntretien(entretien, email, what = 'mail') {
    if (!entretien || entretien.source !== 'ville') return true;
    const ok = await allowed(email);
    if (!ok) console.log(`[EP BETA] ${what} non envoyé à ${email || '(sans adresse)'} : fonctionnalité en BETA, destinataire hors BETA.`);
    return ok;
}

/** Invalide le cache (après modification du réglage ou de la liste BETA). */
function reset() { cache = { at: 0, published: false, emails: new Set() }; }

module.exports = { allowed, allowedForEntretien, reset, SCOPE, FEATURE };
