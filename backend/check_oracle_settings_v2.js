const setupDb = require('./db');
async function checkOracleSettings() {
    const db = await setupDb();
    const settings = await db.get('SELECT * FROM oracle_settings WHERE id = 1');
    console.log(JSON.stringify(settings, null, 2));
    process.exit(0);
}
checkOracleSettings();
