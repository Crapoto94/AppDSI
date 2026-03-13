const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function update() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const newTemplate = `
<div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
    <div style="text-align: center; padding: 20px 0;">
        <img src="cid:logo_dsi" alt="DSI Hub" style="max-height: 80px;">
    </div>
    <div style="background: white; padding: 30px; border-radius: 10px; border: 1px solid #eee;">
        {{content}}
    </div>
    <div style="text-align: center; padding: 20px; font-size: 12px; color: #999;">
        <p>Service DSI - Ville d'Ivry-sur-Seine</p>
        <p>Ceci est un message automatique, merci de ne pas y répondre directement.</p>
    </div>
</div>`;

    await db.run('UPDATE mail_settings SET template_html = ? WHERE id = 1', [newTemplate]);
    console.log('Mail template updated with CID logo.');

    await db.run('UPDATE users SET is_approved = 1 WHERE username = "machevalier"');
    console.log('User machevalier forced to approved.');

    const templates = [
        {
            slug: 'NOUVELLE_COMMANDE',
            label: 'Envoi de Bon de Commande',
            subject: 'Nouveau document concernant votre commande - Ivry-sur-Seine',
            body: 'Bonjour,\n\nVeuillez trouver ci-joint un document relatif à votre commande.\n\nCordialement,\nLe service DSI - Ville d\'Ivry-sur-Seine'
        },
        {
            slug: 'MAINTENANCE_APP',
            label: 'Maintenance Application',
            subject: 'Maintenance de l\'application {{app_name}}',
            body: 'Bonjour,\n\nNous vous informons que l\'application {{app_name}} est actuellement en maintenance.\n\nDescription : {{description}}\n{{maintenance_info}}\n\nCordialement,\nLe service DSI - Ville d\'Ivry-sur-Seine'
        },
        {
            slug: 'RELANCE_FACTURE',
            label: 'Relance Facture',
            subject: 'Rappel : Facture en attente de traitement',
            body: 'Bonjour,\n\nSauf erreur de notre part, la facture {{num}} est toujours en attente.\n\nCordialement,\nLe service DSI'
        }
    ];

    for (const t of templates) {
        await db.run(`INSERT OR REPLACE INTO email_templates (slug, label, subject, body) VALUES (?, ?, ?, ?)`, [t.slug, t.label, t.subject, t.body]);
    }
    console.log('Email templates seeded/recovered.');

    await db.close();
}

update();
