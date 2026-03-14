const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.get("SELECT BUDGET_BUDGET, BUDGET_LIBELLE FROM oracle_commande LIMIT 1", (err, row) => {
    console.log('Sample Order Budget:', row);
    db.all("SELECT DISTINCT BUDGET_BUDGET, BUDGET_LIBELLE FROM oracle_commande", (err, rows) => {
        console.log('Unique Budgets:', rows);
        db.close();
    });
});
