const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("Migration de la table telecom_commitments...");

    // 1. Sauvegarder les données existantes
    db.all("SELECT * FROM telecom_commitments", (err, rows) => {
        if (err) {
            console.error("Erreur lors de la lecture des engagements:", err.message);
            db.close();
            return;
        }

        db.run("DROP TABLE telecom_commitments", (err) => {
            if (err) {
                console.error("Erreur lors de la suppression de la table:", err.message);
                db.close();
                return;
            }

            // 2. Créer la nouvelle table sans contrainte UNIQUE sur commitment_number
            // Et avec le nom de colonne function_code au lieu de external_ref
            db.run(`
                CREATE TABLE telecom_commitments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    commitment_number TEXT,
                    label TEXT,
                    amount REAL,
                    invoiced_amount REAL DEFAULT 0,
                    year INTEGER,
                    operator_name TEXT,
                    function_code TEXT
                )
            `, (err) => {
                if (err) {
                    console.error("Erreur lors de la création de la table:", err.message);
                    db.close();
                    return;
                }

                // 3. Réinsérer les données
                const stmt = db.prepare("INSERT INTO telecom_commitments (id, commitment_number, label, amount, invoiced_amount, year, operator_name, function_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                rows.forEach(row => {
                    stmt.run(row.id, row.commitment_number, row.label, row.amount, row.invoiced_amount, row.year, row.operator_name, row.external_ref);
                });
                stmt.finalize();

                console.log("Migration terminée avec succès.");
                db.close();
            });
        });
    });
});
