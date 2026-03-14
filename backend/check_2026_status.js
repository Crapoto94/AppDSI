const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    try {
        await db.exec('ATTACH DATABASE \'C:/dev/HubDSI/backend/oracle_gf.sqlite\' AS gf');
        
        const r = await db.all('SELECT DISTINCT FACETAT_LIBELLE FROM gf.oracle_facture WHERE substr(FACTURE_DATENTREE, 1, 4) = "2026"');
        console.log('Unique states for 2026 invoices:');
        console.log(JSON.stringify(r.map(x => x.FACETAT_LIBELLE), null, 2));

        const sample = await db.all('SELECT FACTURE_FACTURE, FACETAT_LIBELLE, PAIESTAND_LIBELLE, FACTURE_DATENTREE FROM gf.oracle_facture WHERE substr(FACTURE_DATENTREE, 1, 4) = "2026" LIMIT 10');
        console.log('\nSample 2026 invoices:');
        console.log(JSON.stringify(sample, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
