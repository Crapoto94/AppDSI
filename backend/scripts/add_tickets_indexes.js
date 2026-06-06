/**
 * Ajoute les index manquants sur hub_tickets.tickets pour accélérer
 * les requêtes de filtrage et de tri sur la page /tickets.
 *
 * Les index composites (status, date_creation DESC) existent déjà.
 * Il manque des index simples sur les colonnes utilisées dans WHERE.
 */

const { pgDb } = require('../shared/database');

async function run() {
    const indexes = [
        // Colonnes de filtrage courantes sans index dédié
        'CREATE INDEX IF NOT EXISTS idx_tickets_type ON hub_tickets.tickets(type)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_priority ON hub_tickets.tickets(priority)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_subcategory_id ON hub_tickets.tickets(subcategory_id)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_software_id ON hub_tickets.tickets(software_id)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_is_vip ON hub_tickets.tickets(is_vip)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_email_alt ON hub_tickets.tickets(email_alt)',
        // Index sur is_live (filtre chat)
        "CREATE INDEX IF NOT EXISTS idx_tickets_is_live ON hub_tickets.tickets(is_live) WHERE is_live IS TRUE",
        // Index fonctionnel LOWER(email) pour vip_users (sous-requête dans BASE_SELECT)
        'CREATE INDEX IF NOT EXISTS idx_vip_users_email_lower ON hub_tickets.vip_users(LOWER(email))',
    ];

    let ok = 0, err = 0;
    for (const ddl of indexes) {
        try {
            await pgDb.run(ddl);
            console.log(`  ✅ ${ddl.split(' ON ')[1]}`);
            ok++;
        } catch (e) {
            console.error(`  ❌ ${ddl.split(' ON ')[1]} : ${e.message}`);
            err++;
        }
    }
    console.log(`\nTerminé : ${ok} index créés, ${err} erreurs`);
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
