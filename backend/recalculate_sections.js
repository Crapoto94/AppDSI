const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function recalculate() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const orders = await db.all('SELECT id, "Article par nature" FROM orders');
    console.log(`Analyzing ${orders.length} orders...`);

    let updatedCount = 0;
    for (const order of orders) {
        const natureCode = order['Article par nature']?.toString();
        if (natureCode) {
            const firstDigit = parseInt(natureCode.charAt(0));
            if (!isNaN(firstDigit)) {
                const section = firstDigit > 4 ? 'Fonctionnement' : 'Investissement';
                await db.run('UPDATE orders SET "Section" = ?, section = ? WHERE id = ?', [section, section, order.id]);
                updatedCount++;
            }
        }
    }

    console.log(`Successfully updated ${updatedCount} orders.`);
    await db.close();
}

recalculate().catch(console.error);
