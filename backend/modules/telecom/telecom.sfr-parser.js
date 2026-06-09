// Parseur de l'export de facturation SFR Business (ZIP de ZIPs contenant des CSV).
// Traitement 100% en mémoire à partir du buffer multer.
const AdmZip = require('adm-zip');

// "7,74" / "1 234,56" / "-29,5" -> Number ; vide -> 0
function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? 0 : n;
}

// "dd/mm/yy" ou "dd/mm/yyyy" -> 'AAAA-MM-JJ'
function frDate(v) {
    if (!v) return null;
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// CSV ';' latin1 -> tableau d'objets
function parseCsv(buffer) {
    const txt = buffer.toString('latin1');
    const rows = txt.split(/\r?\n/).filter(x => x.trim());
    if (!rows.length) return [];
    const header = rows[0].split(';').map(s => s.trim());
    return rows.slice(1).map(line => {
        const cells = line.split(';');
        const o = {};
        header.forEach((k, i) => { o[k] = (cells[i] || '').trim(); });
        return o;
    });
}

// Récupère tous les CSV (clé = nom logique) en explorant le ZIP et ses ZIP imbriqués.
function extractCsvs(buffer) {
    const csvs = {};
    const walk = (buf) => {
        const zip = new AdmZip(buf);
        for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue;
            const name = entry.entryName.split('/').pop();
            const data = entry.getData();
            if (/\.zip$/i.test(name)) walk(data);
            else if (/\.csv$/i.test(name)) {
                // nom logique : machevalier_synthese_1225.csv -> "synthese"
                const key = name.replace(/^[^_]*_/, '').replace(/_\d+\.csv$/i, '').replace(/\.csv$/i, '');
                csvs[key.toLowerCase()] = data;
            }
        }
    };
    walk(buffer);
    return csvs;
}

// Période de conso (1er jour du mois) déduite d'un champ "Période de consommation": "01/12/25 - 31/12/25"
function periodFromRows(rows) {
    for (const r of rows) {
        const p = r['Période de consommation'];
        if (p) {
            const start = frDate(p.split('-')[0].trim());
            if (start) return start.slice(0, 8) + '01'; // 1er du mois
        }
    }
    return null;
}

/**
 * Parse le buffer du ZIP SFR.
 * @returns { period, billing: [...lignes], trend: [...offres/mois], counts }
 */
function parseSfrZip(buffer) {
    const csvs = extractCsvs(buffer);
    if (!csvs.synthese) {
        throw new Error("Fichier 'synthese' introuvable dans le ZIP (export SFR attendu).");
    }

    const synthese = parseCsv(csvs.synthese);
    // Tolérance sur le nommage exact des fichiers (lmdetail / 13mois)
    const lmKey = Object.keys(csvs).find(k => k.includes('lmdetail'));
    const lm = lmKey ? parseCsv(csvs[lmKey]) : [];
    const trendKey = Object.keys(csvs).find(k => k.includes('13mois'));
    const trendRows = trendKey ? parseCsv(csvs[trendKey]) : [];

    // Index des métadonnées mobiles par numéro de ligne
    const mobileByLine = {};
    for (const r of lm) {
        const ln = (r['Ligne'] || '').trim();
        if (!ln) continue;
        mobileByLine[ln] = {
            user_name: r["Nom de l'utilisateur"] || '',
            plan: r['Abonnement en cours'] || '',
            resiliation: r['Résiliation'] || '',
            list_label: r['Libellé liste'] || '',
        };
    }

    const period = periodFromRows(lm) || periodFromRows(synthese) || null;

    const billing = [];
    for (const r of synthese) {
        const line_number = (r['N° ligne'] || '').trim();
        if (!line_number) continue;
        const mobName = (r['Nom associé à la ligne (mobile)'] || '').trim();
        const isMobileName = mobName && mobName.toLowerCase() !== 'null';
        const meta = mobileByLine[line_number] || {};
        billing.push({
            line_number,
            invoice_number: r['Numéro facture'] || '',
            invoice_date: frDate(r['Date facture']),
            org_id: r['Identifiant organisation'] || '',
            company: r['Raison sociale'] || '',
            contract_id: r['Identifiant contrat'] || '',
            cf_id: r['Identifiant CF'] || '',
            cf_label: r['Libellé CF'] || '',
            site_id: r['Identifiant site'] || '',
            site_name: r['Nom site'] || '',
            list_id: r['Identifiant liste'] || '',
            list_label: meta.list_label || r['Nom liste'] || '',
            mobile_name: isMobileName ? mobName : '',
            user_name: meta.user_name || '',
            plan: meta.plan || '',
            is_mobile: !!(isMobileName || meta.plan),
            resiliation: meta.resiliation || '',
            amt_subscriptions: num(r['Vos abonnements, options et services']),
            amt_other: num(r['Vos autres prestations']),
            amt_discounts: num(r['Vos remises spécifiques']),
            amt_third_party: num(r['Vos services facturés pour le compte de tiers']),
            amt_conso_autre: num(r['Montant de Vos consommations / Autre']),
            amt_contenu: num(r['Montant de Vos consommations / Contenu']),
            amt_data_fixe: num(r['Montant de Vos consommations / Data Fixe']),
            amt_data_mobile: num(r['Montant de Vos consommations / Data Mobile']),
            amt_voix_fixe: num(r['Montant de Vos consommations / Voix Fixe']),
            amt_voix_mobile: num(r['Montant de Vos consommations / Voix Mobile']),
            amt_total: num(r['Montant total']),
        });
    }

    // Tendance 13 mois : colonnes "12-25","11-25",... -> month 'AAAA-MM'
    const trend = [];
    if (trendRows.length) {
        const monthCols = Object.keys(trendRows[0]).filter(k => /^\d{1,2}-\d{2}$/.test(k));
        for (const r of trendRows) {
            for (const col of monthCols) {
                const [mm, yy] = col.split('-');
                const month = `20${yy}-${mm.padStart(2, '0')}`;
                trend.push({
                    category: r['LIB_CATEGORIE'] || '',
                    sub_category: r['LIB_SS_CATEGORIE'] || '',
                    offer: r['LIB_OFFRE'] || '',
                    month,
                    amount: num(r[col]),
                });
            }
        }
    }

    return {
        period,
        billing,
        trend,
        counts: { synthese: synthese.length, mobiles: lm.length, trendOffers: trendRows.length },
    };
}

module.exports = { parseSfrZip, num, frDate };
