/**
 * Adaptateur SMB — réutilise shared/storage.js (qui gère lui-même SMB ou FS local).
 *
 * Contrat : { write(file, hints) → storageRef, read(storageRef) → {buffer|absolutePath, filename},
 *            delete(storageRef), exists(storageRef) }
 *
 * storageRef est le "dbPath" de la forme storage/<module>/<entityId>/<filename>.
 */
const storage = require('../storage');

module.exports = {
    backendName: 'smb',

    async write(file, { module: moduleName, entityId }) {
        if (file && file.originalname) file.originalname = storage.fixUploadName(file.originalname);
        const saved = await storage.saveFile(moduleName, entityId, file);
        return saved.dbPath;
    },

    async read(storageRef) {
        return await storage.getFileForServe(storageRef);
    },

    async delete(storageRef) {
        try { await storage.deleteFile(storageRef); } catch (e) { /* ignore */ }
    },

    async exists(storageRef) {
        const f = await storage.getFileForServe(storageRef);
        return !!f;
    },
};
