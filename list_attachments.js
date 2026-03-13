const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./backend/database.sqlite');
db.all('SELECT * FROM attachments WHERE target_id = ?', ['26D001685'], (err, rows) => {
    console.log(rows);
    db.close();
});
