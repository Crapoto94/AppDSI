const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) return console.error(err);
    console.log('Tables trouvées:', tables.map(t => t.name).join(', '));
    
    // Vérifier si des factures ont des doublons (lignes)
    db.all('SELECT "N° Facture fournisseur", COUNT(*) as count FROM invoices GROUP BY "N° Facture fournisseur" HAVING count > 0 LIMIT 10', (err, rows) => {
        if (err) console.error(err);
        else console.log('Exemple de groupage factures:', rows);
        db.close();
    });
});
