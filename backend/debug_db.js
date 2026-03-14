const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

(async () => {
    try {
        const db = await open({ filename: 'database.sqlite', driver: sqlite3.Database });
        
        console.log("--- TABLE INFO ---");
        const info = await db.all("PRAGMA table_info(frizbi_settings)");
        console.log(JSON.stringify(info, null, 2));
        
        console.log("\n--- ROWS ---");
        const rows = await db.all("SELECT * FROM frizbi_settings");
        console.log(JSON.stringify(rows, null, 2));
        
        await db.close();
    } catch (err) {
        console.error("DB Error:", err);
    }
})();
