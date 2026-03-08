const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const tierId = 49941;

const runTest = () => {
    db.get('SELECT nom FROM tiers WHERE id = ?', [tierId], (err, tier) => {
        if (!tier) {
            console.log('Tier non trouvé');
            db.close();
            return;
        }
        console.log('Tier trouvé:', JSON.stringify(tier.nom));
        
        const nom = tier.nom;
        
        db.all('SELECT "Fournisseur" FROM orders WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?))', [nom], (err, orders) => {
            console.log('Commandes trouvées (exact match):', orders.length);
            
            db.all('SELECT "Fournisseur" FROM orders WHERE "Fournisseur" LIKE ?', [`%${nom.trim()}%`], (err, ordersLike) => {
                console.log('Commandes trouvées (LIKE match):', ordersLike.length);
                if (ordersLike.length > 0) {
                    console.log('Exemple Fournisseur dans orders:', JSON.stringify(ordersLike[0].Fournisseur));
                }
                db.close();
            });
        });
    });
};

runTest();
