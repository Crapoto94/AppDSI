const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function debug() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    console.log("--- TABLE INFO rh.referentiel_agents ---");
    const columns = await db.all("PRAGMA table_info('rh.referentiel_agents')");
    console.log(JSON.stringify(columns, null, 2));

    console.log("--- SAMPLE Azure DATA ---");
    const sample = await db.all("SELECT MATRICULE, azure_id, azure_license FROM rh.referentiel_agents WHERE azure_id IS NOT NULL LIMIT 10");
    console.log(JSON.stringify(sample, null, 2));
    
    process.exit(0);
}

debug();
