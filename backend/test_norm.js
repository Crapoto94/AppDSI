const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function testMatch() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });
    
    await db.exec(`ATTACH DATABASE './oracle_rh.sqlite' AS rh`);
    
    const today = new Date().toISOString().substring(0, 10);
    const agents = await db.all(`
        SELECT MATRICULE, NOM, PRENOM, ad_username FROM rh.referentiel_agents 
        WHERE date_plusvu IS NULL 
        AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
        LIMIT 5
    `, [today]);

    console.log(`Testing with ${agents.length} agents`);
    if (agents.length > 0) {
        console.log("Keys in first agent:", Object.keys(agents[0]));
    }
    
    for (const agent of agents) {
        const nom = (agent.NOM || agent.nom || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
        const prenom = (agent.PRENOM || agent.prenom || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
        const fullNameNorm = nom + prenom;
        
        console.log(`Agent: ${agent.nom || agent.NOM} ${agent.prenom || agent.PRENOM} -> Norm: ${fullNameNorm}`);
    }
    
    await db.close();
}

testMatch().catch(console.error);
