const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'oracle_rh.sqlite');
const db = new sqlite3.Database(dbPath);

const today = new Date().toISOString().substring(0, 10);

db.serialize(() => {
    db.get('SELECT count(*) as c FROM referentiel_agents', (err, row) => {
        console.log('Total agents:', row ? row.c : 'Error');
    });
    db.get('SELECT count(*) as c FROM referentiel_agents WHERE date_plusvu IS NULL', (err, row) => {
        console.log('Agents sans date_plusvu:', row ? row.c : 'Error');
    });
    db.get('SELECT count(*) as c FROM referentiel_agents WHERE date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = "" OR DATE_DEPART > ?)', [today], (err, row) => {
        console.log('Agents actifs (calculés):', row ? row.c : 'Error');
    });
    db.all('SELECT MATRICULE, NOM, PRENOM, DATE_DEPART, date_plusvu, ad_username FROM referentiel_agents LIMIT 5', (err, rows) => {
        console.log('Samples:', JSON.stringify(rows, null, 2));
        db.close();
    });
});
