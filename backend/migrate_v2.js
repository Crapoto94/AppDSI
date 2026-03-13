const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.serialize(async () => {
    // 1. S'assurer que oracle_commande a les colonnes nécessaires
    db.run("ALTER TABLE oracle_commande ADD COLUMN operation_id INTEGER", (err) => {});
    db.run("ALTER TABLE oracle_commande ADD COLUMN budgetId INTEGER", (err) => {});

    // 2. Créer la vue v_orders
    console.log("Creating view v_orders...");
    db.run(`DROP VIEW IF EXISTS v_orders`, (err) => {
        db.run(`
            CREATE VIEW v_orders AS
            SELECT
                COMMANDE_COMMANDE as id,
                COMMANDE_COMMANDE as "N° Commande",
                COMMANDE_LIBELLE as "Libellé",
                COMMANDE_CMD_DATECOMMANDE as "Date de la commande",
                BUDGET_LIBELLE as "Budget",
                SERVICEFI_LIBELLE as "Service émetteur",
                SERVICEFI_LIBELLE as "Fournisseur",
                COMMANDE_MONTANT_HT as "Montant HT",
                COMMANDE_MONTANT_TTC as "Montant TTC",
                COMMANDE_NB_LIGNES_COMMANDE as "N° ligne",
                operation_id,
                budgetId,
                COMMANDE_COMMANDE as order_number,
                COMMANDE_LIBELLE as description,
                SERVICEFI_LIBELLE as provider,
                COMMANDE_MONTANT_HT as amount_ht,
                COMMANDE_CMD_DATECOMMANDE as date
            FROM oracle_commande
        `, (err) => {
            if (err) console.error("Error creating view:", err.message);
            else console.log("View v_orders created successfully.");
            
            // 3. Supprimer l'ancienne table orders
            console.log("Dropping old table orders...");
            db.run("DROP TABLE IF EXISTS orders", (err) => {
                if (err) console.error("Error dropping table:", err.message);
                else console.log("Old table orders dropped.");
                db.close();
            });
        });
    });
});
