const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function debug() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const tierCount = await db.get("SELECT COUNT(*) as count FROM tiers");
    console.log("Total Tiers in DB:", tierCount.count);

    const orderCount = await db.get("SELECT COUNT(*) as count FROM orders");
    console.log("Total Orders in DB:", orderCount.count);

    const invoiceCount = await db.get("SELECT COUNT(*) as count FROM invoices");
    console.log("Total Invoices in DB:", invoiceCount.count);

    console.log("\nSample Tier Names (first 5):");
    const sampleTiers = await db.all("SELECT nom FROM tiers LIMIT 5");
    sampleTiers.forEach(t => console.log(`'${t.nom}'`));

    console.log("\nSample Order Fournisseur (first 5):");
    const sampleOrders = await db.all("SELECT DISTINCT Fournisseur FROM orders LIMIT 5");
    sampleOrders.forEach(o => console.log(`'${o.Fournisseur}'`));

    await db.close();
}

debug().catch(console.error);
