// ─── Amorçage idempotent de la base documentaire tickets ──────────────────────
// Enregistre dans hub_docs (visionneuse centrale) les tutos de la base de
// connaissance qui existaient avant l'introduction du dual-write (doc_id NULL).
// Ne réécrit jamais le fichier : pointe simplement sur le storage_ref existant.
// Appelé une fois au démarrage, après setupPgDb. Sans effet si tout est à jour.
const { pgDb } = require('../../shared/database');
const docsService = require('../../shared/documents.service');

async function bootstrapKnowledgeDocs() {
    try {
        const rows = await pgDb.all(
            `SELECT id, name, file_path, original_name, mimetype, size_bytes, uploaded_by
             FROM hub_tickets.knowledge_documents WHERE doc_id IS NULL`
        );
        let migrated = 0;
        for (const d of rows) {
            try {
                const { document } = await docsService.registerExternalUpload({
                    module: 'tickets-kb', entityType: 'knowledge_document', entityId: d.id,
                    title: d.name, filename: d.original_name, originalName: d.original_name,
                    mimetype: d.mimetype, size: d.size_bytes, storageRef: d.file_path,
                    uploadedBy: d.uploaded_by,
                });
                if (document) {
                    await pgDb.run(`UPDATE hub_tickets.knowledge_documents SET doc_id=$1 WHERE id=$2`, [document.id, d.id]);
                    migrated++;
                }
            } catch (e) { console.error(`[KB BOOTSTRAP] échec doc ${d.id}:`, e.message); }
        }
        if (migrated) console.log(`[KB BOOTSTRAP] ${migrated}/${rows.length} tuto(s) rattaché(s) à hub_docs`);
    } catch (e) {
        console.error('[KB BOOTSTRAP] amorçage échoué :', e.message);
    }
}

module.exports = { bootstrapKnowledgeDocs };
