const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='contacts'", (err, rows) => {
    console.log('Contacts table SQL:', rows[0].sql);
    db.close();
});
