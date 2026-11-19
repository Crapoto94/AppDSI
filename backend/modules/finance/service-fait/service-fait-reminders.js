/**
 * Rappels automatiques aux vérificateurs de service fait dont le circuit traîne.
 * Chaque jour ouvré à 09:00 : tout circuit en attente (en_attente / en_cours / transfere) dont la dernière sollicitation date de plus de
 * N jours (réglage SQLite `finance.sf_reminder_days`, défaut 3) reçoit un rappel (3 maximum) avec le lien de validation encore valide.
 * Le lien suit l'origine du circuit (MagApp : magapp.ivry.local, sinon DSI Hub).
 */
const cron = require('node-cron');
const { pool, getSqlite } = require('../../../shared/database');
const { getAppBaseUrl, getMagappBaseUrl } = require('../../../shared/app_url');

const MAX_REMINDERS = 3;
let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

async function reminderDays() {
    try {
        const db = getSqlite();
        const r = db && await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'finance.sf_reminder_days'");
        const n = parseInt(r && r.setting_value, 10);
        return n > 0 ? n : 3;
    } catch { return 3; }
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function run() {
    if (!sendMailFn) return 0;
    const days = await reminderDays();
    const r = await pool.query(
        `SELECT id, invoice_number, invoice_ref, invoice_supplier, invoice_amount, verifier_name, verifier_email, token, origin, requested_by, created_at, reminder_count
           FROM finance.service_fait_workflows
          WHERE status IN ('en_attente','en_cours','transfere') AND token IS NOT NULL AND COALESCE(verifier_email, '') <> ''
            AND (token_expires_at IS NULL OR token_expires_at > NOW()) AND COALESCE(reminder_count, 0) < $1
            AND COALESCE(last_reminder_at, created_at) < NOW() - ($2 || ' days')::interval`,
        [MAX_REMINDERS, String(days)]);
    let sent = 0;
    for (const w of r.rows) {
        try {
            // MagApp : lien sans token (identification MagApp) ; Hub : lien public à token
            const url = w.origin === 'magapp' ? `${await getMagappBaseUrl()}/?sf=${w.id}` : `${await getAppBaseUrl()}/service-fait-verifier/${w.token}`;
            const age = Math.max(1, Math.round((Date.now() - new Date(w.created_at).getTime()) / 86400000));
            const amount = w.invoice_amount ? parseFloat(w.invoice_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '-';
            await sendMailFn(w.verifier_email, 'Rappel : validation du service fait en attente',
                `<p>Bonjour ${esc(w.verifier_name || '')},</p>
                 <p>Une validation de service fait vous attend depuis <strong>${age} jour${age > 1 ? 's' : ''}</strong> (demandée par ${esc(w.requested_by)}) :</p>
                 <ul><li><strong>N° facture :</strong> ${esc(w.invoice_number || w.invoice_ref)}</li><li><strong>Fournisseur :</strong> ${esc(w.invoice_supplier || '-')}</li><li><strong>Montant TTC :</strong> ${esc(amount)}</li></ul>
                 <p style="margin-top:16px"><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Valider le service fait</a></p>
                 <p style="font-size:12px;color:#94a3b8">Rappel ${w.reminder_count + 1} sur ${MAX_REMINDERS}. Si la facture ne vous concerne pas, répondez « Ne me concerne pas » sur la page de validation.</p>`);
            await pool.query('UPDATE finance.service_fait_workflows SET last_reminder_at = NOW(), reminder_count = COALESCE(reminder_count, 0) + 1 WHERE id = $1', [w.id]);
            await pool.query(`INSERT INTO finance.service_fait_historique (workflow_id, action, actor_username, actor_name, comment) VALUES ($1, 'rappel', 'système', 'système', $2)`, [w.id, `Rappel ${w.reminder_count + 1}/${MAX_REMINDERS} envoyé à ${w.verifier_email}`]).catch(() => {});
            sent++;
        } catch (e) { console.warn(`[SF RAPPELS] workflow #${w.id}:`, e.message); }
    }
    return sent;
}

let task = null;
function start() {
    if (task) return;
    task = cron.schedule('0 9 * * 1-5', () => { run().then(n => { if (n) console.log(`[SF RAPPELS] ${n} rappel(s) envoyé(s)`); }).catch(e => console.error('[SF RAPPELS]', e.message)); }, { timezone: 'Europe/Paris' });
    console.log('[SF RAPPELS] Rappels aux vérificateurs programmés (jours ouvrés, 09:00).');
}

module.exports = { start, run, setSendMail };
