const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Ajouter la colonne destinataire aux contacts si elle n'existe pas
    db.run("ALTER TABLE contacts ADD COLUMN is_order_recipient INTEGER DEFAULT 0", (err) => {
        if (err) console.log("Note: La colonne is_order_recipient existe déjà.");
    });

    // Créer la table des modèles
    db.run(`CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        slug TEXT UNIQUE, 
        label TEXT, 
        subject TEXT, 
        body TEXT
    )`);

    // Insérer le modèle par défaut pour les commandes
    db.run(`INSERT OR IGNORE INTO email_templates (slug, label, subject, body) VALUES (
        'NOUVELLE_COMMANDE', 
        'Envoi de Bon de Commande', 
        'Nouveau document concernant votre commande - Ivry-sur-Seine', 
        'Bonjour,\n\nVeuillez trouver ci-joint un document relatif à votre commande.\n\nCordialement,\nLe service DSI - Ville d''Ivry-sur-Seine'
    )`);
    
    db.close();
});
