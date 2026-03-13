const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database_svg.sqlite');
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, nom, code FROM tiers WHERE id IN (4656, 43848)', (err, rows) => {
    if (err) console.error(err);
    console.log('Tiers in backup:', rows);
    db.close();
});
