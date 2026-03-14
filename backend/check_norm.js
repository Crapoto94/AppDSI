const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');

db.all("SELECT MATRICULE, DATE_ARRIVEE FROM referentiel_agents WHERE DATE_ARRIVEE != '' AND DATE_ARRIVEE IS NOT NULL LIMIT 10", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
    db.close();
});
