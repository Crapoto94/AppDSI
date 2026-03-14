const setupDb = require('./db.js');
const fs = require('fs');

async function vacuumDb() {
    const db = await setupDb();
    
    const statsBefore = fs.statSync('./database.sqlite');
    console.log(`Size before VACUUM: ${(statsBefore.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log("Running VACUUM command...");
    await db.exec('VACUUM main');
    
    const statsAfter = fs.statSync('./database.sqlite');
    console.log(`Size after VACUUM: ${(statsAfter.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`Reclaimed: ${((statsBefore.size - statsAfter.size) / 1024 / 1024).toFixed(2)} MB`);
}

vacuumDb().catch(console.error);
