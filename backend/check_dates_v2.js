const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');
db.all("SELECT MATRICULE, DATE_ARRIVEE, DATE_DEPART FROM referentiel_agents WHERE DATE_DEPART IS NOT NULL AND DATE_DEPART != '' LIMIT 5", (err, rows) => {
    if (err) console.error(err);
    else {
        console.log('--- DATE_DEPART SAMPLES ---');
        console.log(rows);
    }
    db.all("SELECT MATRICULE, DATE_ARRIVEE FROM referentiel_agents WHERE DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE != '' LIMIT 5", (err2, rows2) => {
        if (err2) console.error(err2);
        else {
            console.log('--- DATE_ARRIVEE SAMPLES ---');
            console.log(rows2);
        }
        db.close();
    });
});
