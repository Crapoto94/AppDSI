const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');
const today = '2026-03-14';
db.all("SELECT MATRICULE, DATE_ARRIVEE, (DATE_ARRIVEE > ?) as isF FROM referentiel_agents WHERE DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE != '' LIMIT 20", [today], (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
    db.close();
});
