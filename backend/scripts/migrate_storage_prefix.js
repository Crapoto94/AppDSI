/**
 * Migration : normalise les préfixes des URLs de stockage.
 *
 * Contexte :
 *   - Les nouveaux messages live utilisent `/api/${saved.dbPath}` → `/api/storage/live/...`
 *   - Les anciens enregistrements stockent `storage/live/...` (brut) ou `/storage/live/...`
 *   - Problème : le reverse proxy ne forwarde que `/api/`, pas `/storage/`
 *
 * Cette migration :
 *   1. Ajoute le préfixe `/api/` aux chemins bruts `storage/...`
 *   2. Remplace `/storage/` par `/api/storage/` dans les URLs déjà préfixées
 *   3. Corrige le requester_name des tickets qui contiennent un login au lieu d'un nom
 *
 * La base est partagée entre dev et prod, l'exécution unique suffit.
 */

const { pgDb, getSqlite } = require('../shared/database');

async function migrate() {
    console.log('=== Migration des préfixes de stockage ===\n');

    // 1. Chemins bruts : "storage/live/..." → "/api/storage/live/..."
    const r1 = await pgDb.run(`
        UPDATE hub_tickets.live_messages
        SET attachment_url = '/api/' || attachment_url
        WHERE attachment_url LIKE 'storage/%'
    `);
    console.log(`1. Préfixe '/api/' ajouté aux chemins bruts (storage/) : ${r1.changes} ligne(s)`);

    // 2. URLs déjà préfixées : "/storage/..." → "/api/storage/..."
    const r2 = await pgDb.run(`
        UPDATE hub_tickets.live_messages
        SET attachment_url = REPLACE(attachment_url, '/storage/', '/api/storage/')
        WHERE attachment_url LIKE '/storage/%'
    `);
    console.log(`2. Remplacement /storage/ → /api/storage/ : ${r2.changes} ligne(s)`);

    // 3. Correction des requester_name des tickets où le login est utilisé au lieu du displayName
    //    Ne corrige que si hub.users.displayName est renseigné et différent du username
    const r3 = await pgDb.run(`
        UPDATE hub_tickets.tickets t
        SET requester_name = hu.displayName
        FROM hub.users hu
        WHERE LOWER(hu.username) = LOWER(t.requester_name)
          AND hu.displayName IS NOT NULL
          AND hu.displayName != ''
          AND t.requester_name IS DISTINCT FROM hu.displayName
    `);
    console.log(`3. Requester_name tickets corrigés (login → displayName) : ${r3.changes} ticket(s)\n`);

    console.log('=== Migration terminée ===');
    process.exit(0);
}

migrate().catch(err => {
    console.error('ERREUR de migration :', err.message);
    process.exit(1);
});
