const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const xlsx = require('xlsx');
const path = require('path');

async function importOperations() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Ensure table exists
    await db.exec(`
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT,
            nature TEXT,
            libelle TEXT,
            chapitre_fonction TEXT,
            montant_prevu REAL DEFAULT 0,
            termine BOOLEAN DEFAULT 0,
            solde REAL DEFAULT 0,
            commentaire TEXT
        );
    `);

    const filePath = path.join(__dirname, '..', 'opérations.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
        console.log('No data to import');
        return;
    }

    // Define mapping
    const mapping = {
        'Service gestion.': 'service',
        'Titre': 'titre',
        'Libellé': 'libelle',
        'C. Fonc.': 'chapitre_fonction',
        'C. Nature': 'nature',
        'Montant prévu': 'montant_prevu',
        'Solde': 'solde'
    };

    // Check existing columns
    const tableInfo = await db.all("PRAGMA table_info(operations)");
    const existingCols = tableInfo.map(c => c.name);

    // Add missing columns from mapping
    for (const targetCol of Object.values(mapping)) {
        if (!existingCols.includes(targetCol)) {
            console.log(`Adding column ${targetCol} to operations table`);
            await db.run(`ALTER TABLE operations ADD COLUMN "${targetCol}" TEXT`);
        }
    }

    // Clear existing data
    await db.run('DELETE FROM operations');

    let count = 0;
    for (const row of data) {
        if (!row['Libellé'] && !row['Service gestion.']) continue;

        const keys = [];
        const values = [];
        const placeholders = [];

        for (const [excelHeader, targetCol] of Object.entries(mapping)) {
            if (row[excelHeader] !== undefined && row[excelHeader] !== null) {
                keys.push(`"${targetCol}"`);
                let val = row[excelHeader];
                if (targetCol === 'montant_prevu' || targetCol === 'solde') {
                    val = parseFloat(val) || 0;
                }
                values.push(val);
                placeholders.push('?');
            }
        }

        if (keys.length > 0) {
            const query = `INSERT INTO operations (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`;
            await db.run(query, values);
            count++;
        }
    }

    console.log(`Successfully imported ${count} operations`);
    await db.close();
}

importOperations().catch(console.error);
