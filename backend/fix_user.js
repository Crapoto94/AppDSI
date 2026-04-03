const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const username = 'machevalier';

db.serialize(() => {
    // 1. Vérifier si l'utilisateur existe
    db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username], (err, row) => {
        if (err) {
            console.error('Erreur :', err.message);
            return;
        }

        if (row) {
            console.log(`L'utilisateur ${username} existe déjà (ID: ${row.id}, Role: ${row.role}, Approved: ${row.is_approved})`);
            // Mettre à jour pour s'assurer qu'il est admin et approuvé
            db.run('UPDATE users SET role = "admin", is_approved = 1 WHERE id = ?', [row.id], function(err) {
                if (err) console.error('Erreur UPDATE :', err.message);
                else console.log(`Compte ${username} mis à jour : Admin & Approuvé.`);
            });
        } else {
            console.log(`L'utilisateur ${username} n'existe pas. Création...`);
            db.run('INSERT INTO users (username, role, is_approved) VALUES (?, "admin", 1)', [username.toLowerCase()], function(err) {
                if (err) console.error('Erreur INSERT :', err.message);
                else console.log(`Compte ${username} créé avec succès (Admin & Approuvé).`);
            });
        }
    });
});

setTimeout(() => db.close(), 2000);
