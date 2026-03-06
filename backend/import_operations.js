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
            const service_complement = row['Service Complément'] || '';
            const mco = row['MCO'] || '';
            const libelle = row['Nom'] || '';
            const chapitre_fonction = row['C. Fonc.'] || '';
            const nature = row['C. Nature'] || '';
            let montant_prevu = row['Montant prévu'] || 0;
            if (typeof montant_prevu === 'string') {
                montant_prevu = parseFloat(montant_prevu.replace(/[^0-9,-]+/g, '').replace(',', '.'));
            }
            const termine = (row['Terminé'] === 'OUI' || row['Terminé'] === true) ? 1 : 0;
            let solde = row['Solde'] || 0;
            if (typeof solde === 'string') {
                solde = parseFloat(solde.replace(/[^0-9,-]+/g, '').replace(',', '.'));
            }

            await db.run(
                `INSERT INTO operations (service, service_complement, mco, libelle, chapitre_fonction, nature, montant_prevu, termine, solde)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [service, service_complement, mco, libelle, chapitre_fonction, nature, montant_prevu, termine, solde]
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

importOperations();
