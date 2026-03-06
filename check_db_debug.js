const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
    try {
        const db = await open({
            filename: path.join(__dirname, 'backend', 'database.sqlite'),
            driver: sqlite3.Database
        });
        
        console.log('--- OPERATIONS ---');
        const ops = await db.all('SELECT * FROM operations LIMIT 5');
        console.log(JSON.stringify(ops, null, 2));
        
        console.log('--- COLUMN SETTINGS (operations) ---');
        const settings = await db.all('SELECT * FROM column_settings WHERE page = "operations"');
        console.log(JSON.stringify(settings, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
