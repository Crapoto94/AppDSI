const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function checkDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const firstOrder = await db.get('SELECT * FROM orders LIMIT 1');
    console.log('First Order:', JSON.stringify(firstOrder, null, 2));

    await db.close();
}

checkDb().catch(console.error);
