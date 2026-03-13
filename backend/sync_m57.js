const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const xlsx = require('xlsx');

async function syncM57() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const filePath = path.join(__dirname, '..', 'M57_Nomenclature_Complete.xlsx');
    
    try {
        const workbook = xlsx.readFile(filePath);
        
        // 1. Clear existing plan
        await db.run('DELETE FROM m57_plan');
        console.log('Cleared existing M57 plan.');

        let count = 0;

        // 2. Import Codes Fonction
        const fonctionSheet = workbook.Sheets['Codes Fonction'];
        if (fonctionSheet) {
            const data = xlsx.utils.sheet_to_json(fonctionSheet);
            for (const row of data) {
                const code = (row['Code Fonction'] || '').toString().trim();
                const label = (row['Libellé'] || '').toString().trim();
                if (code) {
                    await db.run(
                        'INSERT INTO m57_plan (code, label, type) VALUES (?, ?, ?)',
                        [code, label, 'fonction']
                    );
                    count++;
                }
            }
            console.log(`Imported ${data.length} fonction codes.`);
        }

        // 3. Import Codes Nature
        const natureSheet = workbook.Sheets['Codes Nature'];
        if (natureSheet) {
            const data = xlsx.utils.sheet_to_json(natureSheet);
            for (const row of data) {
                const code = (row['Code Nature'] || '').toString().trim();
                const label = (row['Libellé'] || '').toString().trim();
                const sectionRaw = row['Type (Fonctionnement/Investissement)'] || '';
                const section = sectionRaw.toLowerCase().includes('inv') ? 'I' : (sectionRaw.toLowerCase().includes('fonc') ? 'F' : '');
                
                if (code) {
                    // Use INSERT OR IGNORE in case some codes are both in fonction and nature (unlikely but safe)
                    // Or just let it fail if UNIQUE constraint is hit and we want to know
                    await db.run(
                        'INSERT OR REPLACE INTO m57_plan (code, label, section, type) VALUES (?, ?, ?, ?)',
                        [code, label, section, 'nature']
                    );
                    count++;
                }
            }
            console.log(`Imported ${data.length} nature codes.`);
        }

        console.log(`Total M57 codes imported: ${count}`);

    } catch (error) {
        console.error('Error syncing M57 plan:', error);
    } finally {
        await db.close();
    }
}

syncM57();
