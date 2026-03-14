const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT column_key, label, is_visible FROM column_settings WHERE page = 'orders'", (err, rows) => {
    rows.forEach(r => console.log(`${r.column_key} | ${r.label} | ${r.is_visible}`));
    db.close();
});
