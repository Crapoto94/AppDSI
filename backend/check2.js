const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');
db.all("SELECT SUM(CASE WHEN DATE_DEPART IS NULL OR DATE_DEPART = 'null' THEN 1 ELSE 0 END) as isNullCount, SUM(CASE WHEN DATE_DEPART IS NOT NULL AND DATE_DEPART != 'null' THEN 1 ELSE 0 END) as isNotNullCount FROM rh.referentiel_agents", (err, rows) => {
    if(err) console.error(err);
    else console.log(rows);
});
