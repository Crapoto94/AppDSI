/**
 * Extraction du détail PAR LIGNE d'une facture SFR Business à partir de ses PDF dans Sedit
 * (annexes « Votre détail par compte client »). Remplace l'import manuel du ZIP d'export SFR :
 * mêmes données dans hub_telecom.line_billing (abonnements, remises, consommations, total HT par
 * ligne) mais alimentées par les factures déjà présentes dans Sedit.
 *
 * Structure d'un bloc ligne dans le texte du PDF :
 *   Référence :06.01.08.07.54            (ou un libellé de site pour les abonnements de site)
 *   Utilisateur :M. TUIL Steve           (mobiles)
 *   Liste :DEP                           (mobiles : direction / service)
 *   Vos abonnements, options et services du 01/10/2026 au 31/10/2026
 *   Forfait Mobile Eco 1Go120,00 ...     (offre, quantité, prix unitaire glués)
 *   Remise sur abonnement (96,00%de 20,00€ HT)1-19,2020,00%-19,20
 *   Total de vos abonnements, options et services0,80
 *   Vos consommations facturées du 01/09/2026 au 30/09/2026
 *   Total de vos consommations0,00
 *   MONTANT TOTAL HT0,80
 * précédé d'un en-tête de site : « NOM / VILLE231987803D462,47 €HT ».
 */

function toNum(s) {
    if (s === null || s === undefined) return 0;
    const t = String(s).replace(/[\s ]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
}

const AMOUNT = '(-?[\\d\\s\\u00a0]*\\d,\\d{2})';
const SITE_RE = new RegExp(`^(.*?)\\s*(?:\\(Suite\\))?(\\d{9}[0-9A-Z])\\s*${AMOUNT}\\s*€\\s*HT\\.?\\s*$`);
const RE_TOTAL_ABO = new RegExp(`^Total de vos abonnements, options et services\\s*${AMOUNT}\\s*$`, 'i');
const RE_TOTAL_CONSO = new RegExp(`^Total de vos consommations\\s*${AMOUNT}\\s*$`, 'i');
const RE_TOTAL_HT = new RegExp(`^MONTANT TOTAL HT\\s*${AMOUNT}\\s*$`);
const RE_REMISE = /^Remise.*?(-[\d\s ]*\d,\d{2})\s*$/i;
const NOISE = /^(Nombre|Prix|unitaire|TVA|Total|EUR HT|d'appels|Quantité|facturée|\d+[\d,.%\s-]*$|Vos |Votre |Date facture|N° de |Veuillez|SFR,|\d+\/\d+$|ESPLANADE|\d{5} )/i;

function cleanPlan(raw) {
    // « Forfait Mobile Eco 1Go120,00 » -> « Forfait Mobile Eco 1Go » (quantité et prix glués en fin de ligne)
    return String(raw || '').replace(/\s*[\d\s.,%-]*$/, '').replace(/\s+/g, ' ').trim();
}

function normalizeRef(ref) {
    const t = String(ref || '').trim();
    if (/^[\d.\s]{8,}$/.test(t)) return t.replace(/\D/g, '');
    return t.replace(/\s+/g, ' ').toUpperCase();
}

/** Découpe le texte d'un PDF de détail SFR en lignes facturées. */
function parseSfrDetailText(text) {
    const lines = String(text || '').split(/\n/).map(l => l.trim());
    const out = { invoice_number: null, invoice_date: null, lines: [] };
    let site = { name: '', id: '' };
    let account = '';
    let cur = null;
    let mode = null;

    const closeBlock = () => { cur = null; mode = null; };

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l) continue;

        let m;
        if ((m = l.match(/^N° de facture\s*:\s*(\S+)/))) { out.invoice_number = out.invoice_number || m[1]; continue; }
        if ((m = l.match(/^Date facture\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/))) { out.invoice_date = out.invoice_date || `${m[3]}-${m[2]}-${m[1]}`; continue; }
        if ((m = l.match(/^N° de compte de facturation\s*:\s*([\d\s]*\d\w?)/))) { account = m[1].replace(/\s+/g, ''); continue; }

        // En-tête de site / sous-compte
        if ((m = l.match(SITE_RE)) && /€\s*HT/.test(l)) {
            const name = m[1].split(' / ')[0].replace(/\s*\(Suite\)\s*$/, '').trim();
            site = { name: name || site.name, id: m[2] };
            continue;
        }

        if ((m = l.match(/^Référence\s*:\s*(.*)$/))) {
            let ref = m[1].trim();
            // libellé de site réparti sur 2 lignes (« Référence :MAIRIE D'IVRY » / « SUR SEINE »)
            if (!/^[\d.\s]{8,}$/.test(ref)) {
                const next = lines[i + 1] || '';
                if (next && !NOISE.test(next) && !/^(Utilisateur|Liste)\s*:/.test(next)) { ref = `${ref} ${next}`; i++; }
            }
            cur = {
                ref: normalizeRef(ref), site_name: site.name, site_id: site.id, account,
                user: '', liste: '', plan: '', abo_net: 0, remises: 0, conso: 0, total: null,
            };
            mode = 'ref';
            continue;
        }
        if (!cur) continue;

        if (/^Utilisateur\s*:/.test(l)) {
            const parts = [l.replace(/^Utilisateur\s*:\s*/, '')];
            while (i + 1 < lines.length && !/^(Liste\s*:|Nombre|Prix|Vos )/.test(lines[i + 1]) && parts.length < 4) parts.push(lines[++i]);
            cur.user = parts.join(' ').replace(/\s+/g, ' ').trim();
            continue;
        }
        if (/^Liste\s*:/.test(l)) {
            const parts = [l.replace(/^Liste\s*:\s*/, '')];
            while (i + 1 < lines.length && !/^(Nombre|Prix|Vos )/.test(lines[i + 1]) && parts.length < 3) parts.push(lines[++i]);
            cur.liste = parts.join(' ').replace(/\s+/g, ' ').trim();
            continue;
        }
        if (/^Vos abonnements, options et services/i.test(l)) { mode = 'abo'; continue; }
        if (/^Vos consommations facturées/i.test(l)) { mode = 'conso'; continue; }
        if (/^Vos (autres prestations|services fournis)/i.test(l)) { mode = 'other'; continue; }

        if ((m = l.match(RE_TOTAL_ABO))) { cur.abo_net = toNum(m[1]); continue; }
        if ((m = l.match(RE_TOTAL_CONSO))) { cur.conso = toNum(m[1]); continue; }
        if ((m = l.match(RE_TOTAL_HT))) {
            cur.total = toNum(m[1]);
            out.lines.push(cur);
            closeBlock();
            continue;
        }
        if (mode === 'abo') {
            if ((m = l.match(RE_REMISE))) { cur.remises += toNum(m[1]); continue; }
            if (!cur.plan && !NOISE.test(l)) cur.plan = cleanPlan(l);
        }
    }
    return out;
}

module.exports = { parseSfrDetailText, toNum, normalizeRef };
