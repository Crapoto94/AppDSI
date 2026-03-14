const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('oracle_gf.sqlite');
db.all("SELECT DISTINCT substr(Arrivée, 1, 4) as y FROM invoices", (err, rows) => {
    if (err) console.error(err);
    console.log('Years in gf.invoices:', rows);
    db.close();
});
