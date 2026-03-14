const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');

const today = new Date().toISOString().substring(0, 10);

db.get(`
    SELECT 
        (SELECT count(*) FROM referentiel_agents) as total,
        (SELECT count(*) FROM referentiel_agents WHERE date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)) as actif,
        (SELECT count(*) FROM referentiel_agents WHERE date_plusvu IS NOT NULL OR (DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART <= ?)) as parti,
        (SELECT count(*) FROM referentiel_agents WHERE DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE != '' AND DATE_ARRIVEE > ?) as arriveeFuture,
        (SELECT count(*) FROM referentiel_agents WHERE ad_username IS NOT NULL AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)) as adLie
`, [today, today, today, today], (err, row) => {
    if (err) console.error(err);
    else console.log('Final Stats Verification:', row);
    db.close();
});
