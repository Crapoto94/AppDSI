const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    try {
        const settings = await db.all('SELECT * FROM admin_settings WHERE key LIKE "ad_%"');
        console.log('AD Settings:', JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
