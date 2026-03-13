const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function checkDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const orders = await db.all('SELECT "Section", section FROM orders LIMIT 10');
    console.log('Orders Sections:', JSON.stringify(orders, null, 2));

    await db.close();
}

checkDb().catch(console.error);
