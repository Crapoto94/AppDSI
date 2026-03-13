const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.run('UPDATE ad_settings SET is_enabled = 0 WHERE id = 1', (err) => {
    if (err) console.error(err);
    else console.log('AD disabled');
    db.close();
});
