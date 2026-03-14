const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const setupDb = require('./db');

async function main() {
    const db = await setupDb();

    try {
        const r = await db.all('SELECT "N° Facture fournisseur" as ref, COUNT(*) as cnt FROM v_invoices WHERE "Exercice" = "2026" GROUP BY (ref IS NULL OR ref = "")');
        console.log('Invoice counts for 2026 by presence of reference:');
        console.log(JSON.stringify(r, null, 2));

        const sample = await db.all('SELECT "N° Facture interne", "N° Facture fournisseur", "Libellé" FROM v_invoices WHERE "Exercice" = "2026" AND ("N° Facture fournisseur" IS NULL OR "N° Facture fournisseur" = "") LIMIT 5');
        console.log('\nSample 2026 invoices with EMPTY reference:');
        console.log(JSON.stringify(sample, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
