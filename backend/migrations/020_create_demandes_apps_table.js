const { Pool } = require('pg');
const { SQL_CREATION } = require('../modules/backlog-apps/backlog-apps.table');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

// Table centrale des demandes et bugs de toutes les applications (voir modules/backlog-apps). Idempotent : la synchronisation la crée aussi si besoin.
async function runMigration() {
  try {
    await pool.query(SQL_CREATION);
    console.log('✅ Migration completed: hub.demandes_apps table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
