const setupDb = require('./db');

(async () => {
    try {
        const db = await setupDb();
        
        // Check if table exists
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        const observersTableExists = tables.some(t => t.name === 'glpi_observers');
        
        console.log('\n=== Vérification glpi_observers ===');
        if (observersTableExists) {
            console.log('✅ Table glpi_observers EXISTS');
            
            const count = await db.get("SELECT COUNT(*) as count FROM glpi_observers");
            console.log('   Nombre de lignes:', count.count);
            
            if (count.count > 0) {
                const samples = await db.all("SELECT * FROM glpi_observers LIMIT 3");
                console.log('\n   Données:');
                console.log(samples);
            }
        } else {
            console.log('❌ Table glpi_observers N\'EXISTE PAS');
            console.log('\nTables trouvées:');
            tables.filter(t => t.name.includes('glpi')).forEach(t => {
                console.log('  -', t.name);
            });
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Erreur:', err.message);
        process.exit(1);
    }
})();
