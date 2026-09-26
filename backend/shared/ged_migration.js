/**
 * Migration / bascule de stockage GED ↔ filesystem, avec vérification.
 *
 * Objectif : pour un module donné, copier les documents d'un environnement vers
 * l'autre (FS → GED ou GED → FS), en vérifiant l'intégrité par empreinte SHA-256.
 *
 * Principe (décision produit) : NON DESTRUCTIF — la source n'est jamais
 * supprimée. La bascule consiste donc à garantir la présence d'une copie dans
 * l'environnement cible, et à la consigner (métadonnées de version + journal
 * hub_docs.ged_migration_log).
 *
 * Sources prises en charge :
 *   - hub_docs.document_versions du module (chemins storage/<module>/... ou alf:<node>)
 *   - fichiers orphelins présents sous storage/<module>/... (non référencés par hub_docs)
 *   - tables métier historiques (registre LEGACY_SOURCES, ex. hub.certificates.file_path)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pgDb } = require('./database');
const documentStorage = require('./document_storage');
const storage = require('./storage');

const BACKEND_ROOT = path.join(__dirname, '..');

/** Tables métier dont un fichier doit aussi être basculé. */
const LEGACY_SOURCES = {
    certificats: { table: 'hub.certificates', idCol: 'id', pathCol: 'file_path', module: 'certificats' },
};

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function newRunId() { return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function parseMeta(m) { try { return typeof m === 'string' ? JSON.parse(m || '{}') : (m || {}); } catch { return {}; } }

/** Lit le contenu d'une référence (backend smb/filesystem ou alfresco). */
async function readRef(backend, ref) {
    const adapter = documentStorage.getAdapterByName(backend);
    const f = await adapter.read(ref);
    if (!f) return null;
    if (f.buffer) return f.buffer;
    if (f.absolutePath) return fs.readFileSync(f.absolutePath);
    return null;
}

/**
 * Repli pour les chemins "bruts" pré-unification du stockage (sans préfixe
 * storage/, ex. "1779891711060_79.pdf") : storage.getFileForServe() ne sait
 * résoudre que le nouveau schéma storage/<module>/<id>/... et cherche donc ce
 * chemin brut à la racine du stockage cible (UNC), où il n'a jamais existé —
 * ces fichiers vivent encore à la racine du backend ou dans l'ancien uploads/.
 * Même logique que handleLegacyRow ci-dessous, factorisée pour être réutilisée
 * par handleVersion (hub_docs.document_versions) sur tous les modules.
 */
function readLegacyLocalFile(filePath) {
    const candidates = [path.join(BACKEND_ROOT, filePath), path.join(BACKEND_ROOT, 'uploads', filePath)];
    const found = candidates.find((p) => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; } });
    return found ? fs.readFileSync(found) : null;
}

/** Écrit un buffer dans l'environnement cible ; renvoie la référence cible. */
async function writeRef(direction, { buffer, originalname, mimetype, module, entityType, entityId }) {
    const file = { buffer, originalname: originalname || 'fichier', mimetype: mimetype || 'application/octet-stream' };
    if (direction === 'fs2ged') {
        return await documentStorage.alfrescoAdapter.write(file, { module, entityType, entityId });
    }
    return await documentStorage.smbAdapter.write(file, { module, entityType, entityId });
}

