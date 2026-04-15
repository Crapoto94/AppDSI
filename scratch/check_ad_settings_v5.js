const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'backend', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('--- Checking AD Settings ---');
db.all('SELECT * FROM ad_settings', [], (err, rows) => {
    if (err) {
        console.error('Error querying ad_settings:', err.message);
        process.exit(1);
    }
    rows.forEach(row => {
        const maskedRow = { ...row };
        if (maskedRow.bind_password) maskedRow.bind_password = '********';
        console.log(JSON.stringify(maskedRow, null, 2));
    });
    db.close();
});
