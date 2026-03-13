const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function cleanup() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('Nettoyage des données corrompues (nulls)...');

    const res1 = await db.run('DELETE FROM budget_lines WHERE label IS NULL OR allocated_amount IS NULL');
    console.log(`Lignes budgétaires supprimées: ${res1.changes}`);

    const res2 = await db.run('DELETE FROM invoices WHERE invoice_number IS NULL OR amount_ht IS NULL');
    console.log(`Factures supprimées: ${res2.changes}`);

    console.log('Nettoyage terminé. Veuillez ré-importer vos fichiers Excel.');
    await db.close();
}

cleanup().catch(console.error);
