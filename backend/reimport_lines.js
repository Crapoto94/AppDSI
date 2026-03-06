const setupDb = require('./db');
const xlsx = require('xlsx');
const path = require('path');

async function importLines() {
    const db = await setupDb();
    const filePath = path.join(__dirname, '..', 'Liste_des_lignes_d_exécution.xls');
    
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Found ${data.length} rows in Excel.`);

        // Ensure table has all necessary columns from Excel
        if (data.length > 0) {
            const excelCols = Object.keys(data[0]);
            for (const col of excelCols) {
                try {
                    await db.run(`ALTER TABLE budget_lines ADD COLUMN "${col}" TEXT`);
                } catch (e) {}
                try {
                    await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['lines', col, col, 1]);
                } catch (e) {}
            }
        }

        let imported = 0;
        let updated = 0;
        const year = 2026;

        for (const row of data) {
            const code = row.Code || row.code;
            if (!code) continue; 
            
            row.year = year;

            // Map standard fields for backwards compatibility
            row.code = code;
            row.label = row['Libellé'] || row.Libelle || row.label || '';
            row.section = row['Section'] || row.section || '';
            let amount = row['Budget voté'] || row['Mt. prévision'] || row.Montant || row.allocated_amount || 0;
            if (typeof amount === 'string') amount = parseFloat(amount.replace(/[^0-9,-]+/g, '').replace(',', '.'));
            row.allocated_amount = amount;

            // Check if exists
            const exists = await db.get('SELECT id FROM budget_lines WHERE "Code" = ? AND year = ?', [code, year]);
            
            const cols = Object.keys(row).filter(c => c !== 'id');
            const vals = cols.map(c => row[c]?.toString());
            const placeholders = cols.map(() => '?').join(',');

            if (!exists) {
                await db.run(
                    `INSERT INTO budget_lines (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`,
                    vals
                );
                imported++;
            } else {
                const updateStr = cols.map(c => `"${c}" = ?`).join(',');
                await db.run(
                    `UPDATE budget_lines SET ${updateStr} WHERE id = ?`,
                    [...vals, exists.id]
                );
                updated++;
            }
        }
        console.log(`${imported} lines imported, ${updated} lines updated.`);
    } catch (error) {
        console.error('Error importing lines:', error);
    } finally {
        process.exit(0);
    }
}

importLines();
