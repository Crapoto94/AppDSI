const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function seedBudgets() {
    console.log('Seeding budgets table...');
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Annee INTEGER,
            numero INTEGER,
            Libelle TEXT
        );
    `);

    const budgets = [
        { Annee: 2026, numero: 1, Libelle: 'Ville' },
        { Annee: 2026, numero: 2, Libelle: 'CMPP' },
        { Annee: 2026, numero: 3, Libelle: 'CMS' },
        { Annee: 2026, numero: 4, Libelle: 'Restauration' },
        { Annee: 2026, numero: 5, Libelle: 'Luxy' },
    ];

    for (const budget of budgets) {
        const existing = await db.get('SELECT id FROM budgets WHERE Annee = ? AND Libelle = ?', [budget.Annee, budget.Libelle]);
        if (!existing) {
            await db.run('INSERT INTO budgets (Annee, numero, Libelle) VALUES (?, ?, ?)', [
                budget.Annee,
                budget.numero,
                budget.Libelle
            ]);
            console.log(`Budget '${budget.Libelle}' for year ${budget.Annee} inserted.`);
        } else {
            console.log(`Budget '${budget.Libelle}' for year ${budget.Annee} already exists.`);
        }
    }

    console.log('Finished seeding budgets table.');
}

seedBudgets().catch(err => {
    console.error('Error seeding budgets:', err);
});
