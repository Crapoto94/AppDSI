const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function checkDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const ordersCount = await db.get('SELECT COUNT(*) as count FROM orders');
    console.log('Orders Count:', ordersCount.count);

    const visibleCols = await db.all("SELECT * FROM column_settings WHERE page = 'orders' AND is_visible = 1");
    console.log('Visible Columns for orders:', visibleCols.length);
    visibleCols.forEach(c => console.log(`- ${c.column_key}: ${c.label}`));

    const allCols = await db.all("SELECT * FROM column_settings WHERE page = 'orders'");
    console.log('Total Columns for orders:', allCols.length);

    await db.close();
}

checkDb().catch(console.error);
