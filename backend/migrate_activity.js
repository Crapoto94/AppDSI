const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function migrate() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('Ajout de la colonne last_action à la table users...');
    try {
        await db.run('ALTER TABLE users ADD COLUMN last_action TEXT');
    } catch (e) {
        console.log('La colonne last_action existe déjà ou erreur:', e.message);
    }

    console.log('Création de la table import_history...');
    await db.exec(`
        CREATE TABLE IF NOT EXISTS import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            user_id INTEGER,
            username TEXT,
            timestamp TEXT,
            filename TEXT
        )
    `);

    console.log('Migration terminée.');
    await db.close();
}

migrate().catch(console.error);
