/**
 * Analyse automatique des factures télécom à partir des pièces jointes PDF de Sedit.
 *
 * Pour chaque facture télécom rattachée à une facture Sedit (n° interne F2600xxxx), on liste ses
 * pièces jointes (FI.FACTURE -> FIPES_OBJ_PJ -> PJ_PES) et on ne garde que les PDF « facture »
 * (FAC…, PJ00FAC…, PJ01FAC… : mêmes règles que classifyDocument côté Finance). Sedit peut porter
 * plusieurs versions de la même facture (une synthétique, une détaillée) : on analyse la PLUS
 * GROSSE (taille Sedit), qui est la version détaillée. On en extrait montants HT / TVA / TTC,
 * période, abonnements / consommations lorsque l'opérateur les isole, puis on contrôle le TTC lu
 * dans le PDF contre le montant de la facture dans Sedit.
 *
 * Les gabarits PDF diffèrent selon l'opérateur : l'extraction est donc « au mieux » (champs
 * facultatifs) et le contrôle de cohérence avec le montant Sedit sert de garde-fou.
 */
const pdf = require('pdf-parse');
const { pool } = require('../../shared/database');
const financeShare = require('../finance/finance-share.controller');
const smb = require('../../shared/smb_client');
const { parseSfrDetailText } = require('./telecom.sfr-pdf');

let tableReady = false;
let running = false;

