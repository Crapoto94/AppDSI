/**
 * Rattrapage : marque ad_sync_error sur les fiches hub.shared_mailboxes déjà
 * importées (import_exchange_groups.js / import_shared_mailboxes.js) dont la
 * résolution AD avait échoué au moment de l'import — à l'époque, l'échec
 * n'était que journalisé en console (⚠️ …), jamais persisté, donc ces fiches
 * affichent "0 membre" en UI de façon indiscernable d'un "0 membre" confirmé.
 *
 * Cible : hub.shared_mailboxes WHERE requested_by_username = 'import_exchange'
 * AND membres = '[]' AND ad_sync_error IS NULL (jamais encore classifiées).
 * Pour chacune, relit l'AD (l'objet n'a pas de raison d'avoir bougé depuis
 * l'import) :
 *   - trouvé avec des membres → les enregistre (bonus : corrige un éventuel
 *     souci transitoire du premier essai)
 *   - trouvé sans membre → ne touche rien (0 confirmé, pas une erreur)
 *   - introuvable / erreur → ad_sync_error = message
 *
 * Usage :
 *   node scripts/backfill_ad_sync_status.js            # dry-run
 *   node scripts/backfill_ad_sync_status.js --execute   # écriture réelle
 */

const { pgDb } = require('../shared/database');
const setupSqlite = require('../shared/sqlite_db');
const { searchADRecipientMembers } = require('../shared/ad_helper');
const service = require('../modules/mailboxes/mailboxes.service');

const isExecute = process.argv.includes('--execute');

async function main() {
    console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const candidates = await pgDb.all(`
        SELECT id, nom, email FROM hub.shared_mailboxes
        WHERE requested_by_username = 'import_exchange'
          AND jsonb_array_length(membres) = 0
          AND ad_sync_error IS NULL
        ORDER BY id
    `);
    console.log(`Fiches candidates (importées, 0 membre, jamais classifiées) : ${candidates.length}`);
    if (candidates.length === 0) { process.exit(0); }

    let adSettings = null;
    if (isExecute) {
        const db = await setupSqlite();
        adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
            console.error('⚠️  Annuaire AD non configuré/désactivé — impossible de classifier, arrêt.');
            process.exit(1);
        }
    }

    let recoveredWithMembers = 0, confirmedEmpty = 0, markedError = 0;

    for (const row of candidates) {
        if (!row.email) { console.warn(`⚠️  #${row.id} "${row.nom}" sans adresse mail — ignorée.`); continue; }
        if (!isExecute) { console.log(`  À vérifier : #${row.id} ${row.email}`); continue; }

        try {
            const adResult = await searchADRecipientMembers(row.email, adSettings);
            if (adResult.found && adResult.members.length > 0) {
                const membres = adResult.members.map((m) => ({ displayName: m.displayName, email: m.email }));
                await service.updateRecord(row.id, { membres, ad_sync_error: null });
                recoveredWithMembers++;
                console.log(`  ✅ #${row.id} ${row.email} — ${membres.length} membre(s) retrouvé(s)`);
            } else if (adResult.found) {
                confirmedEmpty++; // rien à écrire : ad_sync_error déjà NULL
            } else {
                const msg = adResult.error || 'Aucun objet AD ne correspond à cette adresse';
                await service.updateRecord(row.id, { ad_sync_error: msg });
                markedError++;
                console.log(`  ⚠️  #${row.id} ${row.email} — ${msg}`);
            }
        } catch (e) {
            await service.updateRecord(row.id, { ad_sync_error: e.message });
            markedError++;
            console.log(`  ⚠️  #${row.id} ${row.email} — échec : ${e.message}`);
        }
    }

    console.log('\n--- Résumé ---');
    console.log(`Membres retrouvés (fiche corrigée) : ${recoveredWithMembers}`);
    console.log(`0 membre confirmé (rien à marquer) : ${confirmedEmpty}`);
    console.log(`Marquées en erreur (ad_sync_error) : ${markedError}`);
    if (!isExecute) console.log('\nDry-run terminé — relancer avec --execute pour classifier réellement.');

    process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
