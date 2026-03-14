const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(gfDbPath);

db.all("SELECT DISTINCT BUDGET_BUDGET, BUDGET_LIBELLE, BUDGET_ROO_IMA_REF FROM oracle_commande", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Unique Budgets with Ref:', JSON.stringify(rows, null, 2));
    }
    db.close();
});
