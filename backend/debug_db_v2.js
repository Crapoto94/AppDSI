const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Erreur ouverture DB:', err.message);
        return;
    }
    
    db.all("PRAGMA table_info(oracle_commande)", (err, rows) => {
        if (err) {
            console.error('Erreur PRAGMA:', err.message);
        } else {
            console.log('--- COLONNES ORACLE_COMMANDE ---');
            console.log(JSON.stringify(rows.map(r => r.name), null, 2));
            
            db.get("SELECT * FROM oracle_commande LIMIT 1", (err, row) => {
                if (!err && row) {
                    console.log('--- EXEMPLE DE LIGNE ---');
                    console.log(JSON.stringify(row, null, 2));
                }
                db.close();
            });
        }
    });
});
