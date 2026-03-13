const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const nom = 'CHEVALIER';

db.all('SELECT id, nom, code FROM tiers WHERE nom LIKE ?', [`%${nom}%`], (err, rows) => {
    console.log(`Tiers matching ${nom}:`, rows);
    db.close();
});
