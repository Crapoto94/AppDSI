const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all('SELECT "N° Facture fournisseur", COUNT(*) as c FROM invoices GROUP BY "N° Facture fournisseur" HAVING c > 1 LIMIT 5', (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
    db.close();
});
