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
    
    // Fallback try Date object
    try {
        const d = new Date(s.replace(/\s*\(.*\)$/, ''));
        if (!isNaN(d.getTime())) {
            return d.toISOString().substring(0, 10);
        }
    } catch (e) {}
    
    return s;
}

db.all("SELECT MATRICULE, DATE_ARRIVEE, DATE_DEPART FROM referentiel_agents", (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare("UPDATE referentiel_agents SET DATE_ARRIVEE = ?, DATE_DEPART = ? WHERE MATRICULE = ?");
        
        let count = 0;
        for (const row of rows) {
            const newArrivée = parseOracleDate(row.DATE_ARRIVEE);
            const newDepart = parseOracleDate(row.DATE_DEPART);
            if (newArrivée !== row.DATE_ARRIVEE || newDepart !== row.DATE_DEPART) {
                stmt.run(newArrivée, newDepart, row.MATRICULE);
                count++;
            }
        }
        
        stmt.finalize();
        db.run('COMMIT', () => {
            console.log(`Normalization complete. Updated ${count} rows.`);
            db.close();
        });
    });
});
