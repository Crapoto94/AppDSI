const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const dbPath = path.join(__dirname, 'database.sqlite');
    const gfPath = path.join(__dirname, 'oracle_gf.sqlite');
    const rhPath = path.join(__dirname, 'oracle_rh.sqlite');
    
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    try {
        await db.exec(`ATTACH DATABASE '${gfPath}' AS gf`);
        await db.exec(`ATTACH DATABASE '${rhPath}' AS rh`);
        
        const mainTabs = (await db.all("SELECT name FROM sqlite_master WHERE type='table'")).map(t => t.name);
        const gfTabs = (await db.all("SELECT name FROM gf.sqlite_master WHERE type='table'")).map(t => t.name);
        const rhTabs = (await db.all("SELECT name FROM rh.sqlite_master WHERE type='table'")).map(t => t.name);

        console.log("Tables in Main:", mainTabs);
        console.log("Tables in GF:", gfTabs);
        console.log("Tables in RH:", rhTabs);

        const tablesToRemove = mainTabs.filter(t => t.startsWith('oracle_') && (gfTabs.includes(t) || rhTabs.includes(t)));

        if (tablesToRemove.length === 0) {
            console.log("No duplicate oracle_ tables found in main database.");
        } else {
            console.log("\nRemoving the following tables from main database:");
            for (const table of tablesToRemove) {
                console.log(` - ${table}`);
                await db.run(`DROP TABLE "${table}"`);
            }
            console.log("\nCleanup complete.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
