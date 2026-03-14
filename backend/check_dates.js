const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function checkDates() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });
    
    await db.exec(`ATTACH DATABASE './oracle_rh.sqlite' AS rh`);
    
    console.log("Samples from rh.referentiel_agents (first 5):");
    const samples = await db.all("SELECT MATRICULE, NOM, PRENOM, DATE_DEPART, DATE_ARRIVEE, date_plusvu FROM rh.referentiel_agents LIMIT 5");
    console.log(JSON.stringify(samples, null, 2));

    const today = new Date().toISOString().substring(0, 10);
    console.log("\nToday (YYYY-MM-DD):", today);
    
    const countQuery = `SELECT count(*) as c FROM rh.referentiel_agents WHERE date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`;
    const res = await db.get(countQuery, [today]);
    console.log("Count with current logic:", res.c);
    
    await db.close();
}

checkDates().catch(console.error);
