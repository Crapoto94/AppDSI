const axios = require('axios');
// Simulate admin token (replace with a real one if needed, or check logic)
// Since I can't easily get a token here, I'll use a direct DB check script.

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');

const today = new Date().toISOString().substring(0, 10);

async function testFilter(filter) {
    let where = "";
    let params = [];
    switch (filter) {
        case 'actif':
            where = "WHERE date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)";
            params.push(today);
            break;
        case 'parti':
            where = "WHERE (date_plusvu IS NOT NULL OR (DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART <= ?))";
            params.push(today);
            break;
        case 'future':
            where = "WHERE DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE != '' AND DATE_ARRIVEE > ?";
            params.push(today);
            break;
    }
    
    return new Promise((resolve) => {
        db.get(`SELECT count(*) as c FROM referentiel_agents ${where}`, params, (err, row) => {
            resolve(row ? row.c : 0);
        });
    });
}

async function run() {
    const actif = await testFilter('actif');
    const parti = await testFilter('parti');
    const future = await testFilter('future');
    console.log({ actif, parti, future });
    db.close();
}

run();
