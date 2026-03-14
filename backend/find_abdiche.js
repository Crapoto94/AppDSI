const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('oracle_rh.sqlite');
db.all("SELECT * FROM referentiel_agents WHERE NOM LIKE '%ABDICHE%'", (err, rows) => {
    console.log("referentiel_agents:", JSON.stringify(rows, null, 2));
    db.all("SELECT * FROM ad_links WHERE ad_username LIKE '%ABDICHE%' OR matricule IN (SELECT MATRICULE FROM referentiel_agents WHERE NOM LIKE '%ABDICHE%')", (err2, rows2) => {
        console.log("ad_links:", JSON.stringify(rows2, null, 2));
        db.close();
    });
});
