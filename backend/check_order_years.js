const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.all("SELECT DISTINCT CAST(substr(COMMANDE_CMD_DATECOMMANDE, 1, 4) AS INTEGER) as year FROM oracle_commande WHERE year IS NOT NULL AND year > 2000 ORDER BY year", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Unique Years with orders:', rows);
    }
    db.close();
});
