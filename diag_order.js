const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./backend/database.sqlite');

const orderId = '26D001685';

db.get('SELECT "N° Commande", Fournisseur FROM orders WHERE "N° Commande" = ?', [orderId], (err, order) => {
    if (err || !order) {
        console.log('Order not found');
        db.close();
        return;
    }
    const f = order.Fournisseur;
    console.log(`Order supplier string: "${f}"`);
    console.log(`Length: ${f.length}`);
    console.log(`Char codes: ${f.split('').map(c => c.charCodeAt(0)).join(',')}`);
    
    const supplierSearch = f.trim();
    db.all('SELECT id, nom FROM tiers', [], (err, tiers) => {
        console.log('\nAll tiers names in DB:');
        tiers.forEach(t => {
            if (t.nom.includes('ABRAXIO')) {
                console.log(`- MATCH: "${t.nom}" (ID: ${t.id}) Length: ${t.nom.length}, codes: ${t.nom.split('').map(c => c.charCodeAt(0)).join(',')}`);
            }
        });
        db.close();
    });
});
