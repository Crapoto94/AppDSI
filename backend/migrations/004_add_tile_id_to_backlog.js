const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

async function runMigration() {
  try {
    // Add tile_id column if it doesn't exist
    await pool.query(`
      ALTER TABLE hub.backlog
      ADD COLUMN IF NOT EXISTS tile_id INTEGER
    `);

    console.log('✅ Migration completed: tile_id column added to backlog table');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
