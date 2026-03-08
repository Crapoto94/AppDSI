const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function test() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const orders = await db.all("SELECT DISTINCT Fournisseur FROM orders LIMIT 10");
    for (const o of orders) {
        const name = o.Fournisseur;
        const trimmed = name.trim();
        const lower = trimmed.toLowerCase();
        
        const match = await db.get("SELECT nom FROM tiers WHERE LOWER(TRIM(nom)) = ?", [lower]);
        console.log(`Order Fournisseur: '${name}' -> Trimmed Lower: '${lower}' -> Match in Tiers: ${match ? `'${match.nom}'` : 'NONE'}`);
    }

    await db.close();
}

test().catch(console.error);
