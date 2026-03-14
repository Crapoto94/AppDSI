const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../oracle_rh.sqlite');
db.all("PRAGMA table_info('V_EXTRACT_DSI')", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows.slice(0, 10)); // just first 10 columns
    db.close();
});
