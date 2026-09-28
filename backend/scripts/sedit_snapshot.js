/**
 * Instantané des données Sedit d'une facture (FACSUIVI + FACTURE) pour comparer
 * l'état AVANT/APRÈS une validation manuelle dans Sedit, puis savoir exactement
 * ce que l'application écrit en plus de notre écriture directe.
 *
 * Usage :
 *   node scripts/sedit_snapshot.js snap <FACTURE> <fichier.json>
 *   node scripts/sedit_snapshot.js diff <avant.json> <apres.json>
 *   node scripts/sedit_snapshot.js restore <fichier.json>   (remet les lignes FACSUIVI de l'instantané)
 */
const fs = require('fs');
const oracledb = require('oracledb');
const { setupDb } = require('../shared/database');
const financeShare = require('../modules/finance/finance-share.controller');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function snapshot(facture) {
    return financeShare.withFinanceOracle(async (conn) => {
        const f = await conn.execute(`SELECT * FROM FI.FACTURE WHERE TRIM(FACTURE) = :n`, { n: facture });
        const roo = f.rows[0] ? String(f.rows[0].ROO_IMA_REF).trim() : null;
        let facsuivi = [];
        let factureRow = f.rows[0] || null;
        if (roo) {
            const fs2 = await conn.execute(`SELECT * FROM FI.FACSUIVI WHERE TRIM(FACTURE) = :r ORDER BY AVANCEMENT`, { r: roo });
            facsuivi = fs2.rows;
        }
        return { facture, roo, at: new Date().toISOString(), factureRow, facsuivi };
    });
}

function diff(before, after) {
    const out = [];
    const cmp = (path, a, b) => {
        const na = a == null ? null : String(a);
        const nb = b == null ? null : String(b);
        if (na !== nb) out.push({ path, before: na, after: nb });
    };
    // FACTURE (ligne unique)
    const keysF = new Set([...Object.keys(before.factureRow || {}), ...Object.keys(after.factureRow || {})]);
    for (const k of keysF) cmp(`FACTURE.${k}`, before.factureRow?.[k], after.factureRow?.[k]);
    // FACSUIVI par AVANCEMENT
    const byAv = (rows) => { const m = {}; (rows || []).forEach(r => m[String(r.AVANCEMENT).trim()] = r); return m; };
    const bA = byAv(before.facsuivi), aA = byAv(after.facsuivi);
    const avs = new Set([...Object.keys(bA), ...Object.keys(aA)]);
    for (const av of avs) {
        const br = bA[av], ar = aA[av];
        if (!br) { out.push({ path: `FACSUIVI[${av}]`, before: '(absent)', after: '(apparu)' }); continue; }
        if (!ar) { out.push({ path: `FACSUIVI[${av}]`, before: '(présent)', after: '(supprimé)' }); continue; }
        const ks = new Set([...Object.keys(br), ...Object.keys(ar)]);
        for (const k of ks) cmp(`FACSUIVI[${av}].${k}`, br[k], ar[k]);
    }
    return out;
}

(async () => {
    const [, , cmd, arg1, arg2] = process.argv;
    if (cmd === 'snap') {
        await setupDb();
        const data = await snapshot(arg1);
        fs.writeFileSync(arg2, JSON.stringify(data, null, 1), 'utf8');
        console.log(`Snapshot ${arg1} -> ${arg2} (${data.facsuivi.length} lignes FACSUIVI)`);
        process.exit(0);
    } else if (cmd === 'diff') {
        const before = JSON.parse(fs.readFileSync(arg1, 'utf8'));
        const after = JSON.parse(fs.readFileSync(arg2, 'utf8'));
        const d = diff(before, after);
        console.log(`Différences (${d.length}) :`);
        d.forEach(x => console.log(`  ${x.path}: ${JSON.stringify(x.before)} -> ${JSON.stringify(x.after)}`));
        process.exit(0);
    } else if (cmd === 'restore') {
        await setupDb();
        const data = JSON.parse(fs.readFileSync(arg1, 'utf8'));
        const rows = data.facsuivi || [];
        await financeShare.withFinanceOracle(async (conn) => {
            let n = 0;
            for (const row of rows) {
                const cols = Object.keys(row).filter((c) => !/[^\w]/.test(c));
                const sets = cols.map((c) => `"${c}" = :${c}`).join(', ');
                const binds = {};
                cols.forEach((c) => {
                    const v = row[c];
                    binds[c] = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) ? new Date(v) : v;
                });
                binds.PK = String(row.ROO_IMA_REF);
                const r = await conn.execute(
                    `UPDATE FI.FACSUIVI SET ${sets} WHERE TRIM(ROO_IMA_REF) = :PK`, binds
                );
                n += r.rowsAffected || 0;
            }
            await conn.commit();
            console.log(`Restauré ${n} ligne(s) FACSUIVI depuis ${arg1}`);
        });
        process.exit(0);
    } else {
        console.log('Usage: node scripts/sedit_snapshot.js snap <FACTURE> <fichier.json> | diff <avant.json> <apres.json> | restore <fichier.json>');
        process.exit(2);
    }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
