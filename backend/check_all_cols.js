const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const dbPath = path.join(__dirname, 'database.sqlite');
    const gfPath = path.join(__dirname, 'oracle_gf.sqlite');
    
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    try {
        await db.exec(`ATTACH DATABASE '${gfPath}' AS gf`);
        const columns = await db.all("PRAGMA gf.table_info(oracle_facture)");
        console.log("COLUMNS COUNT:", columns.length);
        columns.forEach((c, i) => {
            console.log(`${i+1}. ${c.name} (${c.type})`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
