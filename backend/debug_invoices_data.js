const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const setupDb = require('./db');

async function main() {
    const dbPath = path.join(__dirname, 'database.sqlite');
    const gfPath = path.join(__dirname, 'oracle_gf.sqlite');
    
    // setupDb returns the db and creates temp views
    const db = await setupDb();

    try {
        const principalBudgetSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'budget_principal'");
        const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';
        
        console.log(`Searching for BUDGET_CODE: '${principalBudgetRef}'`);
        
        const r = await db.all("SELECT * FROM v_invoices WHERE TRIM(BUDGET_CODE) = ? OR BUDGET_CODE LIKE ?", [principalBudgetRef, `%${principalBudgetRef}%`]);
        console.log(`Matches found: ${r.length}`);
        
        if (r.length > 0) {
            console.log("Found matches:", r.length);
            console.log("Sample Match:", JSON.stringify(r.slice(0, 3), null, 2));
        }

        // Check if there are matches in gf.oracle_budget for this principalBudgetRef
        const budgetMatch = await db.get("SELECT * FROM gf.oracle_budget WHERE BUDGET_ROO_IMA_REF LIKE ?", [`%${principalBudgetRef}%`]);
        console.log("\nMatch in gf.oracle_budget for principalBudgetRef:", JSON.stringify(budgetMatch, null, 2));

        // Let's see some invoices BUDGET_CODEs and their count
        const counts = await db.all("SELECT BUDGET_CODE, COUNT(*) as cnt FROM v_invoices GROUP BY BUDGET_CODE ORDER BY cnt DESC LIMIT 10");
        console.log("\nTop BUDGET_CODEs in v_invoices:");
        for (const c of counts) {
            const b = await db.get("SELECT BUDGET_LIBELLE FROM gf.oracle_budget WHERE BUDGET_ROO_IMA_REF = ?", [c.BUDGET_CODE]);
            console.log(` - '${c.BUDGET_CODE}' : ${c.cnt} invoices (Libellé: ${b ? b.BUDGET_LIBELLE : 'N/A'})`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
