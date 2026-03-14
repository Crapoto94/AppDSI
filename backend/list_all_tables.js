const sqlite3 = require('sqlite3').verbose();

function listTables(dbPath, label) {
    const db = new sqlite3.Database(dbPath);
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) console.error(`Error listing tables for ${label}:`, err);
        else console.log(`Tables in ${label} (${dbPath}):`, rows.map(r => r.name));
        db.close();
    });
}

listTables('database.sqlite', 'MAIN');
listTables('oracle_gf.sqlite', 'GF');
listTables('oracle_rh.sqlite', 'RH');
listTables('glpi.sqlite', 'GLPI');
