/**
 * Service documents — API stable utilisée par tous les modules.
 *
 * Aucun module ne doit appeler directement les adaptateurs ou shared/storage.js
 * pour les pièces jointes ; tout passe par ici. Le backend de stockage (SMB,
 * Alfresco) est transparent pour l'appelant.
 *
 * Modèle :
 *   documents          : doc logique (module, entity_type, entity_id, title, current_version, metadata)
 *   document_versions  : N versions par doc (version, filename, original_name, storage_backend, storage_ref, ...)
 *
 * Métadonnées : objet libre persisté en JSONB. Convention :
 *   document.metadata    : champs propres à la pièce (catégorie, nature, est_principal, etc.)
 *   version.metadata     : champs propres à cette version (commentaire, sha256, etc.)
 */
const { pgDb } = require('./database');
const documentStorage = require('./document_storage');
const { getAdapterByName } = documentStorage;
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Écrit un fichier dans le(s) backend(s) configurés pour le module.
 *   - filesystem : local/SMB uniquement (principal = smb)
 *   - alfresco   : GED Alfresco uniquement
 *   - both       : local (principal) + copie Alfresco ; la référence GED est
 *                  consignée dans les métadonnées de version (alfresco.ref).
 * @returns {Promise<{storageRef:string, storageBackend:string, versionMetadata:Object}>}
 */
async function writeDocumentToStorage(file, { module: moduleName, entityType, entityId }) {
    const backend = await documentStorage.getBackendForModule(moduleName);

    if (backend === 'alfresco') {
        const storageRef = await documentStorage.alfrescoAdapter.write(file, { module: moduleName, entityType, entityId });
        return { storageRef, storageBackend: 'alfresco', versionMetadata: {} };
    }

    // filesystem ou both → le stockage local est le principal.
    const storageRef = await documentStorage.smbAdapter.write(file, { module: moduleName, entityType, entityId });
    const versionMetadata = {};
    if (backend === 'both') {
        try {
            const ref = await documentStorage.alfrescoAdapter.write(file, { module: moduleName, entityType, entityId });
            versionMetadata.alfresco = { ref };
        } catch (e) {
            versionMetadata.alfresco_error = e.message;
            console.warn(`[DOCS] double écriture Alfresco échouée (${moduleName}):`, e.message);
        }
    }
    return { storageRef, storageBackend: 'smb', versionMetadata };
}

/** Supprime une version de tous les backends où elle est présente (best-effort). */
async function deleteVersionStorage(versionRow) {
    const refs = [];
    if (versionRow.storage_ref) refs.push({ backend: versionRow.storage_backend, ref: versionRow.storage_ref });
    const meta = typeof versionRow.metadata === 'string' ? JSON.parse(versionRow.metadata || '{}') : (versionRow.metadata || {});
    if (meta && meta.alfresco && meta.alfresco.ref && meta.alfresco.ref !== versionRow.storage_ref) {
        refs.push({ backend: 'alfresco', ref: meta.alfresco.ref });
    }
    for (const { backend, ref } of refs) {
        try { await getAdapterByName(backend).delete(ref); } catch (e) { /* ignore */ }
    }
}

function normaliseTitle(file, explicitTitle) {
    if (explicitTitle && String(explicitTitle).trim()) return String(explicitTitle).trim();
    if (file && file.originalname) return String(file.originalname);
    return 'document';
}

function rowToDoc(row) {
    if (!row) return null;
    return {
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
    };
}

function rowToVersion(row) {
    if (!row) return null;
    return {
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
    };
}

// ─── API publique ────────────────────────────────────────────────────────────

/**
 * Crée un nouveau document logique avec sa version 1.
 *
 * @param {Object}   p
 * @param {Object}   p.file        objet multer (buffer, originalname, mimetype, size)
 * @param {string}   p.module      ex. 'projets', 'tickets', 'certificats'
 * @param {string}   p.entityType  ex. 'attachment', 'version_document', 'note_file', 'invoice'
 * @param {string}   p.entityId    id de l'entité propriétaire (sera converti en string)
 * @param {string}  [p.title]      défaut: originalname
 * @param {Object}  [p.metadata]   métadonnées du document
 * @param {Object}  [p.versionMetadata] métadonnées spécifiques à la 1ère version
 * @param {string}  [p.uploadedBy] username
 * @returns {{document, version}}
 */
