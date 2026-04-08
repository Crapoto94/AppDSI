const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function fix() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    try {
        await db.run('ALTER TABLE tiles ADD COLUMN sort_order INTEGER DEFAULT 0');
        console.log('Column sort_order added successfully.');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('Column sort_order already exists.');
        } else {
            console.error('Error adding column:', e.message);
        }
    }
    await db.close();
}

fix();
