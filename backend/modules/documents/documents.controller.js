/**
 * Controller HTTP du module documents centralisé.
 *
 * Toutes les routes manipulent l'API du service shared/documents.service.js.
 * Aucune logique de stockage ici : le service est agnostique du backend.
 */
const path = require('path');
const docs = require('../../shared/documents.service');

/** Sécurise un nom de fichier pour l'entête Content-Disposition. */
function dispositionFilename(name) {
    return `filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Sert un fichier (PDF/image inline ou téléchargement) depuis un descripteur readVersion(). */
function sendContent(res, fileDesc, { inline }) {
    const disposition = (inline ? 'inline' : 'attachment') + '; ' + dispositionFilename(fileDesc.originalName || fileDesc.filename || 'document');
    res.setHeader('Content-Disposition', disposition);
    if (fileDesc.mimetype) res.type(fileDesc.mimetype);
    else res.type(path.extname(fileDesc.originalName || fileDesc.filename || '') || 'application/octet-stream');
    if (fileDesc.absolutePath) return res.sendFile(fileDesc.absolutePath);
    return res.send(fileDesc.buffer);
}

module.exports = {
    // POST /api/documents (multipart "file" + body { module, entityType, entityId, title?, metadata?, versionMetadata? })
    async upload(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
            const { module: moduleName, entityType, entityId, title } = req.body || {};
            if (!moduleName || !entityId) return res.status(400).json({ error: 'module et entityId requis' });

            let metadata = {};
            let versionMetadata = {};
            try { if (req.body.metadata) metadata = JSON.parse(req.body.metadata); } catch (e) {}
            try { if (req.body.versionMetadata) versionMetadata = JSON.parse(req.body.versionMetadata); } catch (e) {}

            const result = await docs.uploadDocument({
                file: req.file,
                module: moduleName,
                entityType: entityType || 'attachment',
                entityId,
                title,
                metadata,
                versionMetadata,
                uploadedBy: req.user?.username,
            });
            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST /api/documents/:id/versions (multipart "file" + body { metadata? })
    async addVersion(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
            let metadata = {};
            try { if (req.body.metadata) metadata = JSON.parse(req.body.metadata); } catch (e) {}
            const v = await docs.addVersion(req.params.id, {
                file: req.file,
                uploadedBy: req.user?.username,
                metadata,
            });
            res.status(201).json(v);
        } catch (error) {
            const code = /introuvable/i.test(error.message) ? 404 : 500;
            res.status(code).json({ error: error.message });
        }
    },

    // GET /api/documents/:id
    async getDocument(req, res) {
        try {
            const doc = await docs.getDocument(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Document introuvable' });
            res.json(doc);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/documents/:id/content?mode=inline|attachment
    async getCurrentContent(req, res) {
        try {
            const f = await docs.readVersion(req.params.id);
            if (!f) return res.status(404).json({ error: 'Fichier introuvable' });
            sendContent(res, f, { inline: req.query.mode === 'inline' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/documents/:id/versions/:v/content?mode=inline|attachment
    async getVersionContent(req, res) {
        try {
            const f = await docs.readVersion(req.params.id, parseInt(req.params.v, 10));
            if (!f) return res.status(404).json({ error: 'Fichier introuvable' });
            sendContent(res, f, { inline: req.query.mode === 'inline' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/documents/by-module?module=&limit=
    async listByModule(req, res) {
        try {
            const { module: moduleName, limit } = req.query;
            if (!moduleName) return res.status(400).json({ error: 'module requis' });
            const list = await docs.listByModule(moduleName, { limit: parseInt(limit, 10) || 500 });
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/documents/by-entity?module=&entityType=&entityId=
    async listByEntity(req, res) {
        try {
            const { module: moduleName, entityType = 'attachment', entityId } = req.query;
            if (!moduleName || !entityId) return res.status(400).json({ error: 'module et entityId requis' });
            const list = await docs.listByEntity(moduleName, entityType, entityId);
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /api/documents/:id  (soft)
    async softDelete(req, res) {
        try {
            await docs.softDeleteDocument(req.params.id);
            res.json({ message: 'Document supprimé' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /api/documents/:id/purge  (hard, supprime aussi les fichiers physiques)
    async purge(req, res) {
        try {
            await docs.purgeDocument(req.params.id);
            res.json({ message: 'Document purgé' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /api/documents/:id/versions/:v
    async deleteVersion(req, res) {
        try {
            await docs.deleteVersion(req.params.id, parseInt(req.params.v, 10));
            res.json({ message: 'Version supprimée' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};
