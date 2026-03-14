const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    try {
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('Main tables:', tables.map(t => t.name).join(', '));

        try {
            await db.exec("ATTACH DATABASE 'C:/dev/HubDSI/backend/oracle_rh.sqlite' AS rh");
            const rhTables = await db.all("SELECT name FROM rh.sqlite_master WHERE type='table'");
            console.log('RH tables:', rhTables.map(t => t.name).join(', '));
            
            if (rhTables.length > 0) {
                const columns = await db.all(`PRAGMA rh.table_info(${rhTables[0].name})`);
                console.log(`Columns of ${rhTables[0].name}:`, columns.map(c => c.name).join(', '));
                
                const sample = await db.all(`SELECT * FROM rh.${rhTables[0].name} LIMIT 3`);
                console.log(`Sample from ${rhTables[0].name}:`, JSON.stringify(sample, null, 2));
            }
        } catch (e) {
            console.log('RH attach failed:', e.message);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
