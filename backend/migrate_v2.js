const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function migrate() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('Migrating database...');

    // Add section to budget_lines if missing
    try {
        await db.run('ALTER TABLE budget_lines ADD COLUMN section TEXT');
        console.log('Added section to budget_lines');
    } catch (e) {}

    // Add status to tiles if missing
    try {
        await db.run('ALTER TABLE tiles ADD COLUMN status TEXT DEFAULT "active"');
        console.log('Added status to tiles');
    } catch (e) {}

    // Update existing budget_lines sections based on code
    const lines = await db.all('SELECT id, code FROM budget_lines');
    for (const line of lines) {
        if (line.code) {
            const firstDigit = parseInt(line.code.charAt(0));
            const section = isNaN(firstDigit) ? 'F' : (firstDigit > 4 ? 'F' : 'I');
            await db.run('UPDATE budget_lines SET section = ? WHERE id = ?', [section, line.id]);
        }
    }

    // Merge roles: update 'compta' to 'finances'
    await db.run('UPDATE users SET role = "finances" WHERE role = "compta"');
    console.log('Merged compta role into finances');

    console.log('Migration complete.');
    await db.close();
}

migrate().catch(console.error);
