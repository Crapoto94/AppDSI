/**
 * Parsing des fichiers .msg (Outlook, format OLE compound) pour prévisualisation.
 *
 * Basé sur @kenjiuno/msgreader (pur JS, sans dépendance native ni Outlook/COM).
 */
const MsgReader = require('@kenjiuno/msgreader').default;

/** Nettoie une adresse Exchange X.500 (non affichable) au profit du nom. */
function displayAddress(name, email) {
    const smtp = email && /@/.test(email) && !email.startsWith('/O=') ? email : '';
    if (name && smtp) return `${name} <${smtp}>`;
    return name || smtp || '';
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
 * Extrait une pièce jointe embarquée par son index (voir attachments[].index ci-dessus).
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

module.exports = { parseMsgBuffer, extractMsgAttachment };
