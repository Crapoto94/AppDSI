const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function addSectionColumn() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });
    
    try {
        await db.run("ALTER TABLE orders ADD COLUMN section TEXT");
        console.log("Added column section to orders table");
    } catch (e) {
        console.log("Section column might already exist");
    }
}

addSectionColumn();
