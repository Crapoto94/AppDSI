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
        
        const c1 = await db.all("PRAGMA gf.table_info(oracle_facture)");
        console.log("ORACLE_FACTURE:");
        c1.forEach(c => console.log(` - ${c.name}`));

        const c2 = await db.all("PRAGMA gf.table_info(invoices)");
        console.log("\nINVOICES:");
        c2.forEach(c => console.log(` - ${c.name}`));

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