async function uploadDocument({ file, module: moduleName, entityType = 'attachment', entityId, title, metadata = {}, versionMetadata = {}, uploadedBy }) {
    if (!file) throw new Error('Fichier requis');
    if (!moduleName) throw new Error('module requis');
    if (entityId === undefined || entityId === null) throw new Error('entityId requis');

    const { storageRef, storageBackend, versionMetadata: extraMeta } = await writeDocumentToStorage(file, { module: moduleName, entityType, entityId });

    const docRow = await pgDb.get(
        `INSERT INTO hub_docs.documents (module, entity_type, entity_id, title, current_version, metadata, created_by)
         VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6) RETURNING *`,
        [moduleName, entityType, String(entityId), normaliseTitle(file, title), JSON.stringify(metadata || {}), uploadedBy || null]
    );

    const verRow = await pgDb.get(
        `INSERT INTO hub_docs.document_versions
            (document_id, version, filename, original_name, mimetype, size, storage_backend, storage_ref, metadata, uploaded_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING *`,
        [docRow.id, file.originalname, file.originalname, file.mimetype || null, file.size || null,
         storageBackend, storageRef, JSON.stringify({ ...(versionMetadata || {}), ...extraMeta }), uploadedBy || null]
    );

    return { document: rowToDoc(docRow), version: rowToVersion(verRow) };
}

/**
 * Ajoute une nouvelle version à un document existant (incrémente current_version).
 *
 * @param {number|string} documentId
 * @param {Object} p { file, uploadedBy, metadata }
 */
async function addVersion(documentId, { file, uploadedBy, metadata = {} } = {}) {
    if (!file) throw new Error('Fichier requis');
    const doc = await pgDb.get('SELECT * FROM hub_docs.documents WHERE id = $1 AND deleted_at IS NULL', [documentId]);
    if (!doc) throw new Error('Document introuvable');

    const { storageRef, storageBackend, versionMetadata: extraMeta } = await writeDocumentToStorage(file, { module: doc.module, entityType: doc.entity_type, entityId: doc.entity_id });

    const newVersion = (doc.current_version || 0) + 1;
    await pgDb.run('UPDATE hub_docs.documents SET current_version = $1, updated_at = NOW() WHERE id = $2', [newVersion, doc.id]);

    const verRow = await pgDb.get(
        `INSERT INTO hub_docs.document_versions
            (document_id, version, filename, original_name, mimetype, size, storage_backend, storage_ref, metadata, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING *`,
        [doc.id, newVersion, file.originalname, file.originalname, file.mimetype || null, file.size || null,
         storageBackend, storageRef, JSON.stringify({ ...(metadata || {}), ...extraMeta }), uploadedBy || null]
    );

    return rowToVersion(verRow);
}

/** Renvoie un document + toutes ses versions (triées par version desc). */
async function getDocument(documentId) {
    const doc = await pgDb.get('SELECT * FROM hub_docs.documents WHERE id = $1 AND deleted_at IS NULL', [documentId]);
    if (!doc) return null;
    const versions = await pgDb.all(
        'SELECT * FROM hub_docs.document_versions WHERE document_id = $1 ORDER BY version DESC',
        [doc.id]
    );
    return { ...rowToDoc(doc), versions: versions.map(rowToVersion) };
}

/** Renvoie uniquement les versions d'un document. */
async function listVersions(documentId) {
    const versions = await pgDb.all(
        'SELECT * FROM hub_docs.document_versions WHERE document_id = $1 ORDER BY version DESC',
        [documentId]
    );
    return versions.map(rowToVersion);
}

/**
 * Renvoie de quoi servir le contenu d'une version :
 *   { buffer | absolutePath, filename, mimetype, originalName, version, backend }
 * ou null si introuvable.
 *
 * Si versionNumber n'est pas fourni, renvoie la version courante.
 */
async function readVersion(documentId, versionNumber) {
    const doc = await pgDb.get('SELECT * FROM hub_docs.documents WHERE id = $1 AND deleted_at IS NULL', [documentId]);
    if (!doc) return null;
    const v = versionNumber
        ? await pgDb.get('SELECT * FROM hub_docs.document_versions WHERE document_id = $1 AND version = $2', [doc.id, versionNumber])
        : await pgDb.get('SELECT * FROM hub_docs.document_versions WHERE document_id = $1 AND version = $2', [doc.id, doc.current_version]);
    if (!v) return null;

    const primary = getAdapterByName(v.storage_backend);
    let f = null;
    try { f = await primary.read(v.storage_ref); } catch (e) { f = null; }
    if (!f) {
        // Repli : en mode double écriture, la copie Alfresco peut servir de secours.
        const meta = typeof v.metadata === 'string' ? JSON.parse(v.metadata || '{}') : (v.metadata || {});
        const altRef = meta && meta.alfresco && meta.alfresco.ref;
        if (altRef) {
            try { f = await getAdapterByName('alfresco').read(altRef); } catch (e) { f = null; }
        }
    }
    if (!f) return null;

    return {
        ...f,
        filename: f.filename || v.original_name,
        mimetype: v.mimetype,
        originalName: v.original_name,
        version: v.version,
        backend: v.storage_backend,
    };
}

