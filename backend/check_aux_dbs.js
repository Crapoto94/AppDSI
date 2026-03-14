const sqlite3 = require('sqlite3').verbose();

const databases = ['oracle_gf.sqlite', 'oracle_rh.sqlite', 'glpi.sqlite'];

databases.forEach(dbPath => {
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error(`Error opening ${dbPath}:`, err.message);
            return;
        }
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
            if (err) {
                console.error(`Error listing tables in ${dbPath}:`, err.message);
            } else {
                console.log(`${dbPath} tables:`, rows.map(r => r.name));
            }
            db.close();
        });
    });
});
