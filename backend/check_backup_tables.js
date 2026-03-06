const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'database_svg.sqlite'));
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows));
    db.close();
});
