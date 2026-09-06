/**
 * Rattrapage : migre les images de désignation (module /consommables, table
 * hub_consommables.designation_images) de l'ancien stockage statique
 * (frontend/public/images/designations/..., propre au seul build du
 * frontend 5173 — invisible du MagApp 5174) vers le service de stockage
 * unifié (shared/storage.js, cf. skill « ged »).
 *
 * Ne touche que les lignes dont image_path ne commence pas déjà par
 * "storage/" (nouveaux uploads faits après la migration du code, déjà bons).
 * Non destructif : le fichier legacy n'est jamais supprimé, seule la ligne BD
 * est mise à jour pour pointer vers la copie dans le nouveau stockage.
 *
 * Usage :
 *   node scripts/migrate_designation_images_to_storage.js            # dry-run
 *   node scripts/migrate_designation_images_to_storage.js --execute  # écriture réelle
 */

const fs = require('fs');
const path = require('path');
const { pgDb } = require('../shared/database');
const storage = require('../shared/storage');

const isExecute = process.argv.includes('--execute');
const MODULE = 'consommables';

const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
};

async function main() {
    console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const rows = await pgDb.all(`
        SELECT id, designation, image_path FROM hub_consommables.designation_images
        WHERE image_path IS NOT NULL AND image_path NOT LIKE 'storage/%'
        ORDER BY designation
    `);
    console.log(`Images en stockage legacy à migrer : ${rows.length}`);
    if (rows.length === 0) { process.exit(0); }

    let migrated = 0, missing = 0, failed = 0;

    for (const row of rows) {
        const legacyAbs = path.join(__dirname, '..', '..', 'frontend', 'public', row.image_path.replace(/^\/+/, ''));
        if (!fs.existsSync(legacyAbs)) {
            console.log(`  ⚠️  #${row.id} "${row.designation}" — fichier legacy introuvable (${legacyAbs}), ignoré`);
            missing++;
            continue;
        }
        try {
            const buffer = fs.readFileSync(legacyAbs);
            const ext = path.extname(legacyAbs).toLowerCase();
            const file = {
                buffer,
                originalname: path.basename(legacyAbs),
                mimetype: MIME_BY_EXT[ext] || 'application/octet-stream',
                size: buffer.length,
            };

            if (isExecute) {
                const saved = await storage.saveFile(MODULE, row.designation, file);
                await pgDb.run('UPDATE hub_consommables.designation_images SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [saved.dbPath, row.id]);
                try {
                    const docsService = require('../shared/documents.service');
                    await docsService.registerExternalUpload({
                        module: MODULE,
                        entityType: 'designation_image',
                        entityId: row.designation,
                        title: file.originalname,
                        filename: saved.filename,
                        originalName: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        storageRef: saved.dbPath,
                        uploadedBy: null,
                    });
                } catch (e) { console.warn(`  [DOCS] register échoué pour "${row.designation}":`, e.message); }
                console.log(`  ✅ #${row.id} "${row.designation}" → ${saved.dbPath}`);
            } else {
                console.log(`  (dry-run) #${row.id} "${row.designation}" — ${legacyAbs} → storage/${MODULE}/<désignation>/...`);
            }
            migrated++;
        } catch (e) {
            console.log(`  ❌ #${row.id} "${row.designation}" — échec : ${e.message}`);
            failed++;
        }
    }

    console.log('\n--- Résumé ---');
    console.log(`Migrées${isExecute ? '' : ' (simulation)'} : ${migrated - failed}`);
    console.log(`Fichier legacy introuvable (ignorées) : ${missing}`);
    console.log(`Échecs : ${failed}`);
    if (!isExecute) console.log('\nDry-run terminé — relancer avec --execute pour migrer réellement.');

    process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
