const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');
// Attempt to identify agents where DATE_ARRIVEE is in the future
// The format is "Mon Sep 16 2024 00:00:00 GMT+0200..."
// We need something like: SUBSTR(DATE_ARRIVEE, 12, 4) to get the year = 2024
// OR INSTR to find year
// Actually the 12th char is position 11 (0 indexed). Let's check:
// Wed Jan 01 2020 ...
// 0123456789012345
// Position 11 = '2' which starts the year 4 digits.
db.all(`SELECT DATE_ARRIVEE, SUBSTR(DATE_ARRIVEE, 12, 4) as year, DATE_DEPART, TRIM(DATE_DEPART) as dep_trim FROM referentiel_agents WHERE DATE_ARRIVEE IS NOT NULL LIMIT 5`, (err, rows) => {
    if(err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
});
