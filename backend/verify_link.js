const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all(`
    SELECT 
        i.invoice_number as telecom_num,
        v."N° Facture fournisseur" as general_num,
        v.Etat as status
    FROM telecom_invoices i
    LEFT JOIN invoices v ON (
        i.invoice_number = v."N° Facture fournisseur"
        OR i.invoice_number = RTRIM(v."N° Facture fournisseur", 'N')
        OR i.invoice_number = REPLACE(v."N° Facture fournisseur", ' ', '')
    )
    LIMIT 50
`, (err, rows) => {
    if (err) console.error(err);
    else {
        const matched = rows.filter(r => r.general_num).length;
        console.log(`Total telecom invoices checked: ${rows.length}`);
        console.log(`Total matched with general invoices: ${matched}`);
        console.log("\nSample matches:");
        console.log(JSON.stringify(rows.slice(0, 10), null, 2));
    }
    db.close();
});
