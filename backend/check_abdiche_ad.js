const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('oracle_rh.sqlite');
db.all("SELECT MATRICULE, NOM, PRENOM, DATE_ARRIVEE, DATE_DEPART, ad_username, date_plusvu FROM referentiel_agents WHERE NOM LIKE '%ABDICHE%'", (err, rows) => {
    console.log("referentiel_agents:", JSON.stringify(rows, null, 2));
    db.close();
});
