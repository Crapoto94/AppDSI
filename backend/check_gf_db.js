const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('oracle_gf.sqlite');
db.all("SELECT DISTINCT substr(COMMANDE_CMD_DATECOMMANDE, 1, 4) as y FROM oracle_commande", (err, rows) => {
    if (err) console.error(err);
    console.log('Years in oracle_gf.sqlite:', rows);
    db.all("SELECT COUNT(*) as count FROM oracle_commande", (err2, rows2) => {
        if (err2) console.error(err2);
        console.log('Total rows in oracle_gf.sqlite:', rows2);
        db.close();
    });
});
