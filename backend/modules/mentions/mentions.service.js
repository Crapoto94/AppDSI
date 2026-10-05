const { pgDb } = require('../../shared/database');

let _sendMail = null;
function setSendMail(fn) { _sendMail = fn; }

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function approvedUsers() {
    return pgDb.all(
        `SELECT username, "displayName" AS display_name, email FROM hub.users
         WHERE is_approved = 1 AND "displayName" IS NOT NULL AND TRIM("displayName") <> ''`
    );
}

// Retrouve les "@Nom Prénom" d'un texte (nom exact inséré par le sélecteur ; le plus long gagne).
async function extractMentions(content) {
    const text = norm(stripHtml(content));
    if (!text.includes('@')) return [];
    const users = (await approvedUsers()).map(u => ({ ...u, key: norm(u.display_name) })).sort((a, b) => b.key.length - a.key.length);
    const found = new Map();
    let rest = text;
    for (const u of users) {
        const tag = '@' + u.key;
        let i = rest.indexOf(tag);
        let hit = false;
        while (i !== -1) {
            const after = rest[i + tag.length];
            if (!after || !/[a-z0-9]/.test(after)) {
                hit = true;
                rest = rest.slice(0, i) + ' '.repeat(tag.length) + rest.slice(i + tag.length);
            }
            i = rest.indexOf(tag, i + tag.length);
        }
        if (hit) found.set(u.username, u);
    }
    return [...found.values()];
}

/**
 * Crée une notification pour chaque agent tagué dans `content`.
 * Ne bloque jamais le commentaire : toute erreur est seulement journalisée.
 */
async function notifyMentions({ content, actor, source, entityId, title, link }) {
    try {
        const users = (await extractMentions(content)).filter(u => u.username !== actor?.username);
        if (!users.length) return 0;
        const by = actor?.displayName || actor?.username || 'Un agent';
        const excerpt = stripHtml(content).trim().slice(0, 300);
        for (const u of users) {
            await pgDb.run(
                `INSERT INTO hub.user_notifications (username, type, title, body, link, source, entity_id, actor_username, actor_name)
                 VALUES ($1, 'mention', $2, $3, $4, $5, $6, $7, $8)`,
                [u.username, `${by} vous a mentionné — ${title}`, excerpt, link, source, String(entityId), actor?.username || null, by]
            );
        }
        return users.length;
    } catch (e) {
        console.error('[MENTIONS] notifyMentions:', e.message);
        return 0;
    }
}

async function appBaseUrl() {
    const { getAppBaseUrl } = require('../../shared/app_url');
    return getAppBaseUrl();
}

// Un mail récapitulatif par agent pour ses notifications non lues, une seule fois.
async function sendDigest() {
    if (!_sendMail) { console.warn('[MENTIONS] digest ignoré : sendMail non branché'); return 0; }
    const rows = await pgDb.all(
        `SELECT n.*, u.email, u."displayName" AS display_name FROM hub.user_notifications n
         JOIN hub.users u ON u.username = n.username
         WHERE n.read_at IS NULL AND n.mailed_at IS NULL ORDER BY n.created_at`
    );
    const byUser = new Map();
    for (const r of rows) {
        if (!byUser.has(r.username)) byUser.set(r.username, []);
        byUser.get(r.username).push(r);
    }
    const base = await appBaseUrl();
    let sent = 0;
    for (const list of byUser.values()) {
        const email = list[0].email;
        if (!email) continue;
        const items = list.map(n => `<li style="margin-bottom:10px"><a href="${esc(base + n.link)}"><b>${esc(n.title)}</b></a><br><span style="color:#555">${esc(n.body)}</span></li>`).join('');
        const html = `<p>Bonjour ${esc(list[0].display_name || '')},</p><p>Vous avez ${list.length} notification(s) non lue(s) sur le Hub DSI :</p><ul>${items}</ul>`;
        try {
            await _sendMail(email, `Hub DSI — ${list.length} notification(s) non lue(s)`, html, [], 'notifications', { rawHtml: true });
            await pgDb.run(`UPDATE hub.user_notifications SET mailed_at = NOW() WHERE id = ANY($1::int[])`, [list.map(n => n.id)]);
            sent++;
        } catch (e) { console.error('[MENTIONS] digest', email, e.message); }
    }
    return sent;
}

module.exports = { setSendMail, extractMentions, notifyMentions, sendDigest, approvedUsers };
