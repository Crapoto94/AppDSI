const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function debug() {
    try {
        const db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        const rhDbPath = path.join(__dirname, 'oracle_rh.sqlite');
        await db.exec(`ATTACH DATABASE '${rhDbPath}' AS rh`);

        console.log("--- SAMPLE Azure DATA ---");
        const sample = await db.all("SELECT MATRICULE, azure_id, azure_license FROM rh.referentiel_agents WHERE azure_id IS NOT NULL LIMIT 20");
        console.log(JSON.stringify(sample, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error("Debug failed:", err);
        process.exit(1);
    }
}

debug();
