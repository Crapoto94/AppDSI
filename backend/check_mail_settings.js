const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function check() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const settings = await db.get('SELECT * FROM mail_settings WHERE id = 1');
    console.log('Mail Settings:', JSON.stringify(settings, null, 2));
    await db.close();
}

check().catch(err => console.error(err));
