const docs = require('../../../shared/documents.service');

/**
 * Enregistre une signature (data URL PNG base64) comme document via le service générique.
 * @returns {Promise<number|null>} document_id, ou null si pas de signature
 */
async function saveSignature(dataUrl, { entityType, entityId, uploadedBy, title }) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return null;
    const mimetype = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    const ext = mimetype.split('/')[1] || 'png';
    const file = {
        buffer,
        originalname: `${title || 'signature'}-${entityId}.${ext}`,
        mimetype,
        size: buffer.length,
    };
    const { document } = await docs.uploadDocument({
        file, module: 'stocks', entityType, entityId, title: file.originalname, uploadedBy,
    });
    return document.id;
}

module.exports = { saveSignature };
