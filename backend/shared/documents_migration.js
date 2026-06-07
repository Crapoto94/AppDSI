/**
 * Migration one-shot des tables existantes vers hub_docs.
 *
 * Importe les références (pas les fichiers — ils restent au même endroit),
 * idempotente via hub_docs.migration_log.
 *
 * À appeler une fois après setupPgDb au démarrage du serveur.
 */
const path = require('path');
const { pgDb, getSqlite } = require('./database');

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectBackend(filePath) {
    if (!filePath) return 'fs';
    const p = String(filePath).replace(/\\/g, '/');
    if (p.startsWith('storage/')) return 'smb';
    return 'fs';
}

function basenameOf(filePath) {
    if (!filePath) return '';
    return path.basename(String(filePath).replace(/\\/g, '/'));
}

async function isMigrated(sourceTable, sourceId) {
    const row = await pgDb.get(
        'SELECT id FROM hub_docs.migration_log WHERE source_table = $1 AND source_id = $2',
        [sourceTable, String(sourceId)]
    );
    return !!row;
}

async function markMigrated(sourceTable, sourceId, documentId, versionId) {
    try {
        await pgDb.run(
            `INSERT INTO hub_docs.migration_log (source_table, source_id, document_id, version_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (source_table, source_id) DO UPDATE SET document_id = EXCLUDED.document_id, version_id = EXCLUDED.version_id`,
            [sourceTable, String(sourceId), documentId, versionId]
        );
    } catch (e) { /* ignore */ }
}

async function insertDocument({ module: moduleName, entityType, entityId, title, currentVersion = 1, metadata = {}, createdBy, createdAt }) {
    const row = await pgDb.get(
        `INSERT INTO hub_docs.documents (module, entity_type, entity_id, title, current_version, metadata, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, COALESCE($8::timestamptz, NOW())) RETURNING id`,
        [moduleName, entityType, String(entityId), title || 'document', currentVersion, JSON.stringify(metadata || {}), createdBy || null, createdAt || null]
    );
    return row.id;
}

async function insertVersion({ documentId, version, filename, originalName, mimetype, size, storageBackend, storageRef, metadata = {}, uploadedBy, uploadedAt }) {
    const row = await pgDb.get(
        `INSERT INTO hub_docs.document_versions
            (document_id, version, filename, original_name, mimetype, size, storage_backend, storage_ref, metadata, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, COALESCE($11::timestamptz, NOW()))
         ON CONFLICT (document_id, version) DO NOTHING
         RETURNING id`,
        [documentId, version, filename || 'fichier', originalName || filename || 'fichier',
         mimetype || null, size || null, storageBackend || 'smb', storageRef || '',
         JSON.stringify(metadata || {}), uploadedBy || null, uploadedAt || null]
    );
    return row ? row.id : null;
}

// ─── Migrations par module ──────────────────────────────────────────────────

async function migrateCertificats() {
    const SRC = 'hub.certificates';
    const rows = await pgDb.all('SELECT * FROM hub.certificates WHERE file_path IS NOT NULL AND file_path <> $1', ['']);
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const filename = basenameOf(r.file_path);
        const title = r.product_label || r.order_number || filename || `certificat-${r.id}`;
        const docId = await insertDocument({
            module: 'certificats',
            entityType: 'cert',
            entityId: r.id,
            title,
            metadata: {
                order_number: r.order_number || null,
                beneficiary_name: r.beneficiary_name || null,
                product_code: r.product_code || null,
                expiry_date: r.expiry_date || null,
                is_provisional: !!r.is_provisional,
            },
            createdAt: r.uploaded_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename, originalName: filename,
            storageBackend: detectBackend(r.file_path),
            storageRef: r.file_path,
            uploadedAt: r.uploaded_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] certificats: ${imported} importés`);
}

async function migrateContrats() {
    const SRC = 'hub_contrats.contrat_documents';
    const rows = await pgDb.all('SELECT * FROM hub_contrats.contrat_documents WHERE file_path IS NOT NULL AND file_path <> $1', ['']);
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const filename = r.file_name || basenameOf(r.file_path);
        const title = r.nature || filename || `contrat-${r.contrat_id}-doc-${r.id}`;
        const docId = await insertDocument({
            module: 'contrats',
            entityType: 'attachment',
            entityId: r.contrat_id,
            title,
            metadata: { nature: r.nature || null, est_principal: !!r.est_principal },
            createdAt: r.uploaded_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename, originalName: filename,
            storageBackend: detectBackend(r.file_path),
            storageRef: r.file_path,
            uploadedAt: r.uploaded_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] contrats: ${imported} importés`);
}

