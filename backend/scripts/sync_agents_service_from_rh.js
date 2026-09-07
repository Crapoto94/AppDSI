/**
 * Recale service_code/service_complement (magapp.users + hub.users) sur le
 * référentiel RH (oracle.rh_v_extract_dsi) plutôt que sur l'attribut AD figé
 * au dernier login. Voir backend/shared/rh-service-sync.js pour le détail.
 *
 * Usage :
 *   node backend/scripts/sync_agents_service_from_rh.js            (dry-run, rapport uniquement)
 *   node backend/scripts/sync_agents_service_from_rh.js --execute  (applique les changements)
 */
const { setupDb } = require('../shared/database');
const { syncAgentServicesFromRH } = require('../shared/rh-service-sync');

async function run() {
    const execute = process.argv.includes('--execute');
    await setupDb();
    console.log(execute ? '=== MODE EXÉCUTION ===' : '=== MODE DRY-RUN (relancer avec --execute pour appliquer) ===');

    const r = await syncAgentServicesFromRH({ dryRun: !execute });

    console.log(`Agents RH actifs analysés : ${r.rhAgents}`);
    console.log(`Noms d'utilisateur exploitables (sans collision) : ${r.usableUsernames}`);
    if (r.collisions.length > 0) {
        console.log(`\n⚠️  ${r.collisions.length} collision(s) de nom d'utilisateur ignorée(s) :`);
        for (const c of r.collisions) console.log(`  - ${c.username} → matricules ${c.matricules.join(', ')}`);
    }

    console.log(`\n--- PostgreSQL (magapp.users) ---`);
    console.log(`Comptes existants vérifiés : ${r.pg.checked} | ${execute ? 'mis à jour' : 'à mettre à jour'} : ${r.pg.changes.length}`);
    for (const c of r.pg.changes) {
        console.log(`  ${c.username} : "${c.before.service_code || '-'}" / "${c.before.service_complement || '-'}"  →  "${c.after.service_code}" / "${c.after.service_complement}"`);
    }

    console.log(`\n--- SQLite locale (hub.users, cette instance uniquement) ---`);
    console.log(`Comptes existants vérifiés : ${r.sqlite.checked} | ${execute ? 'mis à jour' : 'à mettre à jour'} : ${r.sqlite.changes.length}`);
    for (const c of r.sqlite.changes) {
        console.log(`  ${c.username} : "${c.before.service_code || '-'}" / "${c.before.service_complement || '-'}"  →  "${c.after.service_code}" / "${c.after.service_complement}"`);
    }

    console.log(execute ? '\nTerminé.' : '\nDry-run terminé — relancer avec --execute pour appliquer.');
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
