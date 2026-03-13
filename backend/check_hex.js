const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("--- Telecom Invoices Sample ---");
    db.all('SELECT invoice_number, QUOTE(invoice_number) as quoted FROM telecom_invoices LIMIT 5', (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });

    console.log("\n--- General Invoices Sample ---");
    db.all('SELECT "N° Facture fournisseur" as num, QUOTE("N° Facture fournisseur") as quoted FROM invoices WHERE "N° Facture fournisseur" LIKE "9A%" LIMIT 5', (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });

    console.log("\n--- Testing Join Logic ---");
    db.all(`
        SELECT 
            i.invoice_number,
            v."N° Facture fournisseur" as v_num,
            v.Etat
        FROM telecom_invoices i
        LEFT JOIN invoices v ON TRIM(i.invoice_number) = TRIM(RTRIM(v."N° Facture fournisseur", 'N'))
        LIMIT 10
    `, (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
        db.close();
    });
});
