/**
 * Ajoute la colonne mail_rule_id à ticket_email_mapping si elle n'existe pas,
 * puis relance la collecte de tous les collecteurs actifs pour récupérer les emails en erreur.
 *
 * Usage : node backend/scripts/fix_mail_rule_id_column.js
 */
const { pool, setupPgDb } = require('../shared/database');

async function run() {
    await setupPgDb();

    // 1. Ajouter les colonnes manquantes
    console.log('[1/3] Ajout des colonnes manquantes...');
    try {
        await pool.query(`ALTER TABLE hub_tickets.ticket_email_mapping ADD COLUMN IF NOT EXISTS mail_rule_id INTEGER DEFAULT NULL`);
        console.log('  ✓ mail_rule_id ajoutée sans FK (ou déjà présente)');
    } catch (e) {
        console.error('  ✗ mail_rule_id:', e.message);
    }
    try {
        await pool.query(`ALTER TABLE hub_tickets.mail_rules ADD COLUMN IF NOT EXISTS category_id INTEGER DEFAULT NULL REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL`);
        console.log('  ✓ category_id sur mail_rules ajoutée (ou déjà présente)');
    } catch (e) {
        console.error('  ✗ category_id:', e.message);
    }

    // 2. Lister les collecteurs actifs de type tickets
    console.log('[2/3] Récupération des collecteurs actifs...');
    const { rows: collectors } = await pool.query(
        `SELECT id, name, mailbox, last_run FROM hub_tickets.mail_collectors WHERE is_enabled = true AND module = 'tickets' ORDER BY id`
    );
    console.log(`  ${collectors.length} collecteur(s) trouvé(s)`);
    for (const c of collectors) {
        console.log(`  - #${c.id} ${c.name} (${c.mailbox}) — dernier run: ${c.last_run || 'jamais'}`);
    }

    // Reset last_run à 48h en arrière pour que les emails en erreur repassent dans le filtre Graph.
    // La déduplication (ticket_email_mapping) empêche les doublons pour les emails déjà importés.
    console.log('  → Reset last_run à -48h pour récupérer les emails en erreur...');
    const minus48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    for (const c of collectors) {
        await pool.query(
            `UPDATE hub_tickets.mail_collectors SET last_run = $1 WHERE id = $2`,
            [minus48h, c.id]
        );
        console.log(`    #${c.id} ${c.name} → last_run = ${minus48h}`);
    }

    // 3. Relancer la collecte pour chaque collecteur
    console.log('[3/3] Relance de la collecte...');
    const MailCollectorService = require('../modules/mail_collector/mail_collector.service');
    for (const c of collectors) {
        console.log(`\n  → Collecte #${c.id} ${c.name}...`);
        try {
            const log = await MailCollectorService.performCollection(c.id);
            if (log) {
                console.log(`    reçus: ${log.emails_received}, importés: ${log.emails_imported}, ignorés: ${log.emails_skipped}, échoués: ${log.emails_failed}`);
                if (log.errors && log.errors.length > 0) {
                    log.errors.forEach(e => console.error('    ⚠', e));
                }
            } else {
                console.log('    (collecteur désactivé ou introuvable)');
            }
        } catch (e) {
            console.error(`    ✗ Erreur: ${e.message}`);
        }
    }

    await pool.end();
    console.log('\nTerminé.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
