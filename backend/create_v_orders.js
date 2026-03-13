const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function createView() {
    const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
    
    console.log("1. Vérification/Ajout des colonnes de gestion...");
    db.serialize(() => {
        // Ajout des colonnes si manquantes
        db.run("ALTER TABLE oracle_commande ADD COLUMN operation_id INTEGER", (err) => {
            if (err && !err.message.includes("duplicate column name")) console.log("Note:", err.message);
        });
        db.run("ALTER TABLE oracle_commande ADD COLUMN budgetId INTEGER", (err) => {
            if (err && !err.message.includes("duplicate column name")) console.log("Note:", err.message);
        });

        console.log("2. Création de la vue v_orders...");
        db.run(`DROP VIEW IF EXISTS v_orders`, (err) => {
            if (err) console.error(err);
            
            // On récupère les colonnes de oracle_commande pour construire le SELECT *
            db.all("PRAGMA table_info(oracle_commande)", (err, columns) => {
                if (err) {
                    console.error(err);
                    return;
                }

                const colNames = columns.map(c => `"${c.name}"`).join(', ');
                
                const sql = `
                    CREATE VIEW v_orders AS
                    SELECT 
                        ${colNames},
                        COMMANDE_COMMANDE as id,
                        COMMANDE_COMMANDE as "N° Commande",
                        COMMANDE_LIBELLE as "Libellé",
                        COMMANDE_CMD_DATECOMMANDE as "Date de la commande",
                        BUDGET_LIBELLE as "Budget",
                        SERVICEFI_LIBELLE as "Service émetteur",
                        SERVICEFI_LIBELLE as "Fournisseur",
                        COMMANDE_MONTANT_HT as "Montant HT",
                        COMMANDE_MONTANT_TTC as "Montant TTC",
                        COMMANDE_COMMANDE as order_number,
                        COMMANDE_LIBELLE as description,
                        SERVICEFI_LIBELLE as provider,
                        COMMANDE_MONTANT_HT as amount_ht,
                        COMMANDE_CMD_DATECOMMANDE as date
                    FROM oracle_commande
                `;

                db.run(sql, (err) => {
                    if (err) {
                        console.error("ERREUR CRÉATION VUE:", err.message);
                    } else {
                        console.log("SUCCÈS: Vue v_orders créée.");
                    }
                    db.close();
                });
            });
        });
    });
}

createView();
