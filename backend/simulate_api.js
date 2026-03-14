const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const setupDb = require('./db');

async function main() {
    const db = await setupDb();

    try {
        const fiscalYear = '2026';
        const budgetScope = 'Ville';
        
        let query = 'SELECT * FROM v_invoices';
        const params = [];
        const where = [];

        const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
        const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';
        
        if (budgetScope === 'Ville' && fiscalYear) {
            where.push('TRIM(BUDGET_CODE) = ?');
            params.push(principalBudgetRef);
            
            if (fiscalYear) {
                where.push('("Exercice" = ? OR substr("Arrivée", 1, 4) = ?)');
                params.push(String(fiscalYear), String(fiscalYear));
            }
        }

        if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

        console.log(`Executing Query: ${query}`);
        console.log(`Params: ${JSON.stringify(params)}`);

        const r = await db.all(query, params);
        console.log(`\nResults returned by API logic: ${r.length}`);
        
        if (r.length > 0) {
            console.log("Results:", JSON.stringify(r, null, 2));
        }

        // Let's try WITHOUT the budget filter but with the year filter
        const r2 = await db.all('SELECT * FROM v_invoices WHERE ("Exercice" = ? OR substr("Arrivée", 1, 4) = ?)', [fiscalYear, fiscalYear]);
        console.log(`\nResults WITHOUT budget filter (year only): ${r2.length}`);
        if(r2.length > 0) {
            console.log("Distinct BUDGET_CODEs for 2026:", [...new Set(r2.map(x=>x.BUDGET_CODE))]);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await db.close();
    }
}

main();