async function ensureTable() {
    if (tableReady) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS hub_telecom.invoice_analysis (
        invoice_id integer PRIMARY KEY,
        sedit_numero text,
        status text,
        doc_id text, doc_name text, doc_size_kb integer, docs_count integer,
        pages integer,
        period_start date, period_end date,
        account_ref text,
        amount_ht numeric, amount_tva numeric, amount_ttc numeric,
        amount_abonnements numeric, amount_consommations numeric,
        sedit_amount numeric, ecart numeric,
        error text,
        analysed_at timestamp DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query('ALTER TABLE hub_telecom.invoice_analysis ADD COLUMN IF NOT EXISTS lines_count integer');
    await pool.query('ALTER TABLE hub_telecom.invoice_analysis ADD COLUMN IF NOT EXISTS lines_total_ht numeric');
    tableReady = true;
}

/** Prédicat SQL (alias `ri`) : facture rapprochée à un engagement de nature 6262. */
const IN_6262_SQL = `EXISTS (
    SELECT 1 FROM unnest(string_to_array(ri.engagement, ',')) AS c(v)
    WHERE TRIM(c.v) IN (SELECT commitment_number FROM hub_telecom.sedit_engagements_6262))`;

// --------------------------------------------------------------------------- choix du document
const FACTURE_RE = /^(PJ\d+X?)?FAC/i;

/** PDF « facture » de plus grande taille (version détaillée) parmi les pièces jointes Sedit. */
function pickLargestInvoiceDoc(docs) {
    const cands = (docs || []).filter(d => FACTURE_RE.test(String(d.NOM_PJ || '').trim()) && /\.pdf$/i.test(String(d.NOM_PJ || '').trim()));
    cands.sort((a, b) => (Number(b.TAILLE) || 0) - (Number(a.TAILLE) || 0) || (Number(b.PRINCIPAL) || 0) - (Number(a.PRINCIPAL) || 0));
    return { doc: cands[0] || null, count: cands.length };
}

// --------------------------------------------------------------------------- extraction texte
const NUM = '(-?\\d{1,3}(?:[\\s\\u00a0.]\\d{3})*[.,]\\d{1,2}|-?\\d+[.,]\\d{1,2}|-?\\d+)';
const NUM_DEC = '(-?\\d{1,3}(?:[\\s\\u00a0.]\\d{3})*[.,]\\d{1,2}|-?\\d+[.,]\\d{1,2})';

function toNumber(s) {
    if (s === null || s === undefined) return null;
    let t = String(s).replace(/[\s ]/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}

/** Premier nombre juste APRÈS le libellé (même ligne), sinon juste AVANT (« 24,00 € Montant TTC »). */
function amountNear(text, labelRe, decimalsOnly = false) {
    // décimales obligatoires pour les rubriques (évite de prendre une quantité « 1 » pour un montant)
    const N = decimalsOnly ? NUM_DEC : NUM;
    const after = new RegExp(`(?:${labelRe.source})[^\\d\\n-]{0,30}${N}`, 'i');
    const m = text.match(after);
    if (m) return toNumber(m[m.length - 1]);
    const before = new RegExp(`${N}\\s*(?:€|EUR)?\\s*(?:${labelRe.source})`, 'i');
    const b = text.match(before);
    return b ? toNumber(b[1]) : null;
}

function frDate(s) {
    const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return null;
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2]}-${m[1]}`;
}

function extractFromText(text, seditAmount) {
    const out = { ht: null, tva: null, ttc: null, abonnements: null, consommations: null, period_start: null, period_end: null, account_ref: null };

    out.ttc = amountNear(text, /(?:montant\s+total\s+ttc|total\s+ttc|montant\s+ttc(?:\s+[àa]\s+r[ée]gler|\s+en\s+€)?|somme\s+[àa]\s+payer\s*\(EUR\s*TTC\)|net\s+[àa]\s+payer(?:\s*\(\s*EUR\s*\))?)/);
    out.ht = amountNear(text, /(?:montant\s+total\s+ht|total\s+facture\s*\(EUR\s*HT\)|total\s+lignes\s+ht|total\s+ht(?:\s*\(\s*EUR\s*\))?)/);
    out.tva = amountNear(text, /(?:montant\s+total\s+tva(?:\s*\([^)]*\))?|montant\s+tva(?:\s+[àa]\s+[\d,.]+\s*%\s+sur\s+[\d,.]+\s*EUR\s*=)?|total\s+taxes(?:\s*\(\s*EUR\s*\))?)/);
    if (out.tva === null && out.ht !== null && out.ttc !== null) out.tva = Math.round((out.ttc - out.ht) * 100) / 100;
    if (out.ttc === null && out.ht !== null && out.tva !== null) out.ttc = Math.round((out.ht + out.tva) * 100) / 100;
    if (out.ht === null && out.ttc !== null && out.tva !== null) out.ht = Math.round((out.ttc - out.tva) * 100) / 100;

    out.abonnements = amountNear(text, /(?:total\s+de\s+vos\s+abonnements[^\n\d]*|abonnements\s+et\s+options|abonnements\s+ht)/, true);
    out.consommations = amountNear(text, /(?:total\s+de\s+vos\s+consommations|consommations\s*\(hors[^)]*\)|consommations\s+ht)/, true);

    const p = text.match(/du\s+(\d{2}\/\d{2}\/\d{2,4})\s+au\s+(\d{2}\/\d{2}\/\d{2,4})/i);
    if (p) { out.period_start = frDate(p[1]); out.period_end = frDate(p[2]); }

    const acc = text.match(/(?:n°\s*de\s*compte(?:\s*de\s*facturation)?|compte\s*client|no\s*compte\s*client)\s*[:\s]*([0-9][0-9A-Za-z.\s]{3,18})/i);
    if (acc) out.account_ref = acc[1].replace(/\s+/g, ' ').trim().slice(0, 30);

    // Repli : le montant Sedit apparaît-il tel quel dans le PDF ? (formats 6,24 / 6.24 / 1 234,56)
    out.sedit_found = false;
    if (seditAmount !== null && seditAmount !== undefined && Number.isFinite(Number(seditAmount))) {
        const a = Number(seditAmount).toFixed(2);
        const [int, dec] = a.split('.');
        const intSpaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u00a0.]?');
        out.sedit_found = new RegExp(`(?<![\\d])${intSpaced}[.,]${dec}(?!\\d)`).test(text);
    }
    return out;
}

// --------------------------------------------------------------------------- analyse d'une facture
async function analyseInvoice(inv) {
    await ensureTable();
    const base = { invoice_id: inv.id, sedit_numero: inv.sedit_numero || null, sedit_amount: inv.amount_ttc != null ? Number(inv.amount_ttc) : null };
    const save = async (r) => {
        const row = { ...base, ...r };
        await pool.query(`
            INSERT INTO hub_telecom.invoice_analysis
              (invoice_id, sedit_numero, status, doc_id, doc_name, doc_size_kb, docs_count, pages, period_start, period_end, account_ref,
               amount_ht, amount_tva, amount_ttc, amount_abonnements, amount_consommations, sedit_amount, ecart, error, analysed_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,CURRENT_TIMESTAMP)
            ON CONFLICT (invoice_id) DO UPDATE SET
              sedit_numero=$2, status=$3, doc_id=$4, doc_name=$5, doc_size_kb=$6, docs_count=$7, pages=$8, period_start=$9, period_end=$10, account_ref=$11,
              amount_ht=$12, amount_tva=$13, amount_ttc=$14, amount_abonnements=$15, amount_consommations=$16, sedit_amount=$17, ecart=$18, error=$19, analysed_at=CURRENT_TIMESTAMP
        `, [row.invoice_id, row.sedit_numero, row.status, row.doc_id || null, row.doc_name || null, row.doc_size_kb ?? null, row.docs_count ?? null, row.pages ?? null,
            row.period_start || null, row.period_end || null, row.account_ref || null, row.ht ?? null, row.tva ?? null, row.ttc ?? null,
            row.abonnements ?? null, row.consommations ?? null, row.sedit_amount ?? null, row.ecart ?? null, row.error || null]);
        if (row.lines_count !== undefined) {
            await pool.query('UPDATE hub_telecom.invoice_analysis SET lines_count = $2, lines_total_ht = $3 WHERE invoice_id = $1', [row.invoice_id, row.lines_count, row.lines_total_ht]);
        }
    };

    if (!inv.sedit_numero) { await save({ status: 'sans_facture_sedit' }); return; }
    try {
        const docs = await financeShare.queryFactureDocuments(String(inv.sedit_numero).trim());
        const { doc, count } = pickLargestInvoiceDoc(docs);
        if (!doc) { await save({ status: 'sans_pdf', docs_count: 0 }); return; }

        const config = await financeShare.resolveShareConfig();
        const buffer = await smb.readFileRel(config, financeShare.toRelativePath(config, doc.CHEMIN_FICHIER));
        if (!buffer) { await save({ status: 'erreur', doc_id: doc.DOC_ID, doc_name: doc.NOM_PJ, docs_count: count, error: 'Fichier introuvable ou accès refusé' }); return; }

        const parsed = await pdf(buffer);
        const text = parsed.text || '';
        if (text.replace(/\s/g, '').length < 50) {
            await save({ status: 'illisible', doc_id: doc.DOC_ID, doc_name: doc.NOM_PJ, doc_size_kb: doc.TAILLE, docs_count: count, pages: parsed.numpages, error: 'PDF sans texte exploitable (scan ?)' });
            return;
        }
        const x = extractFromText(text, base.sedit_amount);
        // La version la plus détaillée (annexes SFR « détail par compte »…) ne porte pas toujours les
        // totaux de la facture : on les complète depuis la facture principale (page de synthèse).
        {
            const main = (docs || []).find(d => Number(d.PRINCIPAL) === 1 && /\.pdf$/i.test(String(d.NOM_PJ || '').trim()) && d.DOC_ID !== doc.DOC_ID);
            if (main) {
                try {
                    const mb = await smb.readFileRel(config, financeShare.toRelativePath(config, main.CHEMIN_FICHIER));
                    const mx = mb ? extractFromText((await pdf(mb)).text || '', base.sedit_amount) : null;
                    if (mx) {
                        // Les totaux de la facture principale font foi (le détail ne donne que des sous-totaux par ligne/compte)
                        for (const k of ['ttc', 'ht', 'tva']) if (mx[k] !== null && mx[k] !== undefined) x[k] = mx[k];
                        for (const k of ['period_start', 'period_end', 'account_ref', 'abonnements', 'consommations']) if (x[k] === null || x[k] === undefined) x[k] = mx[k];
                        x.sedit_found = x.sedit_found || mx.sedit_found;
                        if (x.ttc !== null && x.ht !== null && x.tva === null) x.tva = Math.round((x.ttc - x.ht) * 100) / 100;
                    }
                } catch (e) { /* le détail seul sert alors de base */ }
            }
        }
        const ttc = x.ttc;
        const seditAmount = base.sedit_amount;
        let status = 'ok';
        let ecart = null;
        if (seditAmount !== null) {
            if (ttc !== null) {
                ecart = Math.round((ttc - seditAmount) * 100) / 100;
                if (Math.abs(ecart) > 0.02) status = x.sedit_found ? 'ok' : 'ecart';
            } else if (!x.sedit_found) {
                status = 'a_verifier';
            }
        }
        let linesInfo = {};
        if (/^SFR/i.test(String(inv.operator_name || ''))) {
            linesInfo = await importSfrLines(inv, docs, config).catch(e => { console.error('[Telecom] Lignes SFR :', e.message); return {}; });
        }
        await save({
            lines_count: linesInfo.count ?? null, lines_total_ht: linesInfo.totalHt ?? null,
            status, doc_id: doc.DOC_ID, doc_name: doc.NOM_PJ, doc_size_kb: doc.TAILLE, docs_count: count, pages: parsed.numpages,
            period_start: x.period_start, period_end: x.period_end, account_ref: x.account_ref,
            ht: x.ht, tva: x.tva, ttc, abonnements: x.abonnements, consommations: x.consommations, ecart,
        });
    } catch (e) {
        await save({ status: 'erreur', error: String(e.message || e).slice(0, 300) });
    }
}

// --------------------------------------------------------------------------- détail par ligne SFR
/**
 * Détail par ligne d'une facture SFR lu dans ses PDF Sedit et écrit dans hub_telecom.line_billing
 * (remplace l'import du ZIP d'export). Le PDF de détail est celui qui contient les blocs « Référence : »
 * (annexe « détail par compte client ») : on lit les PDF facture du plus gros au plus petit et on garde
 * celui qui livre le plus de lignes. Période = mois précédant la date de facture (mois de consommation).
 * Les lignes déjà présentes pour la même facture (import ZIP) sont remplacées.
 */
async function importSfrLines(inv, docs, config) {
    const cands = (docs || []).filter(d => FACTURE_RE.test(String(d.NOM_PJ || '').trim()) && /\.pdf$/i.test(String(d.NOM_PJ || '').trim()))
        .sort((a, b) => (Number(b.TAILLE) || 0) - (Number(a.TAILLE) || 0));
    let best = null;
    for (const d of cands) {
        const buf = await smb.readFileRel(config, financeShare.toRelativePath(config, d.CHEMIN_FICHIER));
        if (!buf) continue;
        const parsed = parseSfrDetailText((await pdf(buf)).text || '');
        if (parsed.lines.length && (!best || parsed.lines.length > best.parsed.lines.length)) best = { parsed, doc: d };
    }
    if (!best) return { count: 0, totalHt: 0 };

    const { parsed, doc } = best;
    const invoiceNumber = parsed.invoice_number || inv.invoice_number;
    const invDate = parsed.invoice_date;
    if (!invDate) return { count: 0, totalHt: 0 };
    const dt = new Date(`${invDate}T00:00:00Z`);
    const period = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM hub_telecom.line_billing WHERE invoice_number = $1', [invoiceNumber]);
        let total = 0;
        for (const l of parsed.lines) {
            const isNumber = /^\d{8,}$/.test(l.ref);
            const lineNumber = isNumber ? l.ref : `${l.ref} · ${l.site_id}`;
            const isMobile = /^0[67]\d{8}$/.test(l.ref) || /mobile|forfait/i.test(l.plan || '');
            const abo = n2(l.abo_net - l.remises); // brut avant remises ; remises (négatives) à part
            const other = n2((l.total || 0) - l.abo_net - l.conso);
            total += l.total || 0;
            await client.query(`
                INSERT INTO hub_telecom.line_billing
                  (period, invoice_number, invoice_date, org_id, company, contract_id, cf_id, cf_label, site_id, site_name,
                   list_id, list_label, line_number, mobile_name, user_name, plan, is_mobile, resiliation,
                   amt_subscriptions, amt_other, amt_discounts, amt_third_party, amt_voix_fixe, amt_voix_mobile,
                   amt_data_fixe, amt_data_mobile, amt_conso_autre, amt_contenu, amt_total, conso_voix, conso_data, source_file)
                VALUES ($1,$2,$3,'','COMMUNE D IVRY SUR SEINE','',$4,$5,$6,$7,'',$8,$9,'',$10,$11,$12,'',
                        $13,$14,$15,0,0,0,0,0,$16,0,$17,0,0,$18)
                ON CONFLICT (period, line_number, cf_id) DO UPDATE SET
                  invoice_number=$2, invoice_date=$3, cf_label=$5, site_id=$6, site_name=$7, list_label=$8, user_name=$10, plan=$11,
                  is_mobile=$12, amt_subscriptions=$13, amt_other=$14, amt_discounts=$15, amt_conso_autre=$16, amt_total=$17,
                  source_file=$18, imported_at=NOW()
            `, [period, invoiceNumber, invDate, l.account || '', l.site_name || '', l.site_id || '', l.site_name || '', l.liste || '',
                lineNumber, l.user || '', l.plan || '', isMobile, abo, other > 0.004 ? other : 0, n2(l.remises), n2(l.conso), n2(l.total),
                `sedit:${doc.NOM_PJ}`]);
        }
        await client.query('COMMIT');
        return { count: parsed.lines.length, totalHt: n2(total) };
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
    } finally {
        client.release();
    }
}

// --------------------------------------------------------------------------- orchestration
async function pendingInvoices(limit, force) {
    const { RESOLVED_INVOICES_SQL } = require('./telecom.controller');
    const r = await pool.query(`
        SELECT ri.id, ri.sedit_numero, ri.amount_ttc, ri.invoice_number, ri.operator_id, o.name AS operator_name
        FROM (${RESOLVED_INVOICES_SQL}) ri
        JOIN hub_telecom.operators o ON o.id = ri.operator_id
        LEFT JOIN hub_telecom.invoice_analysis an ON an.invoice_id = ri.id
        WHERE ri.sedit_numero IS NOT NULL AND ${IN_6262_SQL}
          ${force ? '' : `AND (an.invoice_id IS NULL OR (an.status IN ('erreur') AND an.analysed_at < NOW() - INTERVAL '1 hour')
                 OR an.sedit_amount IS DISTINCT FROM ri.amount_ttc::numeric)`}
        ORDER BY ri.invoice_date DESC NULLS LAST
        LIMIT $1`, [limit]);
    return r.rows;
}

/** Analyse (séquentielle, en tâche de fond) les factures pas encore analysées. */
async function analysePending({ limit = 20, force = false } = {}) {
    if (running) return { started: false, reason: 'déjà en cours' };
    running = true;
    try {
        await ensureTable();
        const list = await pendingInvoices(limit, force);
        for (const inv of list) await analyseInvoice(inv);
        if (list.length) console.log(`[Telecom] ${list.length} facture(s) analysée(s) depuis les PDF Sedit`);
        return { started: true, analysed: list.length };
    } finally {
        running = false;
    }
}

function isRunning() { return running; }

module.exports = { IN_6262_SQL, analysePending, analyseInvoice, pickLargestInvoiceDoc, extractFromText, ensureTable, isRunning };
