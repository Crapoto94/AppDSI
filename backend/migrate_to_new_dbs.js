const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const mainDbPath = path.join(__dirname, 'database.sqlite');
const glpiDbPath = path.join(__dirname, 'glpi.sqlite');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const rhDbPath = path.join(__dirname, 'oracle_rh.sqlite');

const db = new sqlite3.Database(mainDbPath);

const tablesToMove = {
    GLPI: ['tickets', 'ticket_statuses', 'v_tickets'],
    GF: ['oracle_budget', 'oracle_commande', 'oracle_facture', 'oracle_servicefi', 'oracle_tiers', 'oracle_statut_tiers', 'oracle_links', 'v_orders'],
    RH: ['oracle_v_extract_dsi']
};

function runSql(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getAll(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function migrate() {
    try {
        console.log('Starting migration...');

        // Attach new databases
        await runSql(db, `ATTACH DATABASE '${glpiDbPath}' AS glpi`);
        await runSql(db, `ATTACH DATABASE '${gfDbPath}' AS gf`);
        await runSql(db, `ATTACH DATABASE '${rhDbPath}' AS rh`);

        // Get all tables/views from main DB
        const schema = await getAll(db, "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");

        // Sort: Tables first, then Views
        schema.sort((a, b) => {
            if (a.type === 'table' && b.type === 'view') return -1;
            if (a.type === 'view' && b.type === 'table') return 1;
            return 0;
        });

        for (const item of schema) {
            let targetDb = null;
            if (tablesToMove.GLPI.includes(item.name)) targetDb = 'glpi';
            else if (tablesToMove.GF.includes(item.name)) targetDb = 'gf';
            else if (tablesToMove.RH.includes(item.name)) targetDb = 'rh';

            if (targetDb) {
                console.log(`Moving ${item.type} ${item.name} to ${targetDb}...`);
                
                // Create table/view in target DB
                // We need to modify the SQL to create in the attached DB context? 
                // No, we can just run the CREATE statement on the attached DB directly using the alias prefix
                // BUT the `sql` string from sqlite_master is "CREATE TABLE name ...". 
                // We can't easily parse and inject "glpi.". 
                // Better approach: create connection to target DB, run CREATE statement there.
                
                // However, we want to copy data too.
                // Best approach:
                // 1. Create table in target DB using the original SQL (it will create in the file).
                // 2. Copy data using INSERT INTO targetDb.table SELECT * FROM mainDb.table
                
                // Wait, if I use a separate connection for CREATE, I need to be careful with foreign keys if any.
                // The `sql` string contains "CREATE TABLE tickets ...". If I run this on `glpi` connection, it works.
                
                const targetDbConn = new sqlite3.Database(targetDb === 'glpi' ? glpiDbPath : (targetDb === 'gf' ? gfDbPath : rhDbPath));
                
                await runSql(targetDbConn, item.sql);
                
                if (item.type === 'table') {
                    // Copy data
                    console.log(`Copying data for ${item.name}...`);
                    // We need to do this via the ATTACHed connection on the main DB because that's the only way to select from one and insert into another in one query.
                    await runSql(db, `INSERT INTO ${targetDb}.${item.name} SELECT * FROM main.${item.name}`);
                }
                
                targetDbConn.close();
            }
        }

        console.log('Migration completed successfully.');
        
        // Detach
        await runSql(db, "DETACH DATABASE glpi");
        await runSql(db, "DETACH DATABASE gf");
        await runSql(db, "DETACH DATABASE rh");

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        db.close();
    }
}

migrate();
