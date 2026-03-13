const setupDb = require('./db');

async function updateToLocal() {
    const db = await setupDb();
    const rows = await db.all('SELECT id, icon FROM magapp_apps');
    
    for (const row of rows) {
        if (row.icon) {
            const fileName = row.icon.split('/').pop();
            const newPath = `/img/${fileName}`;
            if (newPath !== row.icon) {
                await db.run('UPDATE magapp_apps SET icon = ? WHERE id = ?', [newPath, row.id]);
                console.log(`Updated ${row.id}: ${newPath}`);
            }
        }
    }
    console.log('Base de données mise à jour.');
    process.exit(0);
}

updateToLocal();
