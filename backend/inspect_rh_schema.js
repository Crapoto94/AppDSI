const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function check() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });
    
    await db.exec(`ATTACH DATABASE './oracle_rh.sqlite' AS rh`);
    
    console.log("Columns in rh.referentiel_agents:");
    const cols = await db.all("PRAGMA table_info(referentiel_agents)");
    console.log(JSON.stringify(cols, null, 2));
    
    console.log("\nDistinct values for possible position columns:");
    const possibleCols = cols.map(c => c.name).filter(n => n.includes('POSTE') || n.includes('POSITION'));
    for (const col of possibleCols) {
        const values = await db.all(`SELECT DISTINCT "${col}" FROM rh.referentiel_agents LIMIT 10`);
        console.log(`${col}:`, values.map(v => v[col]));
    }
    
    await db.close();
}

check().catch(console.error);
