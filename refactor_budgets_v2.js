const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function refactorBudgetsV2() {
    const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log('--- Démarrage de la refonte V2 des budgets ---');

    // 1. Supprimer l'ancienne table budget_lines
    await db.exec('DROP TABLE IF EXISTS budget_lines');
    console.log('Ancienne table "budget_lines" supprimée.');
    
    // Pour s'assurer de repartir de zéro, on supprime aussi l'ancienne table budgets si elle existe
    await db.exec('DROP TABLE IF EXISTS budgets');
    console.log('Ancienne table "budgets" (si existante) supprimée.');

    // 2. Création de la nouvelle table budgets
    await db.exec(`
        CREATE TABLE budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            year INTEGER,
            allocated_amount REAL DEFAULT 0,
            description TEXT,
            UNIQUE(name, year)
        )
    `);
    console.log('Nouvelle table "budgets" créée.');

    // 3. Insertion des 5 budgets pour l'année en cours
    const currentYear = new Date().getFullYear();
    const budgetNames = ['Ville', 'Luxy', 'Restauration', 'CMS', 'CMPP'];
    for (const name of budgetNames) {
        await db.run(
            'INSERT OR IGNORE INTO budgets (name, year, allocated_amount, description) VALUES (?, ?, ?, ?)', 
            [name, currentYear, 0, '']
        );
        console.log(`Budget ajouté pour ${currentYear} : ${name}`);
    }

    await db.close();
    console.log('--- Refonte V2 terminée avec succès ---');
}

refactorBudgetsV2().catch(console.error);
