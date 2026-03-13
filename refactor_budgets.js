const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function refactorBudgets() {
    const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log('--- Démarrage de la refonte des budgets ---');

    // 1. Création de la nouvelle table budgets
    await db.exec(`
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            description TEXT
        )
    `);

    // 2. Insertion des 5 budgets
    const budgetNames = ['Ville', 'Luxy', 'Restauration', 'CMS', 'CMPP'];
    for (const name of budgetNames) {
        await db.run('INSERT OR IGNORE INTO budgets (name) VALUES (?)', [name]);
        console.log(`Budget ajouté : ${name}`);
    }

    // 3. Mise à jour de budget_lines
    // On ajoute la colonne budget_id si elle n'existe pas
    try {
        await db.run('ALTER TABLE budget_lines ADD COLUMN budget_id INTEGER REFERENCES budgets(id)');
        console.log('Colonne budget_id ajoutée à budget_lines');
    } catch (e) {
        console.log('La colonne budget_id existe déjà.');
    }

    // 4. On vide les données existantes comme demandé ("ne récupère aucune données")
    // Note: On ne vide que budget_lines pour repartir de zéro sur les lignes, 
    // mais on garde les 5 budgets qu'on vient de créer.
    await db.run('DELETE FROM budget_lines');
    console.log('Table budget_lines vidée.');

    await db.close();
    console.log('--- Refonte terminée avec succès ---');
}

refactorBudgets().catch(console.error);
