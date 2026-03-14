const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
    const dbPath = path.join(__dirname, 'database.sqlite');
    const gfPath = path.join(__dirname, 'oracle_gf.sqlite');
    
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    try {
        await db.exec(`ATTACH DATABASE '${gfPath}' AS gf`);
        
        const codes = await db.all("SELECT DISTINCT FACTURE_ROO_IMA_REF FROM gf.oracle_facture");
        console.log("DISTINCT CODES IN oracle_facture:");
        codes.forEach(c => console.log(` - '${c.FACTURE_ROO_IMA_REF}' (length: ${c.FACTURE_ROO_IMA_REF?.length})`));

        const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'budget_principal'");
        console.log("\nBUDGET_PRINCIPAL SETTING:");
        console.log(` - '${setting?.setting_value}' (length: ${setting?.setting_value?.length})`);

        const matchCount = await db.get("SELECT COUNT(*) as cnt FROM gf.oracle_facture WHERE TRIM(FACTURE_ROO_IMA_REF) = ?", [setting?.setting_value?.trim()]);
        console.log(`\nCOUNT OF MATCHES WITH TRIM: ${matchCount.cnt}`);

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
