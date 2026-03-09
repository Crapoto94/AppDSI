const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function fix() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    console.log("Checking table magapp_subscriptions...");
    await db.exec(`
        CREATE TABLE IF NOT EXISTS magapp_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER,
            email TEXT NOT NULL,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (app_id) REFERENCES magapp_apps (id) ON DELETE CASCADE,
            UNIQUE(app_id, email)
        );
    `);
    console.log("Table created or already exists.");
    
    // Vérifier aussi le template de mail
    const template = await db.get('SELECT id FROM email_templates WHERE slug = "MAINTENANCE_APP"');
    if (!template) {
        console.log("Adding MAINTENANCE_APP template...");
        await db.run(`
            INSERT INTO email_templates (slug, label, context, subject, body)
            VALUES ('MAINTENANCE_APP', 'Maintenance Application', 'maintenance_app', 
            'Maintenance de l''application {{app_name}}',
            'Bonjour,\n\nNous vous informons que l''application {{app_name}} est actuellement en maintenance.\n\nDescription : {{description}}\n{{maintenance_info}}\n\nCordialement,\nLe service DSI - Ville d''Ivry-sur-Seine')
        `);
        console.log("Template added.");
    } else {
        console.log("Template already exists.");
    }

    await db.close();
}

fix().catch(console.error);