/** Liste tous les documents (non supprimés) d'un module (toutes entités confondues). */
async function listByModule(moduleName, { limit = 500 } = {}) {
    const rows = await pgDb.all(
        `SELECT * FROM hub_docs.documents
         WHERE module = $1 AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT $2`,
        [moduleName, limit]
    );
    return rows.map(rowToDoc);
}

/** Liste les documents (non supprimés) d'une entité. */
async function listByEntity(moduleName, entityType, entityId) {
    const rows = await pgDb.all(
        `SELECT d.*,
                (SELECT row_to_json(v) FROM hub_docs.document_versions v
                 WHERE v.document_id = d.id AND v.version = d.current_version) AS current_version_row
         FROM hub_docs.documents d
         WHERE d.module = $1 AND d.entity_type = $2 AND d.entity_id = $3 AND d.deleted_at IS NULL
         ORDER BY d.created_at DESC`,
        [moduleName, entityType, String(entityId)]
    );
    return rows.map(r => ({
        ...rowToDoc(r),
        current_version_row: r.current_version_row && typeof r.current_version_row === 'string'
            ? JSON.parse(r.current_version_row) : r.current_version_row,
    }));
}

/** Cherche un document par (module, entity_type, entity_id, title). Utile pour upsert. */
async function findByTitle(moduleName, entityType, entityId, title) {
    const row = await pgDb.get(
        `SELECT * FROM hub_docs.documents
         WHERE module = $1 AND entity_type = $2 AND entity_id = $3 AND title = $4 AND deleted_at IS NULL
         LIMIT 1`,
        [moduleName, entityType, String(entityId), title]
    );
    return rowToDoc(row);
}

/**
 * Upload "intelligent" : si un document avec ce titre existe déjà pour
 * (module, entityType, entityId), ajoute une nouvelle version au lieu de créer
 * un nouveau document. Sinon, crée un nouveau document.
 */
async function uploadOrAddVersion(args) {
    const title = normaliseTitle(args.file, args.title);
    const existing = await findByTitle(args.module, args.entityType || 'attachment', args.entityId, title);
    if (existing) {
        const version = await addVersion(existing.id, { file: args.file, uploadedBy: args.uploadedBy, metadata: args.versionMetadata || {} });
        return { document: existing, version, reused: true };
    }
    const created = await uploadDocument({ ...args, title });
    return { ...created, reused: false };
}

/**
 * Soft-delete : marque deleted_at. Le fichier physique n'est PAS supprimé
 * (politique conservatrice pour le versionning). Utiliser purgeDocument pour
 * une suppression complète.
 */
async function softDeleteDocument(documentId) {
    await pgDb.run('UPDATE hub_docs.documents SET deleted_at = NOW() WHERE id = $1', [documentId]);
}

/** Suppression dure : supprime toutes les versions du stockage + la ligne BD. */
async function purgeDocument(documentId) {
    const versions = await pgDb.all('SELECT * FROM hub_docs.document_versions WHERE document_id = $1', [documentId]);
    for (const v of versions) {
        await deleteVersionStorage(v);
    }
    await pgDb.run('DELETE FROM hub_docs.documents WHERE id = $1', [documentId]);
}

