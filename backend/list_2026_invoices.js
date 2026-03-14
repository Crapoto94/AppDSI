const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const setupDb = require('./db');

async function main() {
    const db = await setupDb();

    try {
        const fiscalYear = '2026';
        const r = await db.all('SELECT * FROM v_invoices WHERE ("Exercice" = ? OR substr("Arrivée", 1, 4) = ?)', [fiscalYear, fiscalYear]);
        console.log(`Total 2026 invoices in v_invoices: ${r.length}`);
        
        // Let's see the first 10
        console.log("First 10 invoices:");
        console.log(JSON.stringify(r.slice(0, 10), null, 2));

        // Let's see if any match the budget_principal
        const principalBudgetSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'budget_principal'");
        const ref = principalBudgetSetting.setting_value.trim();
        const matches = r.filter(x => x.BUDGET_CODE === ref);
        console.log(`\nMatches for principal budget (${ref}): ${matches.length}`);

        // What are the budget codes for the 2026 invoices?
        const codes = {};
        r.forEach(x => {
            codes[x.BUDGET_CODE] = (codes[x.BUDGET_CODE] || 0) + 1;
        });
        console.log("\nBudget codes in 2026 invoices:");
        console.log(JSON.stringify(codes, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
