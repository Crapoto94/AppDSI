const setupDb = require('./db');

async function cleanPaths() {
    const db = await setupDb();
    const rows = await db.all('SELECT id, icon FROM magapp_apps');
    
    for (const row of rows) {
        if (row.icon) {
            let newPath = row.icon;
            if (newPath.startsWith('./img/')) {
                newPath = '/magapp/img/' + newPath.substring(6);
            } else if (newPath.startsWith('img/')) {
                newPath = '/magapp/img/' + newPath.substring(4);
            } else if (newPath.startsWith('https://magapp.ivry.local/img/')) {
                newPath = '/magapp/img/' + newPath.substring(30);
            }
            
            if (newPath !== row.icon) {
                await db.run('UPDATE magapp_apps SET icon = ? WHERE id = ?', [newPath, row.id]);
                console.log(`Updated ${row.id}: ${row.icon} -> ${newPath}`);
            }
        }
    }
    console.log('Fini !');
    process.exit(0);
}

cleanPaths();
