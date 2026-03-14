const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

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
        const names = columns.map(c => c.name).join('\n');
        fs.writeFileSync(path.join(__dirname, 'facture_cols.txt'), names);
        console.log("Done. Saved to facture_cols.txt");
    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
