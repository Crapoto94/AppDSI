process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const setupDb = require('./db');

(async () => {
    try {
        const db = await setupDb();
        
        // Vérifier si la table existe
        const tableCheck = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='glpi_observers'");
        
        if (tableCheck.length === 0) {
            console.log('❌ Table glpi_observers N\'EXISTE PAS');
            process.exit(1);
        }

        console.log('✅ Table glpi_observers EXISTS');

        // Compter les lignes
        const count = await db.get("SELECT COUNT(*) as count FROM glpi_observers");
        console.log(`\n📊 Total observateurs: ${count.count}`);

        if (count.count === 0) {
            console.log('⚠️  Aucune donnée dans la table');
        } else {
            console.log('\n📋 Premiers observateurs:');
            const observers = await db.all("SELECT glpi_id, name, login, email FROM glpi_observers LIMIT 5");
            observers.forEach(obs => {
                console.log(`   - ${obs.name} (${obs.login}) - ${obs.email}`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error('Erreur:', err.message);
        process.exit(1);
    }
})();
