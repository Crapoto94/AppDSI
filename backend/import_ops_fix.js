const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const excelPath = path.join(__dirname, '..', 'opérations.xlsx');

const db = new sqlite3.Database(dbPath);

async function importOperations() {
    console.log('Reading Excel file...');
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log(`Found ${data.length} rows. Clearing existing operations...`);
    await new Promise((resolve, reject) => {
        db.run('DELETE FROM operations', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    console.log('Importing data...');
    let count = 0;
    for (const row of data) {
        const mapped = {
            service: row.Service || row.service || '',
            service_complement: row['Service Complément'] || row.service_complement || '',
            mco: row.MCO || row.mco || '',
            nature: row.Nature || row.nature || '',
            libelle: row['Libellé'] || row.libelle || '',
            chapitre_fonction: row['Chapitre Fonc.'] || row.chapitre_fonction || '',
            montant_prevu: parseFloat(row['Montant Prévu'] || row.montant_prevu || 0),
            termine: (row['Terminé'] || row.termine) === 'OUI' || (row['Terminé'] || row.termine) === true ? 1 : 0,
            solde: parseFloat(row.Solde || row.solde || 0),
            commentaire: row.Commentaire || row.commentaire || ''
        };

        const cols = Object.keys(mapped);
        const placeholders = cols.map(() => '?').join(',');
        const values = Object.values(mapped);
        const sql = `INSERT INTO operations (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;

        await new Promise((resolve, reject) => {
            db.run(sql, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        count++;
    }

    console.log(`Successfully imported ${count} operations.`);
    db.close();
}

importOperations().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
