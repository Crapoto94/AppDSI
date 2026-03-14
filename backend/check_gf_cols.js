const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.all("PRAGMA table_info(oracle_commande)", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Columns in oracle_commande:");
    rows.forEach(row => {
        console.log(`- ${row.name} (${row.type})`);
    });
    db.close();
});
