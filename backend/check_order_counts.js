const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.all("SELECT BUDGET_BUDGET, BUDGET_LIBELLE, COUNT(*) as count FROM oracle_commande GROUP BY BUDGET_BUDGET", (err, rows) => {
    console.log('Order counts by budget:', rows);
    db.close();
});
