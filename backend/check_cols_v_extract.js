const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('oracle_rh.sqlite');
db.all("PRAGMA table_info('V_EXTRACT_DSI')", (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
