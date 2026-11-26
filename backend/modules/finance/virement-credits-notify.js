const cron = require('node-cron');
const { pool } = require('../../shared/database');
const apmMail = require('../../shared/apm_mail');
const { getMagappBaseUrl } = require('../../shared/app_url');
const ctrl = require('./virement-credits.controller');

// Prévient le demandeur quand sa demande de virement de crédits est signée, refusée ou annulée au parapheur
// (une seule fois par changement d'état : finance.virements_credits.notified_etat). Lien d'accès = MagApp.
const MESSAGES = {
    termine: { subject: 'signée', body: 'Toutes les signatures sont faites. Vous pouvez maintenant l’envoyer au service budget depuis MagApp.' },
    refuse: { subject: 'refusée', body: 'Un signataire a refusé de la signer. Vous pouvez la dupliquer dans MagApp pour la corriger.' },
    annule: { subject: 'annulée', body: 'Le circuit de signature a été annulé. Vous pouvez la dupliquer dans MagApp pour la relancer.' },
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function run() {
    await ctrl.ensureTable();
    const r = await pool.query(
        `SELECT v.id, v.created_by_username, v.created_by_email, v.service, v.montant, v.parapheur_id, p.status
           FROM finance.virements_credits v JOIN hub_parapheur.parapheurs p ON p.id = v.parapheur_id
          WHERE v.sent_at IS NULL AND p.status IN ('termine','refuse','annule')
            AND COALESCE(v.notified_etat, '') <> p.status`);
    let sent = 0;
    const base = await getMagappBaseUrl();
    for (const row of r.rows) {
        const m = MESSAGES[row.status];
        const to = String(row.created_by_email || '').trim();
        try {
            if (to.includes('@')) {
                const total = Number(row.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const link = `${base}/?virement=${row.id}`;
                await apmMail.sendMail({
                    to: [to], cc: [],
                    subject: `Demande de virement de crédits n°${row.id} ${m.subject}`,
                    content: `<p>Bonjour,</p><p>Votre demande de virement de crédits n°${row.id}${row.service ? ' (' + esc(row.service) + ')' : ''} de ${esc(total)} € est <strong>${m.subject}</strong>.</p>`
                        + `<p>${m.body}</p><p><a href="${esc(link)}">Ouvrir la demande dans MagApp</a></p>`,
                    attachments: [],
                });
                sent++;
            }
            await pool.query('UPDATE finance.virements_credits SET notified_etat = $1 WHERE id = $2', [row.status, row.id]);
            await ctrl.logAction(row.id, 'système', `notification_${row.status}`, { to: to || null });
        } catch (e) { console.warn(`[VIREMENT CRON] notification #${row.id} échouée:`, e.message); }
    }
    return sent;
}

let task = null;
function start() {
    if (task) return;
    task = cron.schedule('*/5 * * * *', () => { run().catch(e => console.error('[VIREMENT CRON]', e.message)); });
    console.log('[VIREMENT CRON] Notification des demandeurs programmée (toutes les 5 min).');
}

module.exports = { start, run };
