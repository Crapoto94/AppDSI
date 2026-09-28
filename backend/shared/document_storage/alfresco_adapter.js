/**
 * Adaptateur Alfresco — implémentation réelle de l'adaptateur de stockage documentaire.
 *
 * Contrat (identique à smb_adapter.js) :
 *   write(file, hints) → storageRef
 *   read(storageRef)   → { buffer|absolutePath, filename }
 *   delete(storageRef)
 *   exists(storageRef)
 *
 * storageRef est de la forme « alf:<nodeId> » (identifiant du nœud Alfresco).
 * Arborescence : <racine>/<module>/<entityId>/<nom-de-fichier>.
 */
const path = require('path');
const alfresco = require('../alfresco');

function sanitizeSegment(value, fallback = 'sans-nom') {
    const s = String(value ?? '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/[\r\n\t]+/g, ' ')
        .trim()
        .slice(0, 120);
    return s || fallback;
}

function buildFileName(originalname) {
    const base = path.basename(String(originalname || 'fichier')).replace(/[\r\n]/g, '');
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}`;
}

module.exports = {
    backendName: 'alfresco',

    async write(file, { module: moduleName, entityId }) {
        if (!file || !file.buffer) throw new Error('Aucun contenu de fichier fourni.');
        const cfg = await alfresco.getConfig();
        alfresco.assertConfigured(cfg);

        const dossier = await alfresco.ensurePath(cfg, [
            sanitizeSegment(moduleName, 'module'),
            sanitizeSegment(entityId, 'element'),
        ]);

        const name = buildFileName(file.originalname);
        const r = await alfresco.deposit(cfg, dossier.id, {
            name,
            buffer: file.buffer,
            mime: file.mimetype || 'application/octet-stream',
            description: file.originalname || name,
        });
        return alfresco.makeRef(r.nodeId);
    },

    async read(storageRef) {
        const nodeId = alfresco.parseRef(storageRef);
        if (!nodeId) throw new Error(`Référence Alfresco invalide : ${storageRef}`);
        const cfg = await alfresco.getConfig();
        const buffer = await alfresco.getContent(cfg, nodeId);
        let filename;
        try {
            const node = await alfresco.getNode(cfg, nodeId);
            filename = node?.name;
        } catch { /* le nom sera reconstitué par l'appelant */ }
        return { buffer, filename };
    },

    async delete(storageRef) {
        const nodeId = alfresco.parseRef(storageRef);
        if (!nodeId) return;
        try {
            const cfg = await alfresco.getConfig();
            await alfresco.remove(cfg, nodeId);
        } catch (e) {
            // Suppression best-effort : ne bloque jamais l'appelant.
            console.warn('[ALFRESCO] suppression échouée:', e.message);
        }
    },

    async exists(storageRef) {
        const nodeId = alfresco.parseRef(storageRef);
        if (!nodeId) return false;
        try {
            const cfg = await alfresco.getConfig();
            return await alfresco.exists(cfg, nodeId);
        } catch {
            return false;
        }
    },
};