async function migrateTickets() {
    const SRC = 'hub_tickets.ticket_attachments';
    const rows = await pgDb.all('SELECT * FROM hub_tickets.ticket_attachments WHERE file_path IS NOT NULL AND file_path <> $1', ['']);
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const title = r.original_name || r.filename || `ticket-${r.ticket_id}-att-${r.id}`;
        const docId = await insertDocument({
            module: 'tickets',
            entityType: 'attachment',
            entityId: r.ticket_id,
            title,
            metadata: { is_image: !!r.is_image },
            createdAt: r.created_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename: r.filename || basenameOf(r.file_path),
            originalName: r.original_name || r.filename || basenameOf(r.file_path),
            mimetype: r.mimetype, size: r.file_size,
            storageBackend: detectBackend(r.file_path),
            storageRef: r.file_path,
            uploadedAt: r.created_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] tickets: ${imported} importés`);
}

async function migrateRencontres() {
    const SRC = 'hub_rencontres.reunion_attachments';
    const rows = await pgDb.all('SELECT * FROM hub_rencontres.reunion_attachments');
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const ref = r.file_path || r.filename;
        if (!ref) continue;
        const title = r.original_name || r.filename || `reunion-${r.reunion_id}-att-${r.id}`;
        const docId = await insertDocument({
            module: 'rencontres',
            entityType: 'attachment',
            entityId: r.reunion_id,
            title,
            metadata: {},
            createdAt: r.created_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename: r.filename || basenameOf(ref),
            originalName: r.original_name || r.filename || basenameOf(ref),
            mimetype: r.mimetype, size: r.size,
            storageBackend: detectBackend(ref),
            storageRef: ref,
            uploadedBy: r.uploaded_by,
            uploadedAt: r.created_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] rencontres: ${imported} importés`);
}

async function migrateTaskNotes() {
    const SRC = 'hub.task_notes';
    const rows = await pgDb.all("SELECT * FROM hub.task_notes WHERE type = 'file' AND filepath IS NOT NULL AND filepath <> ''");
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const title = r.filename || r.content || basenameOf(r.filepath) || `tache-${r.task_id}-note-${r.id}`;
        const docId = await insertDocument({
            module: 'tasks',
            entityType: 'note_file',
            entityId: r.task_id,
            title,
            metadata: { task_source: r.source },
            createdBy: r.created_by,
            createdAt: r.created_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename: basenameOf(r.filepath),
            originalName: r.filename || basenameOf(r.filepath),
            storageBackend: detectBackend(r.filepath),
            storageRef: r.filepath,
            uploadedBy: r.created_by,
            uploadedAt: r.created_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] task_notes: ${imported} importés`);
}

async function migrateLive() {
    const SRC = 'hub_tickets.live_messages';
    const rows = await pgDb.all("SELECT * FROM hub_tickets.live_messages WHERE attachment_url IS NOT NULL AND attachment_url <> ''");
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const url = String(r.attachment_url).replace(/^\//, ''); // peut commencer par '/'
        const title = r.attachment_name || basenameOf(url) || `live-${r.session_id}-msg-${r.id}`;
        const docId = await insertDocument({
            module: 'live',
            entityType: 'attachment',
            entityId: r.session_id,
            title,
            metadata: { sender_type: r.sender_type, sender_username: r.sender_username || null },
            createdBy: r.sender_username,
            createdAt: r.created_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename: basenameOf(url),
            originalName: r.attachment_name || basenameOf(url),
            storageBackend: detectBackend(url),
            storageRef: url,
            uploadedBy: r.sender_username,
            uploadedAt: r.created_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] live: ${imported} importés`);
}

/**
 * Projets — cas spécial : la table projet_versions_document contient déjà
 * plusieurs versions par document_id. On regroupe pour créer UN seul
 * hub_docs.documents avec N versions.
 */
