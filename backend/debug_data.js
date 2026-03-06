const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function debugDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('--- BUDGET LINES ---');
    const lines = await db.all('SELECT * FROM budget_lines LIMIT 5');
    console.log(JSON.stringify(lines, null, 2));

    console.log('--- INVOICES ---');
    const invoices = await db.all('SELECT * FROM invoices LIMIT 5');
    console.log(JSON.stringify(invoices, null, 2));

    await db.close();
}

debugDb().catch(console.error);
