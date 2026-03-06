const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function syncM57() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('Fetching unique articles from orders...');
    const orders = await db.all('SELECT DISTINCT "Article par nature" as code, "Libellé" as label, "Section" as section FROM orders WHERE "Article par nature" IS NOT NULL');
    
    let added = 0;
    for (const order of orders) {
        const firstDigit = parseInt(order.code.charAt(0));
        const section = isNaN(firstDigit) ? (order.section || 'F') : (firstDigit > 4 ? 'F' : 'I');
        
        try {
            const exists = await db.get('SELECT id FROM m57_plan WHERE code = ?', [order.code]);
            if (!exists) {
                await db.run('INSERT INTO m57_plan (code, label, section) VALUES (?, ?, ?)', [order.code, order.label || 'Sans libellé', section]);
                added++;
            }
        } catch (e) {
            console.error(`Error inserting ${order.code}:`, e.message);
        }
    }

    console.log(`Sync complete. Added ${added} new articles to M57 plan.`);
    await db.close();
}

syncM57().catch(console.error);
