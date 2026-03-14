const axios = require('axios');

const testApi = async () => {
    try {
        // En local, on peut essayer de requêter sans token si l'auth est désactivée pour localhost (peu probable)
        // Ou on peut juste vérifier la vue via sqlite directement
        const sqlite3 = require('sqlite3').verbose();
        const path = require('path');
        const dbPath = path.join(__dirname, 'database.sqlite');
        const db = new sqlite3.Database(dbPath);

        // Puisqu'on utilise des vues TEMP, elles sont liées à la connexion.
        // On va simuler ce que fait db.js pour recréer la vue dans cette session de script.
        const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
        
        db.serialize(() => {
            db.run(`ATTACH DATABASE '${gfDbPath}' AS gf`);
            
            db.all("PRAGMA table_info(oracle_commande)", (err, rows) => {
                // Création de la vue comme dans db.js
                db.run(`
                    CREATE TEMP VIEW v_orders_test AS
                    SELECT oc.*, 
                    oc.COMMANDE_COMMANDE as id,
                    oc.COMMANDE_ROO_IMA_REF
                    FROM gf.oracle_commande oc
                `, () => {
                    db.get("SELECT * FROM v_orders_test LIMIT 1", (err, row) => {
                        if (err) {
                            console.error("Erreur query:", err);
                        } else {
                            console.log("Exemple de commande avec Sedit ID:", row.COMMANDE_ROO_IMA_REF ? "PRESENT (" + row.COMMANDE_ROO_IMA_REF + ")" : "ABSENT");
                        }
                        db.close();
                    });
                });
            });
        });
    } catch (e) {
        console.error(e);
    }
};

testApi();
