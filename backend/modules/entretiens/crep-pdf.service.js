/**
 * Génération du PDF du compte-rendu d'entretien professionnel (4 pages A4),
 * reflet du document Excel « CREP catégories A et B » de la DRH.
 * Mise en page fixe : un texte trop long réduit sa taille de police (jusqu'à un minimum) puis est tronqué.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { LEVELS, normalizeCrep, definitionFor, groupsOf } = require('./crep.definition');

const W = 595.28;
const H = 841.89;
const MX = 30;               // marge gauche/droite
const CW = W - 2 * MX;       // largeur utile
const BLACK = rgb(0, 0, 0);
const GREY_LINE = rgb(0.6, 0.6, 0.6);
const GREY_FILL = rgb(0.85, 0.85, 0.85);
const BEIGE = rgb(0.83, 0.82, 0.78);

const pad2 = (n) => String(n).padStart(2, '0');
function fmtDate(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
        // instant → date du jour à Paris
        const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(v);
        return p;
    }
    const s = String(v || '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

async function buildCrepPdf(entretien, annee) {
    let cdef = null;
    try { cdef = definitionFor(await require('../ep-base/ep-base.service').modeleOfEntretien(entretien)); } catch (e) { /* grille par défaut */ }
    const crep = normalizeCrep(entretien.crep, cdef);
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Compte-rendu d'entretien professionnel ${annee || ''}`.trim());
    pdf.setAuthor('DSI Hub - Ville d\'Ivry-sur-Seine');
    const F = {
        // Police sans empattement (équivalent Arial/Calibri). Helvetica est un peu plus large que Calibri : K ajuste les tailles.
        r: await pdf.embedFont(StandardFonts.Helvetica),
        b: await pdf.embedFont(StandardFonts.HelveticaBold),
        i: await pdf.embedFont(StandardFonts.HelveticaOblique),
        bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };

    let logo = null;
    try { logo = await pdf.embedPng(fs.readFileSync(path.join(__dirname, 'assets', 'logo-ivry.png'))); } catch (e) { /* logo facultatif */ }

    // ── Utilitaires de dessin (coordonnées « top » mesurées depuis le haut de la page) ──
    const safe = (font, text) => {
        let out = '';
        for (const ch of String(text ?? '').replace(/ /g, ' ').replace(/\t/g, ' ').replace(/\r/g, '')) {
            if (ch === '\n') { out += ch; continue; }
            try { font.encodeText(ch); out += ch; } catch (e) { out += '?'; }
        }
        return out;
    };
    const K = 0.92;
    const widthOf = (font, size, t) => font.widthOfTextAtSize(t, size * K);

    function wrap(font, size, text, maxW) {
        const lines = [];
        for (const para of safe(font, text).split('\n')) {
            if (para.trim() === '') { lines.push(''); continue; }
            let line = '';
            for (const word of para.split(' ')) {
                const test = line ? `${line} ${word}` : word;
                if (widthOf(font, size, test) <= maxW) { line = test; continue; }
                if (line) lines.push(line);
                // mot plus long que la ligne : coupe brutale
                let w = word;
                while (widthOf(font, size, w) > maxW && w.length > 1) {
                    let cut = w.length - 1;
                    while (cut > 1 && widthOf(font, size, w.slice(0, cut)) > maxW) cut--;
                    lines.push(w.slice(0, cut));
                    w = w.slice(cut);
                }
                line = w;
            }
            lines.push(line);
        }
        return lines;
    }

    const draw = (page, text, x, top, { font = F.r, size = 9, color = BLACK, align = 'left', maxW } = {}) => {
        const t = safe(font, text);
        let px = x;
        if (align !== 'left' && maxW) {
            const tw = widthOf(font, size, t);
            px = align === 'center' ? x + (maxW - tw) / 2 : x + maxW - tw;
        }
        page.drawText(t, { x: px, y: H - top - size * 0.8, size: size * K, font, color });
    };

    const rect = (page, x, top, w, h, { stroke = GREY_LINE, fill, lw = 0.6 } = {}) => {
        page.drawRectangle({ x, y: H - top - h, width: w, height: h, ...(stroke ? { borderColor: stroke, borderWidth: lw } : {}), ...(fill ? { color: fill } : {}) });
    };
    const hline = (page, top, x1 = MX, x2 = W - MX, lw = 0.8) => page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness: lw, color: BLACK });
    const underline = (page, text, x, top, font, size, align = 'left', maxW) => {
        const tw = widthOf(font, size, safe(font, text));
        const px = align === 'center' && maxW ? x + (maxW - tw) / 2 : x;
        page.drawLine({ start: { x: px, y: H - top - size * 1.0 }, end: { x: px + tw, y: H - top - size * 1.0 }, thickness: 0.6, color: BLACK });
    };

    /** Texte libre dans une zone : taille réduite si besoin, tronqué en dernier recours. */
    function fitText(page, text, x, top, w, h, { font = F.r, maxSize = 9, minSize = 6, padding = 4, color = BLACK } = {}) {
        const innerW = w - 2 * padding;
        const innerH = h - 2 * padding;
        const value = String(text ?? '').trim();
        if (!value) return;
        let size = maxSize;
        let lines = wrap(font, size, value, innerW);
        while (size > minSize && lines.length * size * 1.18 > innerH) {
            size -= 0.5;
            lines = wrap(font, size, value, innerW);
        }
        const maxLines = Math.max(1, Math.floor(innerH / (size * 1.18)));
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            let last = lines[maxLines - 1];
            while (last.length > 1 && widthOf(font, size, `${last}…`) > innerW) last = last.slice(0, -1);
            lines[maxLines - 1] = `${last}…`;
        }
        lines.forEach((ln, i) => draw(page, ln, x + padding, top + padding + i * size * 1.18, { font, size, color }));
    }

    const box = (page, text, x, top, w, h, opts = {}) => {
        rect(page, x, top, w, h, { fill: opts.fill });
        fitText(page, text, x, top, w, h, opts);
    };

    const bar = (page, text, top, h = 18, x = MX, w = CW) => {
        rect(page, x, top, w, h, { stroke: BLACK, fill: GREY_FILL, lw: 0.9 });
        draw(page, text, x, top + (h - 9.5) / 2, { font: F.b, size: 9.5, align: 'center', maxW: w });
    };

    // ════════════════════ PAGE 1 ════════════════════
    let page = pdf.addPage([W, H]);
    if (logo) {
        const lw = 70, lh = (logo.height / logo.width) * lw;
        page.drawImage(logo, { x: (W - lw) / 2, y: H - 22 - lh, width: lw, height: lh });
    }
    draw(page, `COMPTE-RENDU D’ENTRETIEN PROFESSIONNEL ${annee || ''}`.trim(), MX, 90, { font: F.b, size: 16, align: 'center', maxW: CW });
    draw(page, 'CATEGORIE A ET B', MX, 110, { font: F.b, size: 12, align: 'center', maxW: CW });
    hline(page, 126);

    const agentNom = `${String(entretien.agent_nom || '').toUpperCase()} ${String(entretien.agent_prenom || '').toUpperCase()}`.trim();
    const ident = [
        ['Agent :', agentNom],
        ['Direction/Service :', entretien.service || entretien.direction || ''],
        ['Fonctions exercées :', entretien.poste || ''],
        ['Grade actuel :', crep.grade],
    ];
    ident.forEach(([label, value], i) => {
        const top = 136 + i * 15;
        draw(page, label, MX, top, { font: F.b, size: 10, align: 'right', maxW: 110 });
        draw(page, value, MX + 116, top, { size: 10 });
    });

    // Dates
    const dateCols = [
        { x: MX + 10, w: 150, label: 'Date de convocation :', value: fmtDate(entretien.created_at) },
        { x: MX + 190, w: 130, label: 'Date de l\'entretien :', value: fmtDate(entretien.date_entretien) },
        { x: MX + 340, w: 195, label: 'Date de notification agent :', value: fmtDate(entretien.crep_sent_at) },
    ];
    dateCols.forEach(c => {
        draw(page, c.label, c.x, 206, { font: F.b, size: 9.5 });
        box(page, c.value, c.x, 222, c.w, 24, { size: 10 });
    });
    hline(page, 256, MX, W - MX, 0.6);
    draw(page, 'Nom de l’évaluateur (N+1)', MX + 6, 266, { font: F.b, size: 10 });
    box(page, crep.evaluateur_nom || entretien.evaluator_nom || '', MX + 150, 260, CW - 150, 24, { size: 10 });
    hline(page, 292, MX, W - MX, 0.6);
    draw(page, 'Rappel des missions de l\'agent :', MX + 6, 298, { font: F.b, size: 10 });
    box(page, crep.missions, MX + 6, 312, CW - 12, 74, { size: 9 });
    hline(page, 396);

    draw(page, 'VOLET 1 – BILAN DE L’ANNEE ECOULEE', MX, 404, { font: F.b, size: 13, align: 'center', maxW: CW });

    // Tableau des objectifs
    const cols = [215, 250, 70];
    const cx = [MX, MX + cols[0], MX + cols[0] + cols[1]];
    const headTop = 428;
    ['Rappel des objectifs de travail de l’année écoulée', 'Observations', 'Niveau de réalisation *'].forEach((t, i) => {
        rect(page, cx[i], headTop, cols[i], 24, { stroke: BLACK, fill: GREY_FILL, lw: 0.9 });
        if (i === 2) {
            draw(page, 'Niveau de', cx[i], headTop + 3, { font: F.b, size: 8, align: 'center', maxW: cols[i] });
            draw(page, 'réalisation *', cx[i], headTop + 12, { font: F.b, size: 8, align: 'center', maxW: cols[i] });
        } else {
            draw(page, t, cx[i], headTop + 7, { font: F.b, size: 9.5, align: 'center', maxW: cols[i] });
        }
    });
    const rowH = 58;
    crep.objectifs_ecoules.forEach((o, i) => {
        const top = headTop + 24 + i * rowH;
        box(page, `${i + 1}. ${o.objectif}`.replace(/^\d\. $/, `${i + 1}.`), cx[0], top, cols[0], rowH, { size: 9 });
        box(page, o.observations, cx[1], top, cols[1], rowH, { size: 9 });
        rect(page, cx[2], top, cols[2], rowH);
        if (o.niveau) draw(page, o.niveau, cx[2], top + rowH / 2 - 6, { font: F.b, size: 12, align: 'center', maxW: cols[2] });
    });
    const obsTop = headTop + 24 + 4 * rowH + 6;
    bar(page, 'Observations complémentaires (contexte, faits marquants, acquis professionnels)', obsTop);
    box(page, crep.observations_complementaires, MX, obsTop + 18, CW, 810 - (obsTop + 18), { size: 9 });
    draw(page, '* Atteint (A), Partiellement atteint (PA), Non atteint (NA)', MX, 818, { size: 8.5 });

    // ════════════════════ PAGE 2 ════════════════════
    page = pdf.addPage([W, H]);
    const t2 = 'Appréciation de la valeur professionnelle dans le cadre du bilan de l’année écoulée';
    draw(page, t2, MX, 40, { font: F.b, size: 11.5, align: 'center', maxW: CW });
    underline(page, t2, MX, 40, F.b, 11.5, 'center', CW);

    const labW = 300;
    const lvW = (CW - labW) / 3;
    const lx = (k) => MX + labW + k * lvW;
    let top = 68;
    LEVELS.forEach((lv, k) => {
        rect(page, lx(k), top, lvW, 30, { stroke: BLACK, fill: GREY_FILL, lw: 0.9 });
        const lines = wrap(F.b, 7.5, lv.label, lvW - 6);
        lines.forEach((ln, j) => draw(page, ln, lx(k), top + 15 - (lines.length * 9) / 2 + j * 9, { font: F.b, size: 7.5, align: 'center', maxW: lvW }));
    });
    top += 30;

    const drawCheckRow = (item, rowTop, rowHeight, withLead) => {
        rect(page, MX, rowTop, labW, rowHeight, { stroke: BLACK, lw: 0.7 });
        // case(s)
        for (let k = 0; k < 3; k++) {
            rect(page, lx(k), rowTop, lvW, rowHeight, { stroke: BLACK, lw: 0.7 });
            const bx = lx(k) + lvW / 2 - 4, by = rowTop + rowHeight / 2 - 4;
            page.drawRectangle({ x: bx, y: H - by - 8, width: 8, height: 8, borderColor: BLACK, borderWidth: 0.8 });
            if (crep.valeur[item.key] === LEVELS[k].key) {
                page.drawLine({ start: { x: bx + 1, y: H - by - 7 }, end: { x: bx + 7, y: H - by - 1 }, thickness: 1.4, color: BLACK });
                page.drawLine({ start: { x: bx + 1, y: H - by - 1 }, end: { x: bx + 7, y: H - by - 7 }, thickness: 1.4, color: BLACK });
            }
        }
        if (withLead && item.lead) {
            // « Sens du service public » en gras souligné, suite en normal
            const rest = item.label.slice(item.lead.length);
            draw(page, item.lead, MX + 5, rowTop + 5, { font: F.b, size: 9 });
            underline(page, item.lead, MX + 5, rowTop + 5, F.b, 9);
            const lw = widthOf(F.b, 9, item.lead) + 3;
            const lines = wrap(F.r, 9, rest, labW - 10 - lw);
            draw(page, lines[0] || '', MX + 5 + lw, rowTop + 5, { size: 9 });
            const remaining = wrap(F.r, 9, lines.slice(1).join(' '), labW - 10);
            remaining.forEach((ln, j) => draw(page, ln, MX + 5, rowTop + 16 + j * 10.5, { size: 9 }));
        } else {
            const lines = wrap(F.r, 9, item.label, labW - 10);
            const startTop = rowTop + rowHeight / 2 - (lines.length * 10.5) / 2 + 1;
            lines.forEach((ln, j) => draw(page, ln, MX + 5, startTop + j * 10.5, { size: 9 }));
        }
    };

    for (const g of groupsOf(cdef)) {
        if (g.title) {
            top += 8;
            draw(page, g.title, MX + 4, top, { font: F.b, size: 9.5 });
            underline(page, g.title, MX + 4, top, F.b, 9.5);
            top += 14;
        } else {
            top += 0;
        }
        for (const it of g.items) {
            const lines = wrap(F.r, 9, it.label, labW - 10).length;
            const rh = it.lead ? 34 : (lines > 1 ? 30 : 22);
            drawCheckRow(it, top, rh, !!it.lead);
            top += rh;
        }
    }

    top += 10;
    const t3 = 'Appréciation générale sur l’exercice des missions';
    draw(page, t3, MX, top, { font: F.b, size: 12, align: 'center', maxW: CW });
    underline(page, t3, MX, top, F.b, 12, 'center', CW);
    top += 20;
    box(page, crep.appreciation_generale, MX, top, CW, 806 - top, { size: 9.5 });
    draw(page, 'L’appréciation de la valeur professionnelle sera prise en compte pour l’avancement de grade et la promotion interne', MX, 814, { font: F.bi, size: 8.5, align: 'center', maxW: CW });

    // ════════════════════ PAGE 3 ════════════════════
    page = pdf.addPage([W, H]);
    const t4 = 'VOLET 2 – ECHANGES SUR LES PERSPECTIVES DE L’ANNEE A VENIR';
    draw(page, t4, MX, 40, { font: F.b, size: 13, align: 'center', maxW: CW });
    underline(page, t4, MX, 40, F.b, 13, 'center', CW);
    if (!cdef || !cdef.flags || cdef.flags.objectifs_service !== false) {
        draw(page, 'Rappel des objectifs du service/de la direction :', MX + 6, 66, { font: F.b, size: 10 });
        box(page, crep.objectifs_service, MX, 80, CW, 150, { size: 9.5 });
    }

    bar(page, 'Objectifs individuels de travail de l’année à venir', 242);
    const half = CW / 2;
    rect(page, MX, 260, half, 20, { stroke: BLACK, fill: GREY_FILL, lw: 0.9 });
    rect(page, MX + half, 260, half, 20, { stroke: BLACK, fill: GREY_FILL, lw: 0.9 });
    draw(page, 'Descriptif', MX, 265, { font: F.b, size: 10, align: 'center', maxW: half });
    draw(page, 'Moyens et échéances', MX + half, 265, { font: F.b, size: 10, align: 'center', maxW: half });
    const rh3 = 78;
    crep.objectifs_futurs.forEach((o, i) => {
        const rt = 280 + i * rh3;
        box(page, `${i + 1}. ${o.descriptif}`.replace(/^\d\. $/, `${i + 1}.`), MX, rt, half, rh3, { size: 9.5 });
        box(page, o.moyens, MX + half, rt, half, rh3, { size: 9.5 });
    });
    const ft = 280 + 4 * rh3 + 8;
    bar(page, 'Actions de formation à envisager (Inscriptions à faire ultérieurement)', ft);
    const labelW = 150;
    const frh = 60;
    [
        ['Formations obligatoires (statutaires et réglementaires)', crep.formations.obligatoires],
        ['Autres formations métiers', crep.formations.metiers],
        ['Formations liées à l’accompagnement des parcours et ou à un projet professionnel', crep.formations.parcours],
    ].forEach(([label, value], i) => {
        const rt = ft + 18 + i * frh;
        rect(page, MX, rt, labelW, frh, { stroke: BLACK, lw: 0.8 });
        const lines = wrap(F.b, 9, label, labelW - 12);
        lines.forEach((ln, j) => draw(page, ln, MX, rt + frh / 2 - (lines.length * 10.5) / 2 + j * 10.5, { font: F.b, size: 9, align: 'center', maxW: labelW }));
        box(page, value, MX + labelW, rt, CW - labelW, frh, { size: 9.5 });
    });

    // ════════════════════ PAGE 4 ════════════════════
    page = pdf.addPage([W, H]);
    bar(page, 'Perspectives d’évolution en termes de missions, de carrière et de mobilité', 40);
    draw(page, '1. Evolution des missions et/ou de carrière :', MX + 6, 68, { font: F.b, size: 10 });
    box(page, crep.evolution, MX, 82, CW, 62, { size: 9.5 });
    draw(page, '2. Mobilité :', MX + 6, 154, { font: F.b, size: 10 });
    box(page, crep.mobilite, MX, 168, CW, 62, { size: 9.5 });

    const t5 = 'Observations de l’agent sur les conditions de travail et le fonctionnement du service';
    draw(page, t5, MX, 242, { font: F.b, size: 10.5, align: 'center', maxW: CW });
    underline(page, t5, MX, 242, F.b, 10.5, 'center', CW);
    draw(page, '(A remplir par l’agent)', MX, 257, { font: F.i, size: 8.5, align: 'center', maxW: CW });
    box(page, crep.obs_agent_conditions, MX, 270, CW, 118, { size: 9.5 });

    const t6 = 'Observations de l’agent sur l’entretien';
    draw(page, t6, MX, 400, { font: F.b, size: 10.5, align: 'center', maxW: CW });
    underline(page, t6, MX, 400, F.b, 10.5, 'center', CW);
    draw(page, '(A remplir par l’agent)', MX, 415, { font: F.i, size: 8.5, align: 'center', maxW: CW });
    box(page, crep.obs_agent_entretien, MX, 428, CW, 118, { size: 9.5 });

    // Signatures
    const sigTop = 556, sigH = 80, sw = CW / 2;
    rect(page, MX, sigTop, sw, sigH, { stroke: BLACK, lw: 1.2 });
    rect(page, MX + sw, sigTop, sw, sigH, { stroke: BLACK, lw: 1.2 });
    draw(page, 'DATE ET SIGNATURE DE L’AGENT :', MX + 8, sigTop + 6, { font: F.b, size: 7.5 });
    draw(page, '(Dans les 15 jours suivant la notification par le N+1)', MX + 8, sigTop + 17, { font: F.i, size: 8.5 });
    draw(page, 'DATE ET SIGNATURE DE L’ÉVALUATEUR', MX + sw + 8, sigTop + 6, { font: F.b, size: 7.5 });
    draw(page, '(le N+1) :', MX + sw + 8 + widthOf(F.b, 7.5, 'DATE ET SIGNATURE DE L’ÉVALUATEUR') + 8, sigTop + 6, { font: F.i, size: 8.5 });
    // Dates de signature = date de validation par l'agent (les signatures sont apposées par le parapheur)
    const signDate = fmtDate(entretien.crep_agent_validated_at);
    if (signDate) {
        draw(page, `Le ${signDate}`, MX, sigTop + 6, { font: F.b, size: 8.5, align: 'right', maxW: sw - 8 });
        draw(page, `Le ${signDate}`, MX + sw, sigTop + 6, { font: F.b, size: 8.5, align: 'right', maxW: sw - 8 });
    }

    draw(page, 'Observations et Visa de l’Autorité Territoriale :', MX + 4, 646, { font: F.b, size: 10 });
    rect(page, MX, 660, CW, 70, { stroke: null, fill: BEIGE });
    fitText(page, crep.visa_autorite, MX, 660, CW, 70, { size: 9.5 });

    // Voies de recours (texte réglementaire fixe)
    let rt = 742;
    const line = (txt, font, size = 7.6) => { draw(page, txt, MX + 6, rt, { font, size }); rt += 10.2; };
    draw(page, 'Voies de recours', MX + 6, rt, { font: F.bi, size: 7.8 });
    underline(page, 'Voies de recours', MX + 6, rt, F.bi, 7.8);
    rt += 10.5;
    draw(page, 'Demande de révision du compte rendu :', MX + 6, rt, { font: F.bi, size: 7.8 });
    draw(page, ' Article 7 du décret n°2014-1526 du 16 décembre 2014', MX + 6 + widthOf(F.bi, 7.8, 'Demande de révision du compte rendu :'), rt, { font: F.i, size: 7.6 });
    rt += 10.2;
    line('- auprès de l’autorité territoriale (dans un délai de 15 jours francs après notification du compte rendu)', F.i);
    line('- puis saisine des membres de la CAP compétente (à compter d’un mois après réception de la réponse de l’autorité territoriale)', F.i);
    line('Recours pour excès de pouvoir :', F.bi, 7.8);
    line('Auprès de l’autorité territoriale (recours gracieux) dans un délai de deux mois après réception de la réponse de la CAP', F.i);
    line('Auprès du Tribunal Administratif dans un délai de deux mois à compter de la présente notification', F.bi);

    return Buffer.from(await pdf.save());
}

module.exports = { buildCrepPdf };
