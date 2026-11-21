'use strict';
// PDF « éléments relevés sur le document signé » (administrateurs) : en mode saisie dans l'outil, le CREP lui-même est celui de l'outil ;
// la lecture en arrière-plan n'ajoute que les 2 commentaires de l'agent et la présence des signatures.
const { PDFDocument, StandardFonts, rgb } = require('../../shared/lazy').lazy('pdf-lib');

const clean = (t) => String(t == null ? '' : t).replace(/[‘’]/g, '’').replace(/[^\n\x20-\x7E -ÿ’–—…€]/g, ' ');

async function buildExtractPdf({ agent, annee, conditions, entretien, signatures, valideur }) {
    const pdf = await PDFDocument.create();
    const R = await pdf.embedFont(StandardFonts.Helvetica);
    const B = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595, H = 842, M = 44, CW = W - 2 * M;
    let page = pdf.addPage([W, H]);
    let y = H - M;
    const wrap = (t, font, size, maxW) => {
        const out = [];
        for (const para of clean(t).split('\n')) {
            let line = '';
            for (const w of para.split(/\s+/)) {
                const test = line ? line + ' ' + w : w;
                if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; } else line = test;
            }
            out.push(line);
        }
        return out;
    };
    const need = (h) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
    const text = (t, { font = R, size = 10.5, color = rgb(0.12, 0.16, 0.22), x = M, maxW = CW, gap = 4 } = {}) => {
        for (const l of wrap(t, font, size, maxW)) { need(size + gap); page.drawText(l, { x, y: y - size, size, font, color }); y -= size + gap; }
    };
    text('Éléments relevés sur le document signé', { font: B, size: 16, color: rgb(0.31, 0.27, 0.9) });
    text(`${agent} — campagne ${annee || ''}`, { size: 11, color: rgb(0.28, 0.33, 0.41) });
    y -= 4;
    text('Réservé aux administrateurs. Le compte rendu lui-même est celui saisi dans l’outil : il n’y a rien d’autre à vérifier. La lecture en arrière-plan n’ajoute que les éléments ci-dessous.', { size: 9.5, color: rgb(0.4, 0.45, 0.52) });
    y -= 10;
    const box = (title, body) => {
        text(title, { font: B, size: 11 });
        text('Lecture automatique du document téléversé : des erreurs sont possibles, le document signé fait foi.', { font: R, size: 9, color: rgb(0.7, 0.33, 0.04) });
        const lines = wrap(body || '(rien de lu)', R, 10.5, CW - 16);
        const h = lines.length * 14.5 + 12;
        need(h + 6);
        page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.8, 0.84, 0.9), borderWidth: 1 });
        let ly = y - 8;
        for (const l of lines) { page.drawText(l, { x: M + 8, y: ly - 10.5, size: 10.5, font: R, color: rgb(0.12, 0.16, 0.22) }); ly -= 14.5; }
        y -= h + 12;
    };
    box('Observations de l’agent — conditions de travail', conditions);
    box('Observations de l’agent — entretien', entretien);
    text('Signatures', { font: B, size: 11 });
    text('Détection automatique sur le document téléversé : elle peut être erronée.', { size: 9, color: rgb(0.7, 0.33, 0.04) });
    const yn = (v) => v === true ? 'présente' : v === false ? 'non détectée' : 'non vérifiée automatiquement';
    text(`Signature de l’agent : ${yn(signatures && signatures.agent)}`);
    text(`Signature de l’évaluateur : ${yn(signatures && signatures.evaluateur)}`);
    text(valideur ? 'Le valideur a confirmé la présence des 2 signatures sur le document téléversé.' : 'Le valideur n’a pas encore confirmé la présence des 2 signatures.', { size: 10, color: valideur ? rgb(0.09, 0.4, 0.2) : rgb(0.6, 0.25, 0.05) });
    return pdf.save();
}

module.exports = { buildExtractPdf };
