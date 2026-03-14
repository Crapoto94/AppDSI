const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const mainDbPath = path.join(__dirname, 'database.sqlite');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const rhDbPath = path.join(__dirname, 'oracle_rh.sqlite');
const glpiDbPath = path.join(__dirname, 'glpi.sqlite');

const db = new sqlite3.Database(mainDbPath);

async function runMigrate() {
    console.log("Starting migration...");

    try {
        // Attach DBs
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run(`ATTACH DATABASE '${gfDbPath}' AS gf`, (err) => err ? reject(err) : null);
                db.run(`ATTACH DATABASE '${rhDbPath}' AS rh`, (err) => err ? reject(err) : null);
                db.run(`ATTACH DATABASE '${glpiDbPath}' AS glpi`, (err) => err ? reject(err) : null);
                resolve();
            });
        });

        const migrationConfigs = [
            { table: 'oracle_commande', target: 'gf' },
            { table: 'oracle_facture', target: 'gf' },
            { table: 'oracle_servicefi', target: 'gf' },
            { table: 'oracle_tiers', target: 'gf' },
            { table: 'oracle_links', target: 'gf' },
            { table: 'invoices', target: 'gf' },
            { table: 'oracle_v_extract_dsi', target: 'rh' }
            // Add tickets if needed, but checking existing tables first
        ];

        for (const cfg of migrationConfigs) {
            console.log(`Migrating ${cfg.table} to ${cfg.target}...`);
            
            // 1. Get schema
            const tableInfo = await new Promise((resolve, reject) => {
                db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${cfg.table}'`, (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.sql : null);
                });
            });

            if (!tableInfo) {
                console.log(`Table ${cfg.table} not found in main DB, skipping.`);
                continue;
            }

            // 2. Create in target (if not exists)
            const createSql = tableInfo.replace(`CREATE TABLE ${cfg.table}`, `CREATE TABLE IF NOT EXISTS ${cfg.target}.${cfg.table}`);
            await new Promise((resolve, reject) => db.run(createSql, (err) => err ? reject(err) : resolve()));

            // 3. Move data
            await new Promise((resolve, reject) => {
                db.run(`INSERT OR IGNORE INTO ${cfg.target}.${cfg.table} SELECT * FROM main.${cfg.table}`, (err) => err ? reject(err) : resolve());
            });

            // 4. Drop from main (Wait, let's keep it for safety during migration, but user wants it gone)
            // await new Promise((resolve, reject) => db.run(`DROP TABLE main.${cfg.table}`, (err) => err ? reject(err) : resolve()));
            console.log(`Migrated ${cfg.table} successfully.`);
        }

        console.log("Migration complete.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        db.close();
    }
}

runMigrate();
