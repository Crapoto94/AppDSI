const setupDb = require('./db');
async function checkSettings() {
    const db = await setupDb();
    const settings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
    console.log(JSON.stringify(settings, null, 2));
    process.exit(0);
}
checkSettings();
