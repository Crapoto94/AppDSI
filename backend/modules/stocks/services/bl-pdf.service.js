const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { pgDb } = require('../../../shared/database');
const docs = require('../../../shared/documents.service');
const deliveryRepo = require('../repositories/delivery.repository');
const blTemplateRepo = require('../repositories/bl-template.repository');

// Récupère un Buffer depuis le résultat de readVersion (buffer ou absolutePath)
async function bufferFromVersion(v) {
    if (!v) return null;
    if (v.buffer) return Buffer.isBuffer(v.buffer) ? v.buffer : Buffer.from(v.buffer);
    if (v.absolutePath) return fs.promises.readFile(v.absolutePath);
    return null;
}

async function readDocumentBuffer(documentId) {
    if (!documentId) return null;
    try {
        const v = await docs.readVersion(documentId);
        return bufferFromVersion(v);
    } catch (e) {
        console.error('[BL-PDF] lecture document échouée', documentId, e.message);
        return null;
    }
}

function fmtDate(d) {
    const dt = d ? new Date(d) : new Date();
    const p = n => String(n).padStart(2, '0');
    return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function applyVars(template, map) {
    if (!template) return '';
    let out = String(template);
    Object.keys(map).sort((a, b) => b.length - a.length).forEach(k => {
        out = out.split(k).join(map[k] == null ? '' : String(map[k]));
    });
    return out;
}

/**
 * Génère (ou régénère) le BL PDF d'une livraison à partir de son gabarit.
 * Dessine les variables + lignes répétées + signatures (préparateur / destinataire).
 * Enregistre le PDF comme document et renvoie son id.
 *
 * @param {number} deliveryId
 * @param {{ withRecipient?: boolean, user?: object }} opts
 * @returns {Promise<number|null>} bl_document_id, ou null si pas de gabarit/PDF de fond
 */
async function generateBL(deliveryId, { withRecipient = false, user } = {}) {
    const delivery = await deliveryRepo.getDelivery(deliveryId);
    if (!delivery) throw new Error('Livraison introuvable');
    if (!delivery.template_id) return null;

    const template = await blTemplateRepo.get(delivery.template_id);
    if (!template || !template.base_document_id) return null;

    const baseBuffer = await readDocumentBuffer(template.base_document_id);
    if (!baseBuffer) throw new Error('PDF de fond du gabarit introuvable');

    const store = await pgDb.get(`SELECT name FROM hub_stocks.stores WHERE id = $1`, [delivery.store_id]);

    const fields = Array.isArray(template.fields) ? template.fields
        : (typeof template.fields === 'string' ? JSON.parse(template.fields || '[]') : []);

    const scalarMap = {
        '{bl.numero}': delivery.id,
        '{date}': fmtDate(new Date()),
        '{store.name}': store?.name || '',
        '{beneficiary.name}': delivery.beneficiary_name || '',
        '{beneficiary.email}': delivery.beneficiary_email || '',
        '{preparer.name}': delivery.prepared_by || '',
        '{delivered_by}': delivery.delivered_by || '',
    };

    const pdfDoc = await PDFDocument.load(baseBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    // Signatures (PNG) à embarquer
    const sigPreparer = await readDocumentBuffer(delivery.preparer_signature_document_id);
    const sigRecipient = withRecipient ? await readDocumentBuffer(delivery.recipient_signature_document_id) : null;
    const embedPng = async (buf) => { try { return buf ? await pdfDoc.embedPng(buf) : null; } catch { return null; } };
    const pngPreparer = await embedPng(sigPreparer);
    const pngRecipient = await embedPng(sigRecipient);

    const lines = delivery.lines || [];

    const drawText = (page, text, field) => {
        if (text === '' || text == null) return;
        const size = field.font_size || 10;
        const f = field.bold ? fontBold : font;
        const pageHeight = page.getHeight();
        let x = field.x || 0;
        const w = field.width || 0;
        if (w && (field.align === 'center' || field.align === 'right')) {
            const tw = f.widthOfTextAtSize(String(text), size);
            if (field.align === 'center') x = x + (w - tw) / 2;
            else x = x + (w - tw);
        }
        const y = pageHeight - (field.y || 0) - size;
        page.drawText(String(text), { x, y, size, font: f, color: rgb(0, 0, 0) });
    };

    const drawSig = (page, png, field) => {
        if (!png) return;
        const pageHeight = page.getHeight();
        const w = field.width || 120;
        const h = field.height || 50;
        page.drawImage(png, { x: field.x || 0, y: pageHeight - (field.y || 0) - h, width: w, height: h });
    };

    for (const field of fields) {
        const page = pages[field.page || 0] || pages[0];
        if (!page) continue;

        if (field.type === 'signature_preparer') { drawSig(page, pngPreparer, field); continue; }
        if (field.type === 'signature_recipient') { drawSig(page, pngRecipient, field); continue; }

        // type 'text'
        const tpl = field.variable || field.text || '';
        const isLine = typeof tpl === 'string' && tpl.includes('{ligne.');
        if (isLine) {
            const rowHeight = field.row_height || 18;
            lines.forEach((ln, idx) => {
                const lineMap = {
                    '{ligne.designation}': ln.item_label || '',
                    '{ligne.reference}': ln.item_reference || '',
                    '{ligne.quantite}': ln.quantity != null ? ln.quantity : '',
                    '{ligne.serial}': ln.serial_number || '',
                };
                const text = applyVars(tpl, lineMap);
                drawText(page, text, { ...field, y: (field.y || 0) + idx * rowHeight });
            });
        } else {
            drawText(page, applyVars(tpl, scalarMap), field);
        }
    }

    const outBytes = await pdfDoc.save();
    const buffer = Buffer.from(outBytes);
    const file = {
        buffer,
        originalname: `BL-${delivery.id}${withRecipient ? '-signe' : '-prepare'}.pdf`,
        mimetype: 'application/pdf',
        size: buffer.length,
    };
    const { document } = await docs.uploadDocument({
        file, module: 'stocks', entityType: 'bl', entityId: delivery.id,
        title: file.originalname, uploadedBy: user?.username,
    });
    return document.id;
}

module.exports = { generateBL };
