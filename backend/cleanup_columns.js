const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.serialize(() => {
    // 1. Remove entries from column_settings that don't match actual table columns
    db.all("PRAGMA table_info(budget_lines)", (err, cols) => {
        const validCols = cols.map(c => c.name.toLowerCase());
        
        db.all("SELECT column_key FROM column_settings WHERE page='lines'", (err, settings) => {
            settings.forEach(s => {
                if (!validCols.includes(s.column_key.toLowerCase())) {
                    console.log(`Removing invalid column setting: ${s.column_key}`);
                    db.run("DELETE FROM column_settings WHERE page='lines' AND column_key=?", [s.column_key]);
                }
            });
        });
    });

    // 2. Also check for 'labe' or other orphans
    db.run("DELETE FROM column_settings WHERE page='lines' AND (column_key='labe' OR column_key='label')");
    
    console.log('Cleanup complete.');
});

setTimeout(() => db.close(), 1000);
