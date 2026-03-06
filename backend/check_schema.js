const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function checkDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const columns = await db.all('PRAGMA table_info(orders)');
    console.log('Orders Columns:', JSON.stringify(columns, null, 2));

    await db.close();
}

checkDb().catch(console.error);
