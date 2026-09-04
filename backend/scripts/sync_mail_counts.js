/**
 * Synchronise le nombre de messages / non lus (dossier Inbox) de toutes les
 * boîtes partagées (type = "Boîte partagée" — une liste de diffusion/sécurité
 * n'a pas de boîte aux lettres) via Microsoft Graph, app "Messagerie O365"
 * (SQLite o365_settings, /admin/mail — permissions Mail.Read /
 * Mail.ReadBasic.All, vérifié empiriquement ; DISTINCTE de azure_ad_settings
 * qui ne les a pas). Cf. shared/graph_helper.js#getMailboxMessageCounts.
 *
 * Usage :
 *   node scripts/sync_mail_counts.js            # dry-run (liste les boîtes concernées)
 *   node scripts/sync_mail_counts.js --execute   # écriture réelle
 */

const { pgDb } = require('../shared/database');
const setupSqlite = require('../shared/sqlite_db');
const { getMailboxMessageCounts } = require('../shared/graph_helper');
const service = require('../modules/mailboxes/mailboxes.service');

const isExecute = process.argv.includes('--execute');

async function main() {
    console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const boxes = await pgDb.all(`
        SELECT id, nom, email FROM hub.shared_mailboxes
        WHERE type = 'Boîte partagée' AND email IS NOT NULL
        ORDER BY id
    `);
    console.log(`Boîtes partagées avec adresse mail : ${boxes.length}`);
    if (!isExecute) { boxes.forEach((b) => console.log(`  À synchroniser : #${b.id} ${b.email}`)); process.exit(0); }

    const db = await setupSqlite();
    const o365Settings = await db.get('SELECT * FROM o365_settings WHERE id = 1');
    if (!o365Settings || !o365Settings.is_enabled) {
        console.error('⚠️  Messagerie O365 non configurée/désactivée (/admin/mail) — arrêt.');
        process.exit(1);
    }

    let ok = 0, failed = 0;
    for (const b of boxes) {
        const result = await getMailboxMessageCounts(b.email, o365Settings);
        if (result.ok) {
            await service.updateRecord(b.id, {
                mail_total_count: result.total, mail_unread_count: result.unread,
                mail_counts_synced_at: new Date().toISOString(), mail_counts_error: null,
            });
            ok++;
            console.log(`  ✅ #${b.id} ${b.email} — ${result.total} message(s), ${result.unread} non lu(s)`);
        } else {
            await service.updateRecord(b.id, { mail_counts_error: result.error });
            failed++;
            console.log(`  ⚠️  #${b.id} ${b.email} — ${result.error}`);
        }
    }

    console.log('\n--- Résumé ---');
    console.log(`Synchronisées : ${ok}`);
    console.log(`Échecs        : ${failed}`);
    process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
