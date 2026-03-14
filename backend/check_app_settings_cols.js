const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    try {
        const columns = await db.all("PRAGMA table_info(app_settings)");
        console.log('Columns of app_settings:', JSON.stringify(columns, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
