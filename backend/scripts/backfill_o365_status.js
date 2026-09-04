/**
 * Rattrapage : vérifie dans O365/Entra ID (Microsoft Graph, cf. graph_helper.js)
 * les fiches hub.shared_mailboxes déjà marquées ad_sync_error (introuvables
 * dans l'AD on-prem) mais jamais encore vérifiées côté O365 (o365_status IS
 * NULL) — cette vérification n'existait pas encore au moment du premier
 * import/backfill AD.
 *
 * Pour chacune :
 *   - trouvée comme boîte partagée (user Entra) → o365_status='user_found'.
 *     Ses membres restent vides : Microsoft Graph n'expose pas les délégués
 *     Accès total d'une boîte partagée (limitation structurelle de l'API,
 *     pas un problème de permission).
 *   - trouvée comme groupe (liste) ET permission Group.Read.All disponible
 *     → o365_status='group_found', membres réels enregistrés.
 *   - impossible de vérifier les groupes (403 Group.Read.All manquante)
 *     → o365_status='permission_denied'.
 *   - introuvable aussi dans O365 → o365_status='not_found'.
 *
 * Usage :
 *   node scripts/backfill_o365_status.js            # dry-run
 *   node scripts/backfill_o365_status.js --execute   # écriture réelle
 */

const { pgDb } = require('../shared/database');
const setupSqlite = require('../shared/sqlite_db');
const { checkO365Existence } = require('../shared/graph_helper');
const service = require('../modules/mailboxes/mailboxes.service');

const isExecute = process.argv.includes('--execute');

async function main() {
    console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const candidates = await pgDb.all(`
        SELECT id, nom, email FROM hub.shared_mailboxes
        WHERE ad_sync_error IS NOT NULL AND o365_status IS NULL
        ORDER BY id
    `);
    console.log(`Fiches candidates (échec AD, jamais vérifiées côté O365) : ${candidates.length}`);
    if (candidates.length === 0) process.exit(0);
    if (!isExecute) { candidates.forEach((r) => console.log(`  À vérifier : #${r.id} ${r.email}`)); process.exit(0); }

    const db = await setupSqlite();
    const azureSettings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
    if (!azureSettings || !azureSettings.is_enabled) {
        console.error('⚠️  Azure AD (Graph) non configuré/désactivé — arrêt.');
        process.exit(1);
    }

    const tally = { user_found: 0, group_found: 0, permission_denied: 0, not_found: 0, error: 0 };

    for (const row of candidates) {
        if (!row.email) { console.warn(`⚠️  #${row.id} "${row.nom}" sans adresse mail — ignorée.`); continue; }
        const o365 = await checkO365Existence(row.email, azureSettings);

        if (o365.status === 'user_found') {
            await service.updateRecord(row.id, { o365_status: 'user_found' });
            tally.user_found++;
            console.log(`  ☁️  #${row.id} ${row.email} — confirmée dans O365 (boîte partagée cloud-only, membres non exposés par Graph)`);
        } else if (o365.status === 'group_found' && !o365.permissionDenied) {
            const membres = (o365.members || []).map((m) => ({ displayName: m.displayName, email: m.email }));
            await service.updateRecord(row.id, { o365_status: 'group_found', membres });
            tally.group_found++;
            console.log(`  ✅ #${row.id} ${row.email} — groupe O365 confirmé, ${membres.length} membre(s) récupéré(s)`);
        } else if (o365.status === 'group_found' && o365.permissionDenied) {
            await service.updateRecord(row.id, { o365_status: 'permission_denied' });
            tally.permission_denied++;
        } else if (o365.status === 'not_found') {
            await service.updateRecord(row.id, { o365_status: 'not_found' });
            tally.not_found++;
            console.log(`  ⚠️  #${row.id} ${row.email} — introuvable aussi dans O365`);
        } else {
            tally.error++;
            console.log(`  ❌ #${row.id} ${row.email} — erreur de vérification : ${o365.error}`);
        }
    }

    console.log('\n--- Résumé ---');
    console.log(`Confirmées boîte partagée O365 (membres inconnus, Graph ne les expose pas) : ${tally.user_found}`);
    console.log(`Confirmées liste O365 avec membres récupérés                                : ${tally.group_found}`);
    console.log(`Vérification liste impossible (permission Group.Read.All manquante)         : ${tally.permission_denied}`);
    console.log(`Introuvables aussi dans O365 (probablement supprimées)                       : ${tally.not_found}`);
    console.log(`Erreurs de vérification                                                      : ${tally.error}`);

    process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
