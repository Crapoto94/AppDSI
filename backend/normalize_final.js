const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');

const months = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function parseOracleDate(val) {
    if (val === null || val === undefined) return null;
    let s = String(val).trim();
    if (!s || s === 'null') return null;
    
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    
    // DD/MM/YYYY
    const frMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (frMatch) {
        return `${frMatch[3]}-${frMatch[2].padStart(2, '0')}-${frMatch[1].padStart(2, '0')}`;
    }
    
    // JS Date String: Wed Jan 01 2020 00:00:00 GMT+0100 ...
    const jsMatch = s.match(/^[a-zA-Z]{3}\s+([a-zA-Z]{3})\s+(\d{1,2})\s+(\d{4})/);
    if (jsMatch) {
        const m = months[jsMatch[1]];
        const d = jsMatch[2].padStart(2, '0');
        const y = jsMatch[3];
        if (m) return `${y}-${m}-${d}`;
    }
    
    return s;
}

db.all("SELECT * FROM referentiel_agents", (err, rows) => {
    if (err) throw err;
    console.log(`Processing ${rows.length} rows...`);
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare("UPDATE referentiel_agents SET DATE_ARRIVEE = ?, DATE_DEPART = ? WHERE MATRICULE = ?");
        
        let count = 0;
        rows.forEach(row => {
            const m = row.MATRICULE || row.matricule;
            const dA = row.DATE_ARRIVEE || row.date_arrivee;
            const dD = row.DATE_DEPART || row.date_depart;
            
            const newA = parseOracleDate(dA);
            const newD = parseOracleDate(dD);
            
            if (newA !== dA || newD !== dD) {
                stmt.run(newA, newD, m);
                count++;
            }
        });
        
        stmt.finalize();
        db.run("COMMIT", (err2) => {
            if (err2) console.error("COMMIT FAILED:", err2);
            else console.log(`SUCCESS: Updated ${count} rows.`);
            db.close();
        });
    });
});
