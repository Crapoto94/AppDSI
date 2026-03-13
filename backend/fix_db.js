const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    db.all("PRAGMA table_info(oracle_sync_config)", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        const hasConfigJson = rows.some(r => r.name === 'config_json');
        if (!hasConfigJson) {
            console.log("Adding config_json column to oracle_sync_config...");
            db.run("ALTER TABLE oracle_sync_config ADD COLUMN config_json TEXT", (err) => {
                if (err) console.error("Error adding column:", err.message);
                else console.log("Column added successfully.");
                db.close();
            });
        } else {
            console.log("Column config_json already exists.");
            db.close();
        }
    });
});
