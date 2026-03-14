const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./oracle_rh.sqlite');

function parseOracleDate(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    const frMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (frMatch) {
        const d = frMatch[1].padStart(2, '0');
        const m = frMatch[2].padStart(2, '0');
        const y = frMatch[3];
        return `${y}-${m}-${d}`;
    }
    try {
        const cleanS = s.replace(/\s*\(.*\)$/, '');
        const d = new Date(cleanS);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    } catch (e) {}
    return s;
}

db.all("SELECT MATRICULE, DATE_ARRIVEE, DATE_DEPART FROM referentiel_agents", (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    db.serialize(async () => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare("UPDATE referentiel_agents SET DATE_ARRIVEE = ?, DATE_DEPART = ? WHERE MATRICULE = ?");
        
        for (const row of rows) {
            const newArrivée = parseOracleDate(row.DATE_ARRIVEE);
            const newDepart = parseOracleDate(row.DATE_DEPART);
            if (newArrivée !== row.DATE_ARRIVEE || newDepart !== row.DATE_DEPART) {
                stmt.run(newArrivée, newDepart, row.MATRICULE);
            }
        }
        
        stmt.finalize();
        db.run('COMMIT', () => {
            console.log('Normalization complete.');
            db.close();
        });
    });
});
