const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function migrateRhTables() {
    console.log('--- Migration: Studio RH ---');
    try {
        const dbPath = path.join(__dirname, 'database.sqlite');
        const rhDbPath = path.join(__dirname, 'oracle_rh.sqlite');

        // 1. Open main database
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        console.log('Opened main database.');

        // 2. Attach RH database
        await db.exec(`ATTACH DATABASE '${rhDbPath}' AS rh`);
        console.log('Attached oracle_rh.sqlite as rh.');

        // 3. Create table in RH if not exists
        await db.exec(`
            CREATE TABLE IF NOT EXISTS rh.referentiel_agents (
                matricule TEXT PRIMARY KEY,
                nom TEXT,
                prenom TEXT,
                civilite TEXT,
                service TEXT,
                ad_username TEXT,
                last_sync_date DATETIME,
                date_plusvu DATETIME
            );
        `);
        console.log('Ensured rh.referentiel_agents exists.');

        // 4. Check if main db has it
        const hasTable = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='referentiel_agents'`);
        if (hasTable) {
            console.log('Found referentiel_agents in main DB. Migrating data...');
            
            // Insert data
            await db.exec(`
                INSERT OR IGNORE INTO rh.referentiel_agents (matricule, nom, prenom, civilite, service, ad_username, last_sync_date, date_plusvu)
                SELECT matricule, nom, prenom, civilite, service, ad_username, last_sync_date, date_plusvu
                FROM main.referentiel_agents
            `);
            console.log('Data copied successfully.');

            // Delete from main
            await db.exec('DROP TABLE main.referentiel_agents');
            console.log('Dropped referentiel_agents from main DB.');
        } else {
            console.log('referentiel_agents already removed from main DB or does not exist.');
        }

        // 5. Add Studio RH Tile if not exists
        const exitingTile = await db.get(`SELECT * FROM main.tiles WHERE url = '/rh'`);
        if (!exitingTile) {
            console.log('Adding Studio RH tile to main DB.');
            await db.exec(`
                INSERT INTO main.tiles (title, icon, description, url, status)
                VALUES ('Studio RH', 'Users', 'Référentiel consolidé des agents, AD, synchronisation Oracle.', '/rh', 'active')
            `);
        } else {
            console.log('Studio RH tile already exists.');
        }

        await db.close();
        console.log('Migration completed successfully.');

    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrateRhTables();
