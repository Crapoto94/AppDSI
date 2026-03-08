const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.get('SELECT COUNT(*) as count FROM orders WHERE Fournisseur IS NULL OR TRIM(Fournisseur) = ""', (err, row) => {
        console.log('Orders with empty Fournisseur:', row.count);
    });
    db.get('SELECT COUNT(*) as count FROM invoices WHERE Fournisseur IS NULL OR TRIM(Fournisseur) = ""', (err, row) => {
        console.log('Invoices with empty Fournisseur:', row.count);
    });
    // Let's also check those whose Fournisseur is not in tiers table
    db.get('SELECT COUNT(*) as count FROM orders WHERE LOWER(TRIM(Fournisseur)) NOT IN (SELECT LOWER(TRIM(nom)) FROM tiers)', (err, row) => {
        console.log('Orders without tier entry:', row.count);
    });
    db.get('SELECT COUNT(*) as count FROM orders WHERE TRIM(UPPER(Fournisseur)) IN (SELECT DISTINCT TRIM(UPPER(nom)) FROM tiers WHERE siret IS NULL OR TRIM(siret) = "")', (err, row) => {
        console.log('Orders whose supplier has no SIRET (TRIMMED):', row.count);
    });
    db.get('SELECT COUNT(*) as count FROM tiers WHERE nom IS NULL OR TRIM(nom) = ""', (err, row) => {
        console.log('Tiers without name:', row.count);
        db.close();
    });
});
