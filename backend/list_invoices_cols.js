const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all("PRAGMA table_info(invoices)", (err, cols) => {
    console.log('Invoices columns:', cols.map(c => c.name));
    db.close();
});
