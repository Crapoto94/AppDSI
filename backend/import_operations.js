const setupDb = require('./db');
const xlsx = require('xlsx');
const path = require('path');

async function importOperations() {
    const db = await setupDb();
    const filePath = path.join(__dirname, '..', 'opérations.xlsx');
    
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Clear existing operations
        await db.run('DELETE FROM operations');
        console.log('Cleared existing operations.');

        let imported = 0;
        for (const row of data) {
            const service = row['Service'] || '';
            const service_comp = row['Service Complément'] || '';
            const nom = row['Nom'] || '';
            const mco = row['MCO'] || '';
            const c_fonc = row['C. Fonc.'] || '';
            const c_nature = row['C. Nature'] || '';
            
            let montant_prevu = 0;
            if (row['Montant prévu'] !== undefined) {
                if (typeof row['Montant prévu'] === 'string') {
                    montant_prevu = parseFloat(row['Montant prévu'].replace(/[^0-9,-]+/g, '').replace(',', '.'));
                } else {
                    montant_prevu = parseFloat(row['Montant prévu']);
                }
            }

            const termine = row['Terminé'] || '';
            
            let solde = 0;
            if (row['Solde'] !== undefined) {
                if (typeof row['Solde'] === 'string') {
                    solde = parseFloat(row['Solde'].replace(/[^0-9,-]+/g, '').replace(',', '.'));
                } else {
                    solde = parseFloat(row['Solde']);
                }
            }

            await db.run(
                `INSERT INTO operations ("Service", "Service Complément", "Nom", "MCO", "C. Fonc.", "C. Nature", "Montant prévu", "Terminé", "Solde")
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [service, service_comp, nom, mco, c_fonc, c_nature, isNaN(montant_prevu) ? 0 : montant_prevu, termine, isNaN(solde) ? 0 : solde]
            );
            imported++;
        }
        console.log(`Imported ${imported} operations.`);
    } catch (error) {
        console.error('Error importing operations:', error);
    } finally {
        process.exit(0);
    }
}

importOperations().catch(err => {
    console.error('Fatal error during import:', err);
    process.exit(1);
});
