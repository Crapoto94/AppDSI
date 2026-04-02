const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.serialize(() => {
    const tables = [
        'magapp_categories',
        'magapp_apps',
        'magapp_favorites',
        'magapp_clicks',
        'magapp_subscriptions'
    ];

    tables.forEach(table => {
        const newName = table.replace('magapp_', 'magapp.old_');
        // Check if old table already exists, if so drop it to avoid errors
        db.run(`DROP TABLE IF EXISTS "${newName}"`);
        // Rename table
        db.run(`ALTER TABLE "${table}" RENAME TO "${newName}"`, (err) => {
            if (err) {
                if (err.message.includes('no such table')) {
                    console.log(`Table ${table} not found. Skipped.`);
                } else {
                    console.error(`Error renaming ${table}: ${err.message}`);
                }
            } else {
                console.log(`Renamed ${table} to ${newName}`);
            }
        });
    });
});

db.close((err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Database renamed operations queued.');
    }
});
