const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');

const today = new Date().toISOString().substring(0, 10);

db.all("SELECT MATRICULE, DATE_ARRIVEE, (DATE_ARRIVEE > ?) as isFuture FROM referentiel_agents LIMIT 10", [today], (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
    db.close();
});
