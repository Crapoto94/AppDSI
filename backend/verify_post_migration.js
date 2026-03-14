const setupDb = require('./db.js');

async function verifyViews() {
    console.log("Verifying views...");
    const db = await setupDb();
    
    try {
        const orderCount = await db.get("SELECT COUNT(*) as count FROM v_orders");
        console.log("v_orders count:", orderCount);
        
        const years = await db.all("SELECT DISTINCT substr(date, 1, 4) as year FROM v_orders");
        console.log("Years in v_orders:", years);
        
        const invoiceCount = await db.get("SELECT COUNT(*) as count FROM gf.invoices");
        console.log("gf.invoices count:", invoiceCount);

        const sampleInvoices = await db.all("SELECT * FROM gf.invoices LIMIT 1");
        console.log("Sample invoice from gf:", sampleInvoices);

    } catch (e) {
        console.error("View verification failed:", e.message);
    } finally {
        db.close();
    }
}

verifyViews().catch(console.error);
