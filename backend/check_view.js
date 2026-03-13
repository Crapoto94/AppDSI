const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
db.all("SELECT name, type FROM sqlite_master WHERE name LIKE '%orders%'", (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
