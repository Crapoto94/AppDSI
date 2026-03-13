const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const slug = 'NOUVELLE_COMMANDE';
const label = 'Notification : Nouvelle Commande';
const subject = 'Nouveau document concernant votre commande - Ivry-sur-Seine';
const body = `TITRE : Notification de document

MESSAGE :
Bonjour,

Veuillez trouver ci-joint un document relatif à votre commande.

Cordialement,
Le service DSI - Ville d'Ivry-sur-Seine`;

db.run(
    "INSERT OR REPLACE INTO email_templates (slug, label, subject, body) VALUES (?, ?, ?, ?)",
    [slug, label, subject, body],
    (err) => {
        if (err) console.error(err);
        else console.log("Modèle 'Nouvelle Commande' initialisé avec succès.");
        db.close();
    }
);
