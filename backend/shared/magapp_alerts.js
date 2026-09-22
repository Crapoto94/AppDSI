/**
 * Alertes du Magasin d'applications : maintenance d'une application et
 * publication d'une nouvelle version (« quoi de neuf »).
 *
 * Les destinataires sont :
 *   - les abonnés de l'application concernée (magapp.subscriptions, si
 *     email_alerts est vrai) ;
 *   - les administrateurs du Magasin d'applications (accès tuile
 *     /admin/magapp ou rôle admin/superadmin), abonnés d'office à tout.
 *
 * Le service d'envoi (sendMail de server.js) est injecté via setSendMail.
 */
const { pgDb, getSqlite } = require('./database');

let sendMailFn = null;
function setSendMail(fn) { sendMailFn = fn; }

function norm(email) { return String(email || '').trim().toLowerCase(); }

/** Emails des abonnés d'une application (email_alerts non désactivé). */
async function getSubscriberEmails(appId) {
    try {
        const rows = await pgDb.all(
            'SELECT email, email_alerts FROM magapp.subscriptions WHERE app_id = ?',
            [appId]
        );
        return rows.filter(r => r.email_alerts !== false && r.email).map(r => norm(r.email));
    } catch (e) { return []; }
}

/** Emails des administrateurs du Magasin d'applications (abonnés d'office). */
async function getAdminEmails() {
    const set = new Set();
    try {
        const rows = await pgDb.all(
            `SELECT email FROM hub.users
             WHERE email IS NOT NULL AND email <> '' AND role IN ('admin','superadmin')`
        );
        rows.forEach(r => set.add(norm(r.email)));
    } catch (e) { /* ignore */ }
    try {
        const db = getSqlite();
        if (db) {
            const rows = await db.all(
                `SELECT u.email FROM user_tiles ut
                 JOIN tile_links tl ON ut.tile_id = tl.tile_id
                 JOIN users u ON u.id = ut.user_id
                 WHERE tl.url = '/admin/magapp' AND u.email IS NOT NULL AND u.email <> ''`
            );
            rows.forEach(r => set.add(norm(r.email)));
        }
    } catch (e) { /* ignore */ }
    return [...set];
}

/** Emails de tous les abonnés (toutes applications, email_alerts vrai). */
async function getAllSubscriberEmails() {
    try {
        const rows = await pgDb.all(
            `SELECT DISTINCT email FROM magapp.subscriptions
             WHERE email IS NOT NULL AND email <> '' AND email_alerts IS NOT FALSE`
        );
        return rows.map(r => norm(r.email));
    } catch (e) { return []; }
}

async function getBaseUrl() {
    let base = process.env.FRONTEND_URL || process.env.APP_BASE_URL || process.env.APP_URL || '';
    try {
        const db = getSqlite();
        if (db) {
            const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
            if (row?.setting_value) base = row.setting_value;
        }
    } catch (e) { /* repli env */ }
    return String(base || '').replace(/\/+$/, '');
}

async function sendToAll(emails, subject, content) {
    if (!sendMailFn) return 0;
    const unique = [...new Set(emails.filter(Boolean))];
    let sent = 0;
    for (const email of unique) {
        try { await sendMailFn(email, subject, content, []); sent++; }
        catch (e) { console.error(`[MAGAPP ALERT] Erreur envoi à ${email}:`, e.message); }
    }
    return sent;
}

/**
 * Alerte de maintenance : notifie les abonnés de l'application + les admins.
 * @param {number} maintenanceId
 * @returns {Promise<number>} nombre d'emails envoyés
 */
async function sendMaintenanceAlert(maintenanceId) {
    try {
        const m = await pgDb.get(
            `SELECT m.*, a.name AS app_name
             FROM magapp.maintenances m
             JOIN magapp.apps a ON a.id = m.app_id
             WHERE m.id = ?`,
            [maintenanceId]
        );
        if (!m) return 0;

        const fmt = (d) => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : '—';
        const severityLabel = m.severity === 'majeure' ? 'maintenance majeure' : 'maintenance';
        const interruption = m.has_interruption ? 'Une interruption de service est à prévoir.' : "Aucune interruption de service n'est prévue.";
        const subject = `[DSI Hub] ${m.severity === 'majeure' ? 'Maintenance majeure' : 'Maintenance'} — ${m.app_name}`;
        const content = `
<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;max-width:640px">
  <h2 style="color:#0078a4;margin:0 0 12px">🛠️ ${m.severity === 'majeure' ? 'Maintenance majeure' : 'Maintenance programmée'}</h2>
  <p>L'application <strong>${m.app_name}</strong> fera l'objet d'une ${severityLabel} :</p>
  <ul style="line-height:1.7">
    <li><strong>Objet :</strong> ${m.name || '—'}</li>
    <li><strong>Début :</strong> ${fmt(m.start_date)}</li>
    <li><strong>Fin estimée :</strong> ${fmt(m.end_date)}</li>
  </ul>
  <p>${interruption}</p>
  ${m.description ? `<div style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">${m.description}</div>` : ''}
  <p style="margin-top:20px;color:#64748b;font-size:13px">Vous recevez ce message car vous êtes abonné aux alertes du Magasin d'applications.</p>
</div>`;

        const recipients = [...new Set([...(await getSubscriberEmails(m.app_id)), ...(await getAdminEmails())])];
        return await sendToAll(recipients, subject, content);
    } catch (e) {
        console.error('[MAGAPP ALERT] sendMaintenanceAlert:', e.message);
        return 0;
    }
}

/**
 * Alerte « nouvelle version » (quoi de neuf) : notifie tous les abonnés + admins.
 * @param {number} versionId
 * @returns {Promise<number>} nombre d'emails envoyés
 */
async function sendVersionAlert(versionId) {
    try {
        const v = await pgDb.get('SELECT * FROM magapp.versions WHERE id = ?', [versionId]);
        if (!v) return 0;

        const base = await getBaseUrl();
        const docLink = v.document_path
            ? `<p style="margin-top:16px"><a href="${base}/${String(v.document_path).replace(/^\/+/, '')}" style="display:inline-block;background:#0078a4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">📄 ${v.document_name || 'Document de la version'}</a></p>`
            : '';

        const subject = `[DSI Hub] Nouveauté — version ${v.version_number}`;
        const content = `
<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;max-width:680px">
  <h1 style="color:#0078a4;margin:0 0 4px;font-size:22px">✨ Quoi de neuf ?</h1>
  <p style="color:#64748b;margin:0 0 18px">Nouvelle version du DSI Hub : <strong>${v.version_number}</strong></p>
  <div style="padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;line-height:1.7">${v.release_notes_html || '<em>Aucune note de version.</em>'}</div>
  ${docLink}
  <p style="margin-top:20px;color:#64748b;font-size:13px">Vous recevez ce message car vous êtes abonné aux alertes du Magasin d'applications.</p>
</div>`;

        const recipients = [...new Set([...(await getAllSubscriberEmails()), ...(await getAdminEmails())])];
        return await sendToAll(recipients, subject, content);
    } catch (e) {
        console.error('[MAGAPP ALERT] sendVersionAlert:', e.message);
        return 0;
    }
}

module.exports = { setSendMail, sendMaintenanceAlert, sendVersionAlert, getAdminEmails, getSubscriberEmails };
