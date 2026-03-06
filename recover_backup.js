const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const srcDbPath = path.join(__dirname, 'database_svg.sqlite');
const destDbPath = path.join(__dirname, 'backend', 'database.sqlite');

const srcDb = new sqlite3.Database(srcDbPath);
const destDb = new sqlite3.Database(destDbPath);

const tablesToRecover = ['users', 'tiles', 'tile_links'];

async function recoverData() {
    for (const table of tablesToRecover) {
        console.log(`Recovering table: ${table}...`);
        
        // Clear destination table
        await new Promise((resolve, reject) => {
            destDb.run(`DELETE FROM ${table}`, (err) => {
                if (err) {
                    console.log(`Warning: Could not clear ${table} (it might not exist yet)`);
                }
                resolve();
            });
        });

        // Read from source
        const rows = await new Promise((resolve, reject) => {
            srcDb.all(`SELECT * FROM ${table}`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (rows.length === 0) {
            console.log(`No data found in source table ${table}`);
            continue;
        }

        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(',');
        const sql = `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;

        for (const row of rows) {
            const values = cols.map(c => row[c]);
            await new Promise((resolve, reject) => {
                destDb.run(sql, values, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        console.log(`Successfully recovered ${rows.length} rows for ${table}`);
    }
    
    srcDb.close();
    destDb.close();
    console.log('Recovery complete.');
}

recoverData().catch(err => {
    console.error('Recovery failed:', err);
    process.exit(1);
});
