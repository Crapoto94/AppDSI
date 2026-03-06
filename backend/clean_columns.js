const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function cleanEmptyColumns() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const columns = await db.all('PRAGMA table_info(orders)');
    const columnsToKeep = [];
    const columnsToDelete = [];

    for (const col of columns) {
        if (col.name === 'id') continue;
        
        // Check if column has any non-empty data
        const result = await db.get(`SELECT COUNT(*) as count FROM orders WHERE "${col.name}" IS NOT NULL AND "${col.name}" != ''`);
        
        if (result.count === 0) {
            columnsToDelete.push(col.name);
        } else {
            columnsToKeep.push(col.name);
        }
    }

    console.log('Empty columns to remove from settings:', columnsToDelete);
    console.log('Columns with data:', columnsToKeep);

    if (columnsToDelete.length > 0) {
        const placeholders = columnsToDelete.map(() => '?').join(',');
        await db.run(`DELETE FROM column_settings WHERE page = 'orders' AND column_key IN (${placeholders})`, columnsToDelete);
        console.log('Deleted empty columns from column_settings.');
    }

    await db.close();
}

cleanEmptyColumns().catch(console.error);
