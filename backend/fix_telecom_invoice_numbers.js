const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Début de la mise à jour des numéros de facture télécom...');
    
    // Rechercher les factures finissant par 'N'
    db.all("SELECT id, invoice_number FROM telecom_invoices WHERE invoice_number LIKE '%N'", (err, rows) => {
        if (err) {
            console.error('Erreur lors de la recherche:', err.message);
            return;
        }

        console.log(`${rows.length} factures trouvées avec un 'N' final.`);

        let updated = 0;
        if (rows.length === 0) {
            console.log('Aucune facture à mettre à jour.');
            db.close();
            return;
        }

        rows.forEach((row) => {
            const newNumber = row.invoice_number.slice(0, -1);
            db.run("UPDATE telecom_invoices SET invoice_number = ? WHERE id = ?", [newNumber, row.id], function(err) {
                if (err) {
                    console.error(`Erreur lors de la mise à jour de la facture ${row.id}:`, err.message);
                } else {
                    updated++;
                    console.log(`Facture ${row.id} mise à jour: ${row.invoice_number} -> ${newNumber}`);
                    if (updated === rows.length) {
                        console.log('Mise à jour terminée avec succès.');
                        db.close();
                    }
                }
            });
        });
    });
});
