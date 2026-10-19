const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// Génère le formulaire « Demande de modification budgétaire » (virement de crédits).
// Aucune écriture dans SEDIT : le document est produit à partir de la saisie.

const safe = (s) => String(s == null ? '' : s)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\xFF€]/g, '');

const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
};

// 3100 -> "3 100", 7668.5 -> "7 668,50"
function fmtNum(n) {
    const neg = n < 0;
    const abs = Math.abs(n);
    const [ent, dec] = abs.toFixed(2).split('.');
    const grouped = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + grouped + (dec === '00' ? '' : ',' + dec);
}
const fmtEuro = (n) => `${fmtNum(n)} €`;

function fmtDate(d) {
    const dt = d ? new Date(d) : new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function wrap(font, text, size, maxWidth) {
    const out = [];
    for (const para of safe(text).split(/\r?\n/)) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const test = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
            else { if (line) out.push(line); line = word; }
        }
        out.push(line);
    }
    return out;
}

async function buildVirementCreditsPdf(p) {
    const majorer = (p.majorer || []).filter(l => num(l.montant) > 0);
    const minorer = (p.minorer || []).filter(l => num(l.montant) > 0);
    const totalMaj = majorer.reduce((s, l) => s + num(l.montant), 0);
    const totalMin = minorer.reduce((s, l) => s + num(l.montant), 0);
    const compense = p.compense !== false;
    const isRecette = p.sens === 'R';
    const isInvest = p.section === 'I';

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 50;
    const black = rgb(0, 0, 0), grey = rgb(0.4, 0.4, 0.4), light = rgb(0.85, 0.85, 0.85);

    let page, y, pageNo = 0;
    const newPage = () => {
        page = pdf.addPage([W, H]);
        pageNo += 1;
        y = H - M;
        const t = `- ${pageNo} -`;
        page.drawText(t, { x: (W - font.widthOfTextAtSize(t, 9)) / 2, y: 25, size: 9, font, color: grey });
    };
    const text = (t, x, yy, o = {}) => page.drawText(safe(t), { x, y: yy, size: o.size || 10, font: o.bold ? bold : font, color: o.color || black });
    const box = (x, yy, w, h, o = {}) => page.drawRectangle({
        x, y: yy, width: w, height: h, borderColor: black, borderWidth: o.bw ?? 0.8, color: o.fill,
    });
    const checkbox = (x, yy, checked, label) => {
        box(x, yy - 1, 9, 9, { bw: 0.7 });
        if (checked) {
            page.drawLine({ start: { x: x + 1.5, y: yy + 0.5 }, end: { x: x + 7.5, y: yy + 6.5 }, thickness: 1.2, color: black });
            page.drawLine({ start: { x: x + 1.5, y: yy + 6.5 }, end: { x: x + 7.5, y: yy + 0.5 }, thickness: 1.2, color: black });
        }
        text(label, x + 15, yy, { size: 9.5 });
    };

    // ---------------- Page 1 ----------------
    newPage();
    const title = 'DEMANDE DE MODIFICATION BUDGETAIRE';
    text(title, (W - bold.widthOfTextAtSize(title, 15)) / 2, y - 10, { bold: true, size: 15 });
    y -= 40;

    for (const [label, val] of [
        ['Direction :', p.direction], ['Service :', p.service],
        ['Date de la demande :', fmtDate(p.date)], ['Personne contact :', p.contact],
    ]) {
        text(label, M, y, { bold: true });
        text(val || '', M + bold.widthOfTextAtSize(label, 10) + 6, y);
        y -= 16;
    }

    y -= 10;
    text('TYPE DE DEMANDE', M, y, { bold: true });
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: M + bold.widthOfTextAtSize('TYPE DE DEMANDE', 10), y: y - 2 }, thickness: 0.8, color: black });
    y -= 18;
    const c2 = M + 285;
    // « Demande de crédits supplémentaires » : demande non compensée (majoration seule).
    checkbox(M, y, !compense && majorer.length > 0, 'Demande de crédits nouveaux ou supplémentaires');
    checkbox(c2, y, !isRecette, 'Dépenses');
    y -= 18;
    checkbox(M, y, !compense && majorer.length === 0 && minorer.length > 0, 'Abandon de crédits');
    checkbox(c2, y, isRecette, 'Recettes');
    y -= 18;
    checkbox(M, y, compense, 'Demande compensée');
    checkbox(c2, y, isInvest, 'Investissement');
    y -= 18;
    checkbox(c2, y, !isInvest, 'Fonctionnement');

    y -= 24;
    const detail = majorer.length > 1
        ? `${majorer.map(l => fmtNum(num(l.montant))).join('+')}= ${fmtNum(totalMaj)}€`
        : `${fmtNum(totalMaj)}€`;
    text('Montant de la demande :', M, y, { bold: true });
    text(detail, M + bold.widthOfTextAtSize('Montant de la demande :', 10) + 6, y);

    y -= 24;
    text('Activité / Projet / Opération impacté :', M, y, { bold: true });
    const actLines = wrap(font, p.activite || '', 10, W - 2 * M);
    y -= 14;
    for (const l of actLines) { if (l) text(l, M, y); y -= 14; }

    y -= 8;
    text('Motivation de la demande :', M, y, { bold: true });
    y -= 16;
    const motLines = wrap(font, p.motivation || '', 10, W - 2 * M);
    for (const l of motLines) {
        if (y < 425) break;
        text(l, M, y); y -= 14;
    }

    // Blocs d'avis (Date / Nom et Signature)
    const avis = [
        'Avis du responsable de service', 'Avis de la direction',
        'Avis de la direction des services financiers', 'Avis de la direction générale',
        'Avis de l’élu (e) de secteur', 'Avis de l’élue aux finances',
    ];
    const rowH = 52, labelW = 200;
    const drawAvisHeader = () => {
        text('Date', M + labelW + 8, y - 11, { bold: true, size: 9.5 });
        text('Nom et Signature', M + labelW + 90, y - 11, { bold: true, size: 9.5 });
        y -= 18;
    };
    const drawAvis = (label) => {
        box(M, y - rowH, W - 2 * M, rowH);
        page.drawLine({ start: { x: M + labelW, y }, end: { x: M + labelW, y: y - rowH }, thickness: 0.8, color: black });
        page.drawLine({ start: { x: M + labelW + 82, y }, end: { x: M + labelW + 82, y: y - rowH }, thickness: 0.8, color: black });
        text(label, M + 6, y - 14, { bold: true, size: 9.5 });
        y -= rowH + 6;
    };
    y = 410;
    drawAvisHeader();
    avis.forEach(drawAvis);

    // ---------------- Page 2 ----------------
    newPage();



    y -= 14;
    const bandTitle = 'PARTIE RESERVEE A L’ADMINISTRATION - A COMPLETER PAR LE SERVICE DEMANDEUR';
    box(M, y - 18, W - 2 * M, 18, { fill: light });
    text(bandTitle, M + 6, y - 13, { bold: true, size: 9 });
    y -= 30;

    // Tableau des imputations
    const colLine = M, wLine = 270, wMaj = 100, wMin = 100;
    const xMaj = colLine + wLine, xMin = xMaj + wMaj;
    const tableW = wLine + wMaj + wMin;
    box(colLine, y - 22, tableW, 22, { fill: light });
    page.drawLine({ start: { x: xMaj, y }, end: { x: xMaj, y: y - 22 }, thickness: 0.8, color: black });
    page.drawLine({ start: { x: xMin, y }, end: { x: xMin, y: y - 22 }, thickness: 0.8, color: black });
    text('Montant à majorer (+)', xMaj + 5, y - 14, { bold: true, size: 8.5 });
    text('Montant à minorer (-)', xMin + 5, y - 14, { bold: true, size: 8.5 });
    y -= 22;

    const blockH = 108;
    const slots = [
        ...majorer.map(l => ({ l, kind: '+' })),
        ...minorer.map(l => ({ l, kind: '-' })),
    ];
    while (slots.length < 4) slots.push(null);

    for (const s of slots) {
        if (y - blockH < 40) { newPage(); }
        const top = y;
        box(colLine, top - blockH, tableW, blockH);
        page.drawLine({ start: { x: xMaj, y: top }, end: { x: xMaj, y: top - blockH }, thickness: 0.8, color: black });
        page.drawLine({ start: { x: xMin, y: top }, end: { x: xMin, y: top - blockH }, thickness: 0.8, color: black });
        const l = (s && s.l) || {};
        let ty = top - 13;
        text('Ligne budgétaire impactée', colLine + 5, ty, { bold: true, size: 9 });
        ty -= 12;
        text('Imputation :', colLine + 5, ty, { size: 9 }); ty -= 12;
        for (const [k, v] of [
            ['Chapitre :', l.chapitre], ['Fonction :', l.fonction], ['Nature :', l.nature],
            ['Equipement :', l.equipement], ['Opération :', l.operation],
        ]) {
            text(k, colLine + 5, ty, { size: 9 });
            text(v || '', colLine + 75, ty, { size: 9 });
            ty -= 11;
        }
        text('Activité / Projet :', colLine + 5, ty, { size: 9 });
        text(l.activite || '', colLine + 85, ty, { size: 9 });
        if (s && l.avant != null && l.apres != null) {
            const info = `Disponible : ${fmtNum(num(l.avant))} > ${fmtNum(num(l.apres))}`;
            text(info, colLine + 150, top - 13 - 12, { size: 7.5, color: grey });
        }
        if (s) {
            const txt = fmtNum(num(l.montant));
            const x = s.kind === '+' ? xMaj : xMin;
            text(txt, x + 5, top - 40, { bold: true, size: 11 });
        }
        y -= blockH;
    }

    return Buffer.from(await pdf.save());
}

module.exports = { buildVirementCreditsPdf };
