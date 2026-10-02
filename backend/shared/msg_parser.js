/**
 * Parsing des fichiers e-mail (.msg Outlook et .eml MIME) pour prévisualisation.
 *
 * - .msg : format OLE compound, via @kenjiuno/msgreader (pur JS).
 * - .eml : MIME RFC822, via mailparser.
 *
 * Les deux parseurs renvoient la MÊME structure normalisée, afin que les
 * visionneuses (GED, explorateur de projets, pièces jointes) n'aient qu'un seul
 * rendu à gérer.
 */
const MsgReader = require('@kenjiuno/msgreader').default;
const { simpleParser } = require('mailparser');

/** Nettoie une adresse Exchange X.500 (non affichable) au profit du nom. */
function displayAddress(name, email) {
    const smtp = email && /@/.test(email) && !email.startsWith('/O=') ? email : '';
    if (name && smtp) return `${name} <${smtp}>`;
    return name || smtp || '';
}

/** Buffer OLE compound (signature D0 CF 11 E0) = fichier .msg Outlook. */
function isMsgBuffer(buffer) {
    return !!buffer && buffer.length >= 4
        && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
}

const looksEml = (name, mimetype) => /\.eml$/i.test(name || '')
    || /^message\/rfc822$/i.test(mimetype || '') || /^application\/eml$/i.test(mimetype || '');
const looksMsg = (name, mimetype) => /\.msg$/i.test(name || '')
    || /^application\/vnd\.ms-outlook$/i.test(mimetype || '');

/** Liste d'adresses mailparser ({ value: [{ name, address }] }) -> ["Nom <adresse>"] */
function addressText(addr) {
    const arr = (addr && addr.value) || [];
    return arr.map(a => displayAddress(a.name, a.address)).filter(Boolean);
}

/**
 * Parse un buffer .msg et renvoie une structure exploitable côté front.
 * @param {Buffer|Uint8Array} buffer
 */
function parseMsgBuffer(buffer) {
    const reader = new MsgReader(buffer);
    const data = reader.getFileData();
    if (data.error) throw new Error(data.error);

    const to = (data.recipients || []).filter(r => r.recipType === 'to').map(r => displayAddress(r.name, r.smtpAddress || r.email));
    const cc = (data.recipients || []).filter(r => r.recipType === 'cc').map(r => displayAddress(r.name, r.smtpAddress || r.email));

    const attachments = (data.attachments || [])
        .map((a, index) => ({ index, fileName: a.fileName || `piece-jointe-${index + 1}`, contentLength: a.contentLength || 0 }))
        // Les images intégrées au corps HTML (cid:) ne sont pas des pièces jointes utiles à lister.
        .filter(a => !a.fileName.toLowerCase().match(/^image\d*\.(png|jpe?g|gif|bmp)$/));

    return {
        subject: data.subject || '(sans objet)',
        from: displayAddress(data.senderName, data.senderEmail),
        to,
        cc,
        date: data.messageDeliveryTime || null,
        bodyText: data.body || '',
        bodyHtml: data.bodyHTML || '',
        attachments,
    };
}

/**
 * Parse un buffer .eml (MIME) et renvoie la même structure que parseMsgBuffer.
 * @param {Buffer|Uint8Array} buffer
 */
async function parseEmlBuffer(buffer) {
    const parsed = await simpleParser(Buffer.from(buffer));

    // index = position dans parsed.attachments (utilisé pour l'extraction),
    // on exclut ensuite les images inline (cid: / related) de la liste affichée
    // sans toucher aux index des vraies pièces jointes.
    const attachments = (parsed.attachments || [])
        .map((a, index) => ({
            index,
            fileName: a.filename || `piece-jointe-${index + 1}`,
            contentLength: a.size || (a.content ? a.content.length : 0),
            _inline: a.related === true || a.contentDisposition === 'inline',
        }))
        .filter(a => !a._inline)
        .map(({ index, fileName, contentLength }) => ({ index, fileName, contentLength }));

    return {
        subject: parsed.subject || '(sans objet)',
        from: (parsed.from && parsed.from.text) || '',
        to: addressText(parsed.to),
        cc: addressText(parsed.cc),
        date: parsed.date ? new Date(parsed.date).toISOString() : null,
        bodyText: parsed.text || '',
        bodyHtml: typeof parsed.html === 'string' ? parsed.html : '',
        attachments,
    };
}

/**
 * Parse un e-mail (.msg ou .eml) sans présumer du format : extension/type MIME
 * d'abord, puis détection par signature du contenu.
 * @returns {Promise<object>} structure normalisée
 */
async function parseEmailBuffer(buffer, name, mimetype) {
    if (looksEml(name, mimetype)) return parseEmlBuffer(buffer);
    if (looksMsg(name, mimetype)) return parseMsgBuffer(buffer);
    return isMsgBuffer(buffer) ? parseMsgBuffer(buffer) : parseEmlBuffer(buffer);
}

/**
 * Extrait une pièce jointe embarquée par son index (voir attachments[].index).
 * @returns {Promise<{ fileName: string, content: Uint8Array } | null>}
 */
async function extractEmailAttachment(buffer, name, mimetype, index) {
    const asEml = looksEml(name, mimetype) || (!looksMsg(name, mimetype) && !isMsgBuffer(buffer));
    if (asEml) {
        const parsed = await simpleParser(Buffer.from(buffer));
        const att = (parsed.attachments || [])[index];
        if (!att) return null;
        return { fileName: att.filename || `piece-jointe-${index + 1}`, content: att.content };
    }
    return extractMsgAttachment(buffer, index);
}

/**
 * Extrait une pièce jointe embarquée dans un .msg par son index.
 * @returns {{ fileName: string, content: Uint8Array } | null}
 */
function extractMsgAttachment(buffer, index) {
    const reader = new MsgReader(buffer);
    const data = reader.getFileData();
    const att = (data.attachments || [])[index];
    if (!att) return null;
    const extracted = reader.getAttachment(att);
    return { fileName: att.fileName || `piece-jointe-${index + 1}`, content: extracted.content };
}

module.exports = {
    parseMsgBuffer,
    parseEmlBuffer,
    parseEmailBuffer,
    extractMsgAttachment,
    extractEmailAttachment,
};
