/**
 * Met à jour uniquement le template ticket_comment_reply pour restaurer
 * le lien de réponse publique ({{reply_url}}) sans toucher aux autres templates.
 *
 * Usage : node backend/scripts/fix_comment_reply_template.js
 */
const { pool, setupPgDb } = require('../shared/database');

const SLUG = 'ticket_comment_reply';
const LABEL = 'Réponse au commentaire';
const SUBJECT = '[Ticket #{{ticket_id}}] Réponse à votre demande';
const BODY_HTML = `<p>Bonjour {{recipient_name}},</p>
<p>Vous avez reçu une réponse concernant votre ticket <strong>#{{ticket_id}} – {{ticket_title}}</strong> :</p>
<blockquote style="border-left:4px solid #6366f1;padding-left:12px;margin:12px 0;color:#374151;">{{comment_content}}</blockquote>
<p style="margin-top:16px;">
  <a href="{{reply_url}}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">↩ Répondre à ce message</a>
</p>
<p style="font-size:12px;color:#94a3b8;">Ou copiez ce lien dans votre navigateur : {{reply_url}}</p>
<p>Cordialement,<br>{{author_name}}</p>`;

async function run() {
    await setupPgDb();
    const { rowCount } = await pool.query(
        `UPDATE hub_tickets.notification_templates
         SET subject = $1, body_html = $2, label = $3
         WHERE slug = $4`,
        [SUBJECT, BODY_HTML, LABEL, SLUG]
    );
    if (rowCount === 0) {
        console.log(`Template "${SLUG}" introuvable, insertion...`);
        await pool.query(
            `INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html)
             VALUES ($1, $2, $3, $4)`,
            [SLUG, LABEL, SUBJECT, BODY_HTML]
        );
        console.log('Template inséré.');
    } else {
        console.log(`Template "${SLUG}" mis à jour.`);
    }
    await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
