const setupDb = require('./db.js');

async function cleanMainDb() {
    const db = await setupDb();
    
    const mainTables = await db.all("SELECT name, type FROM main.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
    const glpiTables = await db.all("SELECT name FROM glpi.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
    const gfTables = await db.all("SELECT name FROM gf.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
    const rhTables = await db.all("SELECT name FROM rh.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
    
    const externalTables = new Set([
        ...glpiTables.map(t => t.name),
        ...gfTables.map(t => t.name),
        ...rhTables.map(t => t.name)
    ]);
    
    let droppedCount = 0;
    
    for (const table of mainTables) {
        if (externalTables.has(table.name)) {
            console.log(`Dropping ${table.type} ${table.name} from main DB...`);
            await db.exec(`DROP ${table.type.toUpperCase()} main."${table.name}"`);
            droppedCount++;
        }
    }

    try {
        await db.exec('DROP VIEW main.v_tickets');
        console.log('Dropped persistent view main.v_tickets');
        droppedCount++;
    } catch(e) {}
    try {
        await db.exec('DROP VIEW main.v_orders');
        console.log('Dropped persistent view main.v_orders');
        droppedCount++;
    } catch(e) {}
    
    console.log(`Cleanup complete. Dropped ${droppedCount} objects.`);
}

cleanMainDb().catch(console.error);
