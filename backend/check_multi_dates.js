const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.all("SELECT COMMANDE_CMD_DATECOMMANDE FROM oracle_commande LIMIT 10", (err, rows) => {
    if (err) console.error(err);
    else {
        rows.forEach((r, i) => console.log(`Row ${i}:`, r.COMMANDE_CMD_DATECOMMANDE));
    }
    db.close();
});
