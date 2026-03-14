const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('oracle_rh.sqlite');
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
