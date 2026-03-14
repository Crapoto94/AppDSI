const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');
db.all("SELECT * FROM referentiel_agents LIMIT 1", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows[0], null, 2));
    db.close();
});
