const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_gf.sqlite');
db.get("SELECT * FROM oracle_commande LIMIT 1", (err, row) => console.log(Object.keys(row || {})));
