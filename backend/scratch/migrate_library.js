const { Pool } = require('pg');
(async () => {
    const pool = new Pool({
        host: '10.103.130.106',
        port: 5432,
        user: 'postgres',
        password: 'ivrypassword',
        database: 'ivry_admin'
    });
    try {
        console.log('Démarrage migration...');
        await pool.query('ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_library BOOLEAN DEFAULT FALSE');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS magapp.app_docs (
                id SERIAL PRIMARY KEY,
                app_id INTEGER REFERENCES magapp.apps(id),
                title TEXT NOT NULL,
                doc_type TEXT NOT NULL,
                url TEXT NOT NULL,
                is_obsolete BOOLEAN DEFAULT FALSE,
                is_favorite BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS magapp.doc_interactions (
                id SERIAL PRIMARY KEY,
                doc_id INTEGER REFERENCES magapp.app_docs(id),
                username TEXT NOT NULL,
                interaction_type TEXT NOT NULL,
                rating INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        console.log('Migration terminée avec succès.');
    } catch (err) {
        console.error('Erreur migration:', err.message);
    } finally {
        await pool.end();
    }
})();
