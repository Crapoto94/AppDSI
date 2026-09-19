/**
 * Purge des tables SQLite « non-paramétrage » migrées vers PostgreSQL
 * (Lot 1). À exécuter APRÈS avoir lancé migrate-non-config-sqlite.js --apply
 * et vérifié la parité des données.
 *
 * Ne touche PAS au paramétrage (settings, tuiles, users, column_settings…)
 * ni au volet RH (traité dans un lot séparé).
 *
 * Usage :
 *   node scripts/purge-legacy-sqlite.js            # simulation
 *   node scripts/purge-legacy-sqlite.js --apply    # supprime réellement
 */
const setupSqlite = require('../shared/sqlite_db');

const APPLY = process.argv.includes('--apply');

// Tables migrées vers Postgres (Lot 1).
const MIGRATED = [
    'budgets', 'budget_lines', 'operations',
    'm57_plan',
    'tiers', 'tier_stats', 'contacts',
    'access_requests',
    'import_logs',
    'attachments',
    'invoices',
    'certificates',
    'contrats', 'contrat_documents',
    'rencontres_budgetaires', 'rencontres_participants', 'rencontres_suivi',
    'rencontres_reunions', 'reunion_participants', 'reunion_attachments', 'direction_emails',
    'transcript_meetings', 'transcript_cues', 'transcript_tasks',
    'glpi_observers',
    'telecom_operators', 'telecom_invoices', 'telecom_billing_accounts', 'telecom_commitments',
    'todos',
    // Lot 2 RH : log de synchro (la synchro AD/Azure est désormais gérée par RH Studio)
    'rh_sync_logs',
];

// Tables legacy exceptionnelles (nom littéral avec point / préfixe historique).
const LEGACY = [
    'magapp.old_apps', 'magapp.old_categories', 'magapp.old_clicks',
    'magapp.old_favorites', 'magapp.old_subscriptions',
];

// Vues temporaires legacy (créées au démarrage) à supprimer.
const VIEWS = ['v_orders', 'v_invoices'];

(async () => {
    console.log(`[PURGE] Mode: ${APPLY ? 'APPLY (suppression réelle)' : 'DRY-RUN (simulation)'}`);
    const sqlite = await setupSqlite();

    const quoted = t => t.includes('.') ? `"${t}"` : t;

    for (const t of MIGRATED) {
        const exists = await sqlite.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?", [t]);
        if (!exists) { console.log(`  ${t.padEnd(24)} absente — ignorée`); continue; }
        const c = await sqlite.get(`SELECT COUNT(*) AS n FROM ${quoted(t)}`);
        if (APPLY) {
            await sqlite.run(`DROP TABLE IF EXISTS ${quoted(t)}`);
            console.log(`  ${t.padEnd(24)} supprimée (${c.n} lignes)`);
        } else {
            console.log(`  ${t.padEnd(24)} ${c.n} lignes → DROP`);
        }
    }

    for (const v of VIEWS) {
        const exists = await sqlite.get("SELECT 1 AS x FROM sqlite_master WHERE type='view' AND name = ?", [v]);
        if (!exists) { continue; }
        if (APPLY) {
            await sqlite.run(`DROP VIEW IF EXISTS ${v}`);
            console.log(`  vue ${v} supprimée`);
        } else {
            console.log(`  vue ${v} → DROP`);
        }
    }

    for (const t of LEGACY) {
        const exists = await sqlite.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?", [t]);
        if (!exists) { console.log(`  ${t.padEnd(24)} absente — ignorée`); continue; }
        const c = await sqlite.get(`SELECT COUNT(*) AS n FROM "${t}"`);
        if (APPLY) {
            await sqlite.run(`DROP TABLE IF EXISTS "${t}"`);
            console.log(`  ${t.padEnd(24)} supprimée (${c.n} lignes)`);
        } else {
            console.log(`  ${t.padEnd(24)} ${c.n} lignes → DROP`);
        }
    }

    if (APPLY) {
        try { await sqlite.run('VACUUM'); console.log('  VACUUM OK'); } catch (e) { console.warn('  VACUUM:', e.message); }
    } else {
        console.log('\n[PURGE] Simulation terminée. Relancer avec --apply pour supprimer.');
    }

    await sqlite.close();
    process.exit(0);
})().catch(err => { console.error('[PURGE] Erreur fatale:', err); process.exit(1); });
