/**
 * Export complet d'un tableau en vrai fichier Excel (.xlsx) ou Word (.docx).
 * Les chiffres sont ceux relus dans Sedit au moment de l'export, avec le même périmètre.
 */
const ExcelJS = require('exceljs');
const AdmZip = require('adm-zip');

const FORMATS = { money: '#,##0.00 "€";-#,##0.00 "€"', int: '#,##0', pct: '+0.0%;-0.0%;0.0%', date: 'dd/mm/yyyy' };
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
const frDate = (v) => (isDate(v) ? String(v).split('-').reverse().join('/') : String(v ?? ''));
// Caractères interdits en XML (les libellés Sedit en contiennent parfois)
const printable = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ' ');

// ───────── Excel ─────────
function excelValue(v, type) {
    if (v === null || v === undefined || v === '') return null;
    if (type === 'date' && isDate(v)) return new Date(`${v}T00:00:00Z`);
    if (type === 'pct' && typeof v === 'number') return v / 100;
    // Toujours une valeur, jamais une formule ; les codes (« 011 ») restent du texte
    return typeof v === 'number' ? v : printable(v);
}

async function toExcel(table) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Assistant finances', { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToHeight: 0 } });
    ws.addRow([printable(table.titre)]).font = { bold: true, size: 13 };
    ws.addRow([printable(table.perimetre)]).font = { color: { argb: 'FF64748B' }, size: 9 };
    ws.addRow([`Extrait de Sedit le ${new Date().toLocaleString('fr-FR')}`]).font = { color: { argb: 'FF64748B' }, size: 9 };
    const header = ws.addRow(table.colonnes.map(c => c.label));
    header.font = { bold: true };
    header.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; });
    const add = (line, bold) => {
        const row = ws.addRow(line.map((v, i) => excelValue(v, table.colonnes[i].type)));
        table.colonnes.forEach((c, i) => { if (FORMATS[c.type]) row.getCell(i + 1).numFmt = FORMATS[c.type]; });
        if (bold) row.font = { bold: true };
    };
    table.lignes.forEach(l => add(l, false));
    if (table.lignes.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + table.lignes.length, column: table.colonnes.length } };
    if (table.total) add(table.total, true);
    table.notes.forEach(n => ws.addRow([printable(n)]).font = { italic: true, size: 9 });
    table.colonnes.forEach((c, i) => {
        const longest = table.lignes.slice(0, 500).reduce((a, l) => Math.max(a, String(l[i] ?? '').length), c.label.length);
        ws.getColumn(i + 1).width = Math.max(c.type === 'money' ? 17 : 11, Math.min(60, longest + 2));
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────── Word ─────────
const xml = (v) => printable(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wordValue(v, type) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v !== 'number') return type === 'date' ? frDate(v) : String(v);
    if (type === 'money') return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    if (type === 'pct') return `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
    return v.toLocaleString('fr-FR');
}

const paragraph = (text, { bold = false, size = 18, color = '000000', right = false } = {}) =>
    `<w:p><w:pPr><w:spacing w:after="0"/>${right ? '<w:jc w:val="right"/>' : ''}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;

function toWord(table) {
    const numeric = (i) => ['money', 'int', 'pct'].includes(table.colonnes[i].type);
    const cell = (text, i, { bold = false, fill = null } = {}) =>
        `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${paragraph(text, { bold, size: 16, right: numeric(i) && !fill })}</w:tc>`;
    const row = (line, options = {}) => `<w:tr>${options.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${line.map((v, i) => cell(options.header ? v : wordValue(v, table.colonnes[i].type), i, options)).join('')}</w:tr>`;
    const border = (side) => `<w:${side} w:val="single" w:sz="4" w:color="999999"/>`;
    const body = [
        paragraph(table.titre, { bold: true, size: 26 }),
        paragraph(table.perimetre, { size: 16, color: '64748B' }),
        paragraph(`Extrait de Sedit le ${new Date().toLocaleString('fr-FR')}`, { size: 16, color: '64748B' }),
        paragraph(''),
        `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>`,
        `<w:tblGrid>${table.colonnes.map(() => '<w:gridCol/>').join('')}</w:tblGrid>`,
        row(table.colonnes.map(c => c.label), { header: true, bold: true, fill: 'E2E8F0' }),
        ...table.lignes.map(l => row(l)),
        table.total ? row(table.total, { bold: true }) : '',
        '</w:tbl>',
        ...table.notes.map(n => paragraph(n, { size: 15, color: '92400E' })),
    ].join('');

    const zip = new AdmZip();
    const file = (name, content) => zip.addFile(name, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`, 'utf8'));
    file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    // A4 paysage
    file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.toBuffer();
}

const TYPES = {
    excel: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', build: toExcel },
    word: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: toWord },
};

module.exports = { TYPES };
