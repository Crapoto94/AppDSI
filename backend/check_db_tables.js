const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
console.log('Vérification de:', dbPath);

const db = new Database(dbPath, { readonly: true });

try {
    // List all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    
    console.log('\n=== Tables GLPI dans database.sqlite ===');
    tables.filter(t => t.name.includes('glpi')).forEach(t => console.log('  ✓', t.name));
    
    // Check if glpi_observers exists
    const observersExists = tables.some(t => t.name === 'glpi_observers');
    
    if (!observersExists) {
        console.log('\n❌ Table glpi_observers N\'EXISTE PAS');
        console.log('Les tables GLPI actuelles sont:');
        tables.filter(t => t.name.includes('glpi') || t.name.includes('ticket')).forEach(t => console.log('  -', t.name));
    } else {
        console.log('\n✅ Table glpi_observers existe');
        const countResult = db.prepare("SELECT COUNT(*) as count FROM glpi_observers").get();
        console.log('   Nombre de lignes:', countResult.count);
        
        if (countResult.count > 0) {
            const samples = db.prepare("SELECT * FROM glpi_observers LIMIT 3").all();
            console.log('\n   Exemples de données:');
            samples.forEach(obs => {
                console.log(`   - ${obs.name} (${obs.login}) - ${obs.email}`);
            });
        } else {
            console.log('   (Pas de données)');
        }
    }
    
} catch (err) {
    console.error('Erreur:', err.message);
}

db.close();
