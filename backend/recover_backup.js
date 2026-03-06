const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const srcDbPath = path.join(__dirname, '..', 'database_svg.sqlite');
const destDbPath = path.join(__dirname, 'database.sqlite');

const srcDb = new sqlite3.Database(srcDbPath);
const destDb = new sqlite3.Database(destDbPath);

const tablesToRecover = ['users', 'tiles', 'tile_links', 'column_settings'];

const columnMapping = {
    'users': {
        'last_action': 'last_activity'
    }
};

async function recoverData() {
    for (const table of tablesToRecover) {
        console.log(`Recovering table: ${table}...`);
        
        // Get destination columns
        const destColsInfo = await new Promise((resolve, reject) => {
            destDb.all(`PRAGMA table_info(${table})`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        const destColNames = destColsInfo.map(c => c.name);

        // Clear destination table
        await new Promise((resolve, reject) => {
            destDb.run(`DELETE FROM ${table}`, (err) => {
                if (err) {
                    console.log(`Warning: Could not clear ${table}`);
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

        for (const row of rows) {
            const mappedRow = {};
            const sourceCols = Object.keys(row);
            
            sourceCols.forEach(srcCol => {
                let targetCol = srcCol;
                if (columnMapping[table] && columnMapping[table][srcCol]) {
                    targetCol = columnMapping[table][srcCol];
                }
                
                if (destColNames.includes(targetCol)) {
                    mappedRow[targetCol] = row[srcCol];
                }
            });

            const keys = Object.keys(mappedRow);
            const placeholders = keys.map(() => '?').join(',');
            const values = Object.values(mappedRow);
            const sql = `INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders})`;

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
