const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`ATTACH DATABASE '${gfDbPath}' AS gf`);
    
    db.run(`
        CREATE TEMP VIEW v_orders_test AS
        SELECT oc.COMMANDE_CMD_DATECOMMANDE as date
        FROM gf.oracle_commande oc
    `, () => {
        db.all("SELECT date, count(*) as count FROM v_orders_test GROUP BY date LIMIT 10", (err, rows) => {
            console.log("Sample dates from v_orders:", rows);
            db.all("SELECT DISTINCT substr(date, 1, 4) as y FROM v_orders_test", (err, rows2) => {
                console.log("Distinct years from v_orders substr:", rows2);
                db.close();
            });
        });
    });
});