async function logItem(entry) {
    try {
        await pgDb.run(
            `INSERT INTO hub_docs.ged_migration_log
                (module, direction, item_type, item_ref, source_ref, target_ref, size_bytes, sha256_source, sha256_target, status, error, run_id, dry_run, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [entry.module, entry.direction, entry.itemType, entry.itemRef, entry.sourceRef || null, entry.targetRef || null,
             entry.sizeBytes ?? null, entry.sha256Source || null, entry.sha256Target || null, entry.status,
             entry.error || null, entry.runId, !!entry.dryRun, entry.createdBy || null]
        );
    } catch (e) { console.warn('[GED-MIGRATION] journal non écrit:', e.message); }
}

/** Copie vérifiée d'un buffer vers la cible. */
async function copyAndVerify({ buffer, direction, module, entityType, entityId, originalname, mimetype }) {
    const srcHash = sha256(buffer);
    const targetRef = await writeRef(direction, { buffer, originalname, mimetype, module, entityType, entityId });
    const targetBackend = direction === 'fs2ged' ? 'alfresco' : 'filesystem';
    const readBack = await readRef(targetBackend, targetRef).catch(() => null);
    const targetHash = readBack ? sha256(readBack) : null;
    return { targetRef, srcHash, targetHash, verified: !!targetHash && targetHash === srcHash };
}

// ─── hub_docs.document_versions ──────────────────────────────────────────────

async function handleVersion(v, dir, dryRun, runId, createdBy, report) {
    const meta = parseMeta(v.metadata);
    const base = {
        module: v.d_module, direction: dir, itemType: 'hub_docs_version', itemRef: String(v.id),
        runId, dryRun, createdBy, sizeBytes: v.size,
    };
    const target = { module: v.d_module, entityType: v.entity_type, entityId: v.entity_id };

    if (dir === 'fs2ged') {
        if (v.storage_backend === 'alfresco' || (meta.alfresco && meta.alfresco.ref)) {
            report.skipped++;
            report.items.push({ ...base, status: 'deja_ged' });
            return;
        }
        report.scanned++;
        if (dryRun) {
            report.planned++;
            report.items.push({ ...base, status: 'a_copier', sourceRef: v.storage_ref });
            return;
        }
        try {
            let buf = await readRef('filesystem', v.storage_ref);
            if (!buf && !storage.isStoragePath(v.storage_ref)) {
                // Chemin pré-unification (pas de préfixe storage/) : chercher dans
                // l'ancien emplacement local avant de déclarer le fichier manquant.
                buf = readLegacyLocalFile(v.storage_ref);
            }
            if (!buf) {
                report.missing = (report.missing || 0) + 1;
                report.items.push({ ...base, status: 'manquant' });
                await logItem({ ...base, status: 'manquant', sourceRef: v.storage_ref, error: 'Fichier source introuvable' });
                return;
            }
            const { targetRef, srcHash, targetHash, verified } = await copyAndVerify({
                buffer: buf, direction: dir, ...target, originalname: v.original_name, mimetype: v.mimetype,
            });
            if (!verified) throw new Error('Vérification SHA-256 échouée');
            meta.alfresco = { ref: targetRef, sha256: srcHash, copied_at: new Date().toISOString() };
            await pgDb.run('UPDATE hub_docs.document_versions SET metadata = ?::jsonb WHERE id = ?', [JSON.stringify(meta), v.id]);
            report.migrated++;
            report.items.push({ ...base, status: 'ok', targetRef, sha256Source: srcHash, sha256Target: targetHash });
            await logItem({ ...base, status: 'ok', sourceRef: v.storage_ref, targetRef, sha256Source: srcHash, sha256Target: targetHash });
        } catch (e) {
            report.errors.push({ itemRef: base.itemRef, error: e.message });
            report.items.push({ ...base, status: 'erreur', error: e.message });
            await logItem({ ...base, status: 'erreur', sourceRef: v.storage_ref, error: e.message });
        }
        return;
    }

    // ged2fs
    const srcRef = v.storage_backend === 'alfresco' ? v.storage_ref : (meta.alfresco && meta.alfresco.ref);
    if (!srcRef || (meta.local && meta.local.ref)) {
        report.skipped++;
        report.items.push({ ...base, status: srcRef ? 'deja_local' : 'pas_de_copie_ged' });
        return;
    }
    report.scanned++;
    if (dryRun) {
        report.planned++;
        report.items.push({ ...base, status: 'a_copier', sourceRef: srcRef });
        return;
    }
    try {
        const buf = await readRef('alfresco', srcRef);
        if (!buf) {
            report.missing = (report.missing || 0) + 1;
            report.items.push({ ...base, status: 'manquant', sourceRef: srcRef });
            await logItem({ ...base, status: 'manquant', sourceRef: srcRef, error: 'Fichier GED introuvable' });
            return;
        }
        const { targetRef, srcHash, targetHash, verified } = await copyAndVerify({
            buffer: buf, direction: dir, ...target, originalname: v.original_name, mimetype: v.mimetype,
        });
        if (!verified) throw new Error('Vérification SHA-256 échouée');
        meta.local = { ref: targetRef, sha256: srcHash, copied_at: new Date().toISOString() };
        await pgDb.run('UPDATE hub_docs.document_versions SET metadata = ?::jsonb WHERE id = ?', [JSON.stringify(meta), v.id]);
        report.migrated++;
        report.items.push({ ...base, status: 'ok', targetRef, sha256Source: srcHash, sha256Target: targetHash });
        await logItem({ ...base, status: 'ok', sourceRef: srcRef, targetRef, sha256Source: srcHash, sha256Target: targetHash });
    } catch (e) {
        report.errors.push({ itemRef: base.itemRef, error: e.message });
        report.items.push({ ...base, status: 'erreur', error: e.message });
        await logItem({ ...base, status: 'erreur', sourceRef: srcRef, error: e.message });
    }
}

// ─── Fichiers orphelins sous storage/<module>/... ────────────────────────────

async function getModuleFiles(module) {
    const out = [];
    const walk = async (rel) => {
        let r;
        try { r = await storage.listDirectory(rel); } catch { return; }
        for (const ent of r.entries) {
            if (ent.isFolder) await walk(ent.relPath);
            else out.push({ dbPath: `storage/${ent.relPath}`, relPath: ent.relPath, size: ent.size });
        }
    };
    await walk(module);
    return out;
}

async function handleOrphanFile(file, dir, dryRun, runId, createdBy, report, knownRefs) {
    if (dir !== 'fs2ged') return;
    if (knownRefs.has(file.dbPath)) return;
    const parts = file.relPath.split('/');
    const entityId = parts.length >= 3 ? parts[1] : 'divers';
    const base = {
        module: parts[0], direction: dir, itemType: 'storage_file', itemRef: file.dbPath,
        runId, dryRun, createdBy, sizeBytes: file.size,
    };
    report.scanned++;
    if (dryRun) {
        report.planned++;
        report.items.push({ ...base, status: 'a_copier' });
        return;
    }
    try {
        const f = await storage.getFileForServe(file.dbPath);
        const buf = f && f.buffer ? f.buffer : (f && f.absolutePath ? fs.readFileSync(f.absolutePath) : null);
        if (!buf) {
            report.missing = (report.missing || 0) + 1;
            report.items.push({ ...base, status: 'manquant' });
            await logItem({ ...base, status: 'manquant', sourceRef: file.dbPath, error: 'Fichier introuvable' });
            return;
        }
        const { targetRef, srcHash, targetHash, verified } = await copyAndVerify({
            buffer: buf, direction: dir, module: parts[0], entityType: 'storage', entityId, originalname: path.basename(file.relPath),
        });
        if (!verified) throw new Error('Vérification SHA-256 échouée');
        report.migrated++;
        report.items.push({ ...base, status: 'ok', targetRef, sha256Source: srcHash, sha256Target: targetHash });
        await logItem({ ...base, status: 'ok', sourceRef: file.dbPath, targetRef, sha256Source: srcHash, sha256Target: targetHash });
    } catch (e) {
        report.errors.push({ itemRef: base.itemRef, error: e.message });
        report.items.push({ ...base, status: 'erreur', error: e.message });
        await logItem({ ...base, status: 'erreur', sourceRef: file.dbPath, error: e.message });
    }
}

// ─── Tables métier historiques ───────────────────────────────────────────────

async function handleLegacyRow(row, src, dir, dryRun, runId, createdBy, report) {
    if (dir !== 'fs2ged') return;
    const filePath = row[src.pathCol];
    if (!filePath) return;
    const itemRef = `${src.table}:${row[src.idCol]}`;
    const base = { module: src.module, direction: dir, itemType: 'legacy_file', itemRef, runId, dryRun, createdBy };
    report.scanned++;
    if (dryRun) {
        report.planned++;
        report.items.push({ ...base, status: 'a_copier', sourceRef: filePath });
        return;
    }
    try {
        let buf = null;
        if (storage.isStoragePath(filePath)) {
            const f = await storage.getFileForServe(filePath);
            buf = f && f.buffer ? f.buffer : (f && f.absolutePath ? fs.readFileSync(f.absolutePath) : null);
        } else {
            buf = readLegacyLocalFile(filePath);
        }
        if (!buf) {
            report.missing = (report.missing || 0) + 1;
            report.items.push({ ...base, status: 'manquant', sourceRef: filePath });
            await logItem({ ...base, status: 'manquant', sourceRef: filePath, error: 'Fichier source introuvable' });
            return;
        }
        const originalname = path.basename(filePath);
        const { targetRef, srcHash, targetHash, verified } = await copyAndVerify({
            buffer: buf, direction: dir, module: src.module, entityType: 'legacy', entityId: row[src.idCol], originalname,
        });
        if (!verified) throw new Error('Vérification SHA-256 échouée');
        report.migrated++;
        report.items.push({ ...base, status: 'ok', targetRef, sha256Source: srcHash, sha256Target: targetHash });
        await logItem({ ...base, status: 'ok', sourceRef: filePath, targetRef, sha256Source: srcHash, sha256Target: targetHash });
    } catch (e) {
        report.errors.push({ itemRef, error: e.message });
        report.items.push({ ...base, status: 'erreur', error: e.message });
        await logItem({ ...base, status: 'erreur', sourceRef: filePath, error: e.message });
    }
}

// ─── Entrée principale ───────────────────────────────────────────────────────

/**
 * @param {Object} p
 * @param {string} p.module      ex. 'certificats'
 * @param {'fs2ged'|'ged2fs'} p.direction
 * @param {boolean} [p.dryRun]   true = simulation (aucune écriture, sauf journal désactivé)
 * @param {boolean} [p.includeStorage]  inclure les fichiers orphelins storage/<module>/... (défaut true)
 * @param {boolean} [p.includeLegacy]   inclure les tables métier (défaut true)
 * @param {string}  [p.createdBy]
 */
async function runMigration({ module, direction, dryRun = false, includeStorage = true, includeLegacy = true, createdBy = null }) {
    const dir = direction === 'ged2fs' ? 'ged2fs' : 'fs2ged';
    const runId = newRunId();
    const report = { runId, module, direction: dir, dryRun, scanned: 0, planned: 0, migrated: 0, skipped: 0, missing: 0, errors: [], items: [] };

    // 1. Versions hub_docs du module
    const versions = await pgDb.all(
        `SELECT v.*, d.module AS d_module, d.entity_type, d.entity_id
         FROM hub_docs.document_versions v
         JOIN hub_docs.documents d ON d.id = v.document_id
         WHERE d.module = ? AND d.deleted_at IS NULL
         ORDER BY v.id`,
        [module]
    );
    const knownRefs = new Set(versions.map((v) => v.storage_ref));
    for (const v of versions) {
        await handleVersion(v, dir, dryRun, runId, createdBy, report);
    }

    // 2. Fichiers orphelins sous storage/<module>/...
    if (includeStorage && dir === 'fs2ged') {
        const files = await getModuleFiles(module);
        for (const f of files) {
            await handleOrphanFile(f, dir, dryRun, runId, createdBy, report, knownRefs);
        }
    }

    // 3. Tables métier historiques
    if (includeLegacy && dir === 'fs2ged' && LEGACY_SOURCES[module]) {
        const src = LEGACY_SOURCES[module];
        let rows = [];
        try {
            rows = await pgDb.all(`SELECT ${src.idCol}, ${src.pathCol} FROM ${src.table} WHERE ${src.pathCol} IS NOT NULL AND ${src.pathCol} <> ''`);
        } catch (e) { report.errors.push({ itemRef: src.table, error: e.message }); }
        for (const row of rows) {
            await handleLegacyRow(row, src, dir, dryRun, runId, createdBy, report);
        }
    }

    report.items = report.items.slice(0, 500);
    return report;
}

/** Historique des bascules (journal). */
async function history({ module, limit = 100 } = {}) {
    const rows = module
        ? await pgDb.all('SELECT * FROM hub_docs.ged_migration_log WHERE module = ? ORDER BY id DESC LIMIT ?', [module, limit])
        : await pgDb.all('SELECT * FROM hub_docs.ged_migration_log ORDER BY id DESC LIMIT ?', [limit]);
    return rows;
}

module.exports = {
    LEGACY_SOURCES,
    runMigration,
    history,
};
