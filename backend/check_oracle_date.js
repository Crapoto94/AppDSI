const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.get("SELECT COMMANDE_CMD_DATECOMMANDE FROM oracle_commande LIMIT 1", (err, row) => {
    console.log('Sample date:', row.COMMANDE_CMD_DATECOMMANDE);
    db.close();
});
