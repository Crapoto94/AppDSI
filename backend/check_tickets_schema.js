const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.all("PRAGMA table_info(tickets)", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('--- SCHEMA TABLE TICKETS ---');
    rows.forEach(row => {
        console.log(`${row.name} (${row.type})`);
    });
    db.close();
});
