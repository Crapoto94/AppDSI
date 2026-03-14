const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');
db.all("PRAGMA table_info(referentiel_agents)", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows.map(r => r.name));
    db.close();
});
