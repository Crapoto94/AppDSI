const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.get('SELECT * FROM glpi_settings WHERE id = 1', (err, row) => {
    if (err) console.error(err);
    console.log(JSON.stringify(row));
    db.close();
});
