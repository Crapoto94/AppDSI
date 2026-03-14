const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`ATTACH DATABASE '${gfDbPath}' AS gf`);
    
    console.log("--- V_ORDERS CHECK ---");
    db.all("SELECT DISTINCT substr(COMMANDE_CMD_DATECOMMANDE, 1, 4) as y FROM gf.oracle_commande", (err, rows) => {
        console.log("Years in oracle_commande:", rows);
    });

    db.all("SELECT id, date, COMMANDE_ROO_IMA_REF FROM v_orders LIMIT 5", (err, rows) => {
        // This will only work if we recreate the view here
        db.run(`
            CREATE TEMP VIEW IF NOT EXISTS v_orders_debug AS
            SELECT oc.*, 
            oc.COMMANDE_COMMANDE as id,
            oc.COMMANDE_CMD_DATECOMMANDE as date,
            TRIM(oc.COMMANDE_ROO_IMA_REF) as COMMANDE_ROO_IMA_REF
            FROM gf.oracle_commande oc
        `, () => {
            db.all("SELECT DISTINCT substr(date, 1, 4) as year FROM v_orders_debug", (err, rows) => {
                console.log("Years in v_orders_debug:", rows);
            });
        });
    });

    console.log("--- INVOICES CHECK ---");
    db.all("SELECT DISTINCT Budget, Exercice FROM invoices", (err, rows) => {
        console.log("Distinct Budget/Exercice in invoices:", rows);
        db.close();
    });
});
