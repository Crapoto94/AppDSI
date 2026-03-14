const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const setupDb = require('./db');

async function main() {
    const db = await setupDb();

    try {
        const r = await db.all('SELECT "Arrivée", "Exercice", COUNT(*) as cnt FROM v_invoices GROUP BY "Exercice"');
        console.log('Exercice counts in v_invoices:');
        console.log(JSON.stringify(r, null, 2));

        const sample = await db.all('SELECT FACTURE_DATENTREE, "Arrivée", "Exercice" FROM v_invoices WHERE FACTURE_DATENTREE IS NOT NULL LIMIT 5');
        console.log('\nSample dates (FACTURE_DATENTREE -> Arrivée, Exercice):');
        console.log(JSON.stringify(sample, null, 2));

        const emptyDates = await db.get('SELECT COUNT(*) as cnt FROM v_invoices WHERE "Arrivée" IS NULL');
        console.log(`\nInvoices with Arrivée IS NULL: ${emptyDates.cnt}`);

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
