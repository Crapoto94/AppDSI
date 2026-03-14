const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`ATTACH DATABASE '${gfDbPath}' AS gf`, (err) => {
        if (err) console.error("ATTACH Error:", err);
    });
    
    console.log("--- V_ORDERS CHECK ---");
    db.all("SELECT DISTINCT substr(COMMANDE_CMD_DATECOMMANDE, 1, 4) as y FROM gf.oracle_commande", (err, rows) => {
        if (err) console.error("Oracle Commande Error:", err);
        else console.log("Years in oracle_commande:", rows);
    });

    db.run(`
        CREATE TEMP VIEW IF NOT EXISTS v_orders_debug AS
        SELECT oc.*, 
        oc.COMMANDE_COMMANDE as id,
        oc.COMMANDE_CMD_DATECOMMANDE as date,
        TRIM(oc.COMMANDE_ROO_IMA_REF) as COMMANDE_ROO_IMA_REF
        FROM gf.oracle_commande oc
    `, (err) => {
        if (err) console.error("View Creation Error:", err);
        else {
            db.all("SELECT DISTINCT substr(date, 1, 4) as year FROM v_orders_debug", (err, rows) => {
                if (err) console.error("View Query Error:", err);
                else console.log("Years in v_orders_debug:", rows);
            });
        }
    });

    console.log("--- INVOICES CHECK ---");
    db.all("SELECT * FROM invoices LIMIT 2", (err, rows) => {
        if (err) console.error("Invoices Query Error:", err);
        else console.log("Sample invoices:", JSON.stringify(rows, null, 2));
    });

    db.all("SELECT DISTINCT Budget, Exercice FROM invoices", (err, rows) => {
        if (err) console.error("Distinct Query Error:", err);
        else console.log("Distinct Budget/Exercice in invoices:", rows);
        db.close();
    });
});
