const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function listCols() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const columns = await db.all('PRAGMA table_info(budget_lines)');
    console.log(JSON.stringify(columns.map(c => c.name), null, 2));

    await db.close();
}

listCols().catch(console.error);
