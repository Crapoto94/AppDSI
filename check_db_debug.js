const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
    try {
        const db = await open({
            filename: path.join(__dirname, 'backend', 'database.sqlite'),
            driver: sqlite3.Database
        });
        
        console.log('--- BUDGET LINES ---');
        const lines = await db.all('SELECT * FROM budget_lines LIMIT 5');
        console.log(JSON.stringify(lines, null, 2));
        
        console.log('--- COLUMN SETTINGS (lines) ---');
        const settings = await db.all('SELECT * FROM column_settings WHERE page = "lines"');
        console.log(JSON.stringify(settings, null, 2));

        console.log('--- INVOICES ---');
        const invoices = await db.all('SELECT * FROM invoices LIMIT 5');
        console.log(JSON.stringify(invoices, null, 2));
        
        console.log('--- COLUMN SETTINGS (invoices) ---');
        const invSettings = await db.all('SELECT * FROM column_settings WHERE page = "invoices"');
        console.log(JSON.stringify(invSettings, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