/** Supprime une seule version (sans toucher au reste). Décrémente current_version si besoin. */
async function deleteVersion(documentId, versionNumber) {
    const v = await pgDb.get('SELECT * FROM hub_docs.document_versions WHERE document_id = $1 AND version = $2', [documentId, versionNumber]);
    if (!v) return;
    await deleteVersionStorage(v);
    await pgDb.run('DELETE FROM hub_docs.document_versions WHERE id = $1', [v.id]);
    // Recale current_version sur la plus haute restante
    const top = await pgDb.get('SELECT MAX(version) AS v FROM hub_docs.document_versions WHERE document_id = $1', [documentId]);
    if (top && top.v) {
        await pgDb.run('UPDATE hub_docs.documents SET current_version = $1, updated_at = NOW() WHERE id = $2', [top.v, documentId]);
    } else {
        await pgDb.run('UPDATE hub_docs.documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [documentId]);
    }
}

/**
 * Enregistre dans hub_docs un upload déjà effectué via une autre voie
 * (ex: ancien module qui appelle storage.saveFile lui-même). Utile pour le
 * dual-write : le module continue d'écrire dans sa propre table, ET signale
 * la présence du document dans le système centralisé.
 *
 * Si un document avec le même (module, entityType, entityId, title) existe
 * déjà, ajoute une nouvelle version au lieu d'en créer un nouveau.
 */
async function registerExternalUpload({
    module: moduleName, entityType = 'attachment', entityId, title,
    filename, originalName, mimetype, size,
    storageRef, storageBackend = 'smb',
    metadata = {}, versionMetadata = {}, uploadedBy,
}) {
    if (!moduleName || entityId === undefined || entityId === null || !storageRef) {
        return null;
    }
    const finalTitle = title || originalName || filename || 'document';

    // Double écriture / GED : si le module cible Alfresco (ou les deux) et que
    // l'appelant a écrit en local, on dépose une copie dans la GED.
    const moduleBackend = await documentStorage.getBackendForModule(moduleName);
    const mergedVersionMeta = { ...(versionMetadata || {}) };
    if ((moduleBackend === 'both' || moduleBackend === 'alfresco')
        && documentStorage.normalizeBackend(storageBackend) === 'filesystem'
        && !(mergedVersionMeta.alfresco && mergedVersionMeta.alfresco.ref)) {
        try {
            const src = await documentStorage.smbAdapter.read(storageRef);
            if (src && src.buffer) {
                const ref = await documentStorage.alfrescoAdapter.write(
                    { buffer: src.buffer, originalname: originalName || filename || 'fichier', mimetype },
                    { module: moduleName, entityType, entityId }
                );
                mergedVersionMeta.alfresco = { ref, copied: true };
            }
        } catch (e) {
            mergedVersionMeta.alfresco_error = e.message;
            console.warn(`[DOCS] copie Alfresco échouée (${moduleName}):`, e.message);
        }
    }

    const existing = await findByTitle(moduleName, entityType, entityId, finalTitle);

    if (existing) {
        const newVersion = (existing.current_version || 0) + 1;
        await pgDb.run('UPDATE hub_docs.documents SET current_version = $1, updated_at = NOW() WHERE id = $2', [newVersion, existing.id]);
        const verRow = await pgDb.get(
            `INSERT INTO hub_docs.document_versions
                (document_id, version, filename, original_name, mimetype, size, storage_backend, storage_ref, metadata, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING *`,
            [existing.id, newVersion, filename || originalName || 'fichier', originalName || filename || 'fichier',
             mimetype || null, size || null, storageBackend, storageRef,
             JSON.stringify(mergedVersionMeta), uploadedBy || null]
        );
        return { document: existing, version: rowToVersion(verRow), reused: true };
    }

    const docRow = await pgDb.get(
        `INSERT INTO hub_docs.documents (module, entity_type, entity_id, title, current_version, metadata, created_by)
         VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6) RETURNING *`,
        [moduleName, entityType, String(entityId), finalTitle, JSON.stringify(metadata || {}), uploadedBy || null]
    );
    const verRow = await pgDb.get(
        `INSERT INTO hub_docs.document_versions
            (document_id, version, filename, original_name, mimetype, size, storage_backend, storage_ref, metadata, uploaded_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING *`,
        [docRow.id, filename || originalName || 'fichier', originalName || filename || 'fichier',
         mimetype || null, size || null, storageBackend, storageRef,
         JSON.stringify(mergedVersionMeta), uploadedBy || null]
    );
    return { document: rowToDoc(docRow), version: rowToVersion(verRow), reused: false };
}

/** Indique si un type mime peut être prévisualisé inline (PDF + images). */
function isPreviewable(mimetype) {
    if (!mimetype) return false;
    const m = String(mimetype).toLowerCase();
    return m === 'application/pdf' || m.startsWith('image/');
}

module.exports = {
    uploadDocument,
    addVersion,
    getDocument,
    listVersions,
    readVersion,
    listByEntity,
    listByModule,
    findByTitle,
    uploadOrAddVersion,
    softDeleteDocument,
    purgeDocument,
    deleteVersion,
    isPreviewable,
    registerExternalUpload,
};
