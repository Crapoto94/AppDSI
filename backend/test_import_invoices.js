const setupDb = require('./db');
const xlsx = require('xlsx');
const path = require('path');

async function testImport() {
    const db = await setupDb();
    const filePath = path.join(__dirname, '..', 'liste_factures.xls');
    
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Found ${data.length} rows in Excel.`);
        if (data.length === 0) return;

        // Clear existing
        await db.run('DELETE FROM invoices');
        
        const tableCols = (await db.all("PRAGMA table_info(invoices)")).map(c => c.name);
        console.log('Database columns:', tableCols);
        console.log('Excel first row keys:', Object.keys(data[0]));

        let imported = 0;
        for (const row of data) {
            const keys = Object.keys(row).filter(k => tableCols.includes(k));
            if (keys.length === 0) {
                // Check if keys are just trimmed or have different spacing
                // console.log('No matching keys for row:', row);
                continue;
            }

            const values = keys.map(k => row[k]);
            const placeholders = keys.map(() => '?').join(',');
            const sql = `INSERT INTO invoices (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders})`;
            
            try {
                await db.run(sql, values);
                imported++;
            } catch (err) {
                console.error('Row insertion error:', err.message);
                throw err;
            }
        }
        console.log(`Successfully imported ${imported} rows.`);
    } catch (error) {
        console.error('Test Import error:', error);
    } finally {
        process.exit(0);
    }
}

testImport();
