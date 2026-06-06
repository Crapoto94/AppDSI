const { pool } = require('../shared/database');

async function run() {
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_username_lower ON hub.users(LOWER(username))',
        'CREATE INDEX IF NOT EXISTS idx_user_tasks_context_statut ON hub.user_tasks(context_source, context_id, statut)',
    ];

    for (const ddl of indexes) {
        try {
            await pool.query(ddl);
            console.log(`  ✅ ${ddl.split(' ON ')[1]}`);
        } catch (e) {
            console.error(`  ❌ ${e.message}`);
        }
    }
    console.log('\nTerminé');
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