async function migrateProjetsVersions() {
    const SRC = 'projets.projet_versions_document';
    const docIds = await pgDb.all(
        `SELECT DISTINCT v.document_id FROM projets.projet_versions_document v
         LEFT JOIN hub_docs.migration_log m
           ON m.source_table = $1 AND m.source_id = v.document_id::text
         WHERE m.id IS NULL`,
        [SRC]
    );
    let importedDocs = 0, importedVers = 0;
    for (const { document_id } of docIds) {
        const versions = await pgDb.all(
            'SELECT * FROM projets.projet_versions_document WHERE document_id = $1 ORDER BY date_depot ASC, id ASC',
            [document_id]
        );
        if (versions.length === 0) continue;
        const doc = await pgDb.get('SELECT * FROM projets.projet_documents WHERE id = $1', [document_id]);
        if (!doc) continue;

        const firstName = versions[0].fichier_original || versions[0].fichier_nom || `document-${document_id}`;
        const title = doc.type_documentaire || firstName;
        const projetId = doc.projet_id;
        const currentVer = versions.length;

        const newDocId = await insertDocument({
            module: 'projets',
            entityType: doc.type_vrac ? 'vrac' : 'documentation',
            entityId: projetId,
            title,
            currentVersion: currentVer,
            metadata: {
                projet_id: projetId,
                type_documentaire: doc.type_documentaire || null,
                legacy_projet_documents_id: document_id,
            },
            createdBy: doc.created_by_username,
            createdAt: versions[0].date_depot,
        });

        let n = 0;
        for (const v of versions) {
            n++;
            const ref = v.file_path || v.fichier_nom;
            await insertVersion({
                documentId: newDocId, version: n,
                filename: basenameOf(ref) || v.fichier_nom,
                originalName: v.fichier_original || v.fichier_nom,
                mimetype: v.fichier_type, size: v.fichier_taille,
                storageBackend: detectBackend(ref),
                storageRef: ref,
                metadata: {
                    legacy_version_label: v.version,
                    commentaire: v.commentaire || null,
                    est_version_courante: !!v.est_version_courante,
                },
                uploadedBy: v.depose_par_username,
                uploadedAt: v.date_depot,
            });
            importedVers++;
        }
        await markMigrated(SRC, document_id, newDocId, null);
        importedDocs++;
    }
    if (importedDocs) console.log(`[DOCS MIGRATION] projets: ${importedDocs} docs / ${importedVers} versions importés`);
}

async function migrateTelecom() {
    const SRC = 'sqlite.telecom_invoices';
    let rows = [];
    try {
        const { pgDb } = require('./database');
        rows = await pgDb.all(`SELECT * FROM hub_telecom.invoices WHERE file_path IS NOT NULL AND file_path <> ''`);
    } catch (e) { return; }
    let imported = 0;
    for (const r of rows) {
        if (await isMigrated(SRC, r.id)) continue;
        const title = r.invoice_number || `facture-${r.id}`;
        const docId = await insertDocument({
            module: 'telecom',
            entityType: 'invoice',
            entityId: r.id,
            title,
            metadata: {
                invoice_number: r.invoice_number,
                operator_id: r.operator_id,
                billing_account_id: r.billing_account_id,
                amount_ttc: r.amount_ttc,
                invoice_date: r.invoice_date,
            },
            createdAt: r.uploaded_at,
        });
        const verId = await insertVersion({
            documentId: docId, version: 1,
            filename: basenameOf(r.file_path),
            originalName: basenameOf(r.file_path),
            storageBackend: detectBackend(r.file_path),
            storageRef: r.file_path,
            uploadedAt: r.uploaded_at,
        });
        await markMigrated(SRC, r.id, docId, verId);
        imported++;
    }
    if (imported) console.log(`[DOCS MIGRATION] telecom: ${imported} importés`);
}

// ─── Orchestrateur ──────────────────────────────────────────────────────────

async function runAllMigrations() {
    try {
        await migrateCertificats();
        await migrateContrats();
        await migrateTickets();
        await migrateRencontres();
        await migrateTaskNotes();
        await migrateLive();
        await migrateProjetsVersions();
        await migrateTelecom();
    } catch (e) {
        console.error('[DOCS MIGRATION] erreur:', e.message);
    }
}

module.exports = { runAllMigrations };
