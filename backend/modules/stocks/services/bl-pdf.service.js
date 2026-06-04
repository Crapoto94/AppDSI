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

// La police standard Helvetica est limitée à WinAnsi : on normalise la ponctuation
// typographique et on retire les caractères non encodables pour qu'un caractère
// inattendu n'interrompe pas la génération.
const winAnsiSafe = (s) => String(s)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');

/**
 * Cœur générique de génération de document : prend un gabarit + un contexte
 * (variables scalaires, lignes répétées, signatures) et produit un PDF enregistré
 * comme document. Utilisé aussi bien par les BL /stocks que par les fiches mobilité.
 *
 * @param {Object} ctx
 * @param {number} ctx.templateId
 * @param {Object} ctx.scalarMap            map '{var}' -> valeur
 * @param {Object[]} [ctx.lineMaps]         tableau de maps '{ligne.x}' -> valeur (lignes répétées)
 * @param {number} [ctx.preparerSignatureDocId]
 * @param {number} [ctx.recipientSignatureDocId]
 * @param {Object} [ctx.user]
 * @param {string} ctx.filename
 * @param {string} ctx.entityType
 * @param {number|string} ctx.entityId
 * @returns {Promise<number|null>} document id, ou null si pas de gabarit/fond
 */
async function generateFicheFromContext(ctx) {
    const { templateId, scalarMap = {}, lineMaps = [], preparerSignatureDocId, recipientSignatureDocId,
        user, filename = 'fiche.pdf', entityType = 'fiche', entityId = 0 } = ctx;
    if (!templateId) return null;
    const template = await blTemplateRepo.get(templateId);
    if (!template || !template.base_document_id) return null;
    const baseBuffer = await readDocumentBuffer(template.base_document_id);
    if (!baseBuffer) throw new Error('PDF de fond du gabarit introuvable');

    const fields = Array.isArray(template.fields) ? template.fields
        : (typeof template.fields === 'string' ? JSON.parse(template.fields || '[]') : []);

    const pdfDoc = await PDFDocument.load(baseBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    const embedPng = async (id) => { try { const b = await readDocumentBuffer(id); return b ? await pdfDoc.embedPng(b) : null; } catch { return null; } };
    const pngPreparer = await embedPng(preparerSignatureDocId);
    const pngRecipient = await embedPng(recipientSignatureDocId);

    const drawText = (page, text, field) => {
        if (text === '' || text == null) return;
        const safe = winAnsiSafe(text);
        if (!safe) return;
        const size = field.font_size || 10;
        const f = field.bold ? fontBold : font;
        const pageHeight = page.getHeight();
        let x = field.x || 0;
        const w = field.width || 0;
        if (w && (field.align === 'center' || field.align === 'right')) {
            const tw = f.widthOfTextAtSize(safe, size);
            if (field.align === 'center') x = x + (w - tw) / 2;
            else x = x + (w - tw);
        }
        const y = pageHeight - (field.y || 0) - size;
        try { page.drawText(safe, { x, y, size, font: f, color: rgb(0, 0, 0) }); }
        catch (e) { console.warn('[BL-PDF] champ ignoré:', e.message); }
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
        const tpl = field.variable || field.text || '';
        const isLine = typeof tpl === 'string' && tpl.includes('{ligne.');
        if (isLine) {
            const rowHeight = field.row_height || 18;
            lineMaps.forEach((lineMap, idx) => {
                drawText(page, applyVars(tpl, lineMap), { ...field, y: (field.y || 0) + idx * rowHeight });
            });
        } else {
            drawText(page, applyVars(tpl, scalarMap), field);
        }
    }

    const outBytes = await pdfDoc.save();
    const buffer = Buffer.from(outBytes);
    const file = { buffer, originalname: filename, mimetype: 'application/pdf', size: buffer.length };
    const { document } = await docs.uploadDocument({
        file, module: 'stocks', entityType, entityId, title: filename, uploadedBy: user?.username,
    });
    return document.id;
}

/**
 * Génère (ou régénère) le BL/fiche PDF d'une livraison à partir de son gabarit.
 * Construit le contexte depuis la delivery puis délègue à generateFicheFromContext.
 */
async function generateBL(deliveryId, { withRecipient = false, user } = {}) {
    const delivery = await deliveryRepo.getDelivery(deliveryId);
    if (!delivery) throw new Error('Livraison introuvable');
    if (!delivery.template_id) return null;

    const store = await pgDb.get(`SELECT name FROM hub_stocks.stores WHERE id = $1`, [delivery.store_id]);
    const meta = delivery.meta && typeof delivery.meta === 'object' ? delivery.meta
        : (typeof delivery.meta === 'string' ? (() => { try { return JSON.parse(delivery.meta || '{}'); } catch { return {}; } })() : {});

    const scalarMap = {
        '{bl.numero}': delivery.id,
        '{fiche.numero}': delivery.id,
        '{date}': fmtDate(new Date()),
        '{store.name}': store?.name || '',
        '{beneficiary.name}': delivery.beneficiary_name || '',
        '{beneficiary.email}': delivery.beneficiary_email || '',
        '{agent.nom}': delivery.beneficiary_name || '',
        '{agent.email}': delivery.beneficiary_email || '',
        '{preparer.name}': delivery.prepared_by || '',
        '{delivered_by}': delivery.delivered_by || '',
    };
    Object.keys(meta || {}).forEach(k => { scalarMap[`{${k}}`] = meta[k] == null ? '' : String(meta[k]); });

    const lineMaps = (delivery.lines || []).map(ln => ({
        '{ligne.designation}': ln.item_label || '',
        '{ligne.modele}': ln.item_label || '',
        '{ligne.reference}': ln.item_reference || '',
        '{ligne.quantite}': ln.quantity != null ? ln.quantity : '',
        '{ligne.serial}': ln.serial_number || '',
        '{ligne.imei}': ln.serial_number || '',
    }));

    return generateFicheFromContext({
        templateId: delivery.template_id, scalarMap, lineMaps,
        preparerSignatureDocId: delivery.preparer_signature_document_id,
        recipientSignatureDocId: withRecipient ? delivery.recipient_signature_document_id : null,
        user, filename: `BL-${delivery.id}${withRecipient ? '-signe' : '-prepare'}.pdf`,
        entityType: 'bl', entityId: delivery.id,
    });
}

module.exports = { generateBL, generateFiche: generateBL, generateFicheFromContext, fmtDate };
