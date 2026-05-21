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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub.backlog (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL DEFAULT 'Amélioration',
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        user_id INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on user_id for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_backlog_user_id ON hub.backlog(user_id)
    `);

    // Create index on status for filtering
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_backlog_status ON hub.backlog(status)
    `);

    // Create index on created_at for sorting
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_backlog_created_at ON hub.backlog(created_at)
    `);

    console.log('✅ Migration completed: backlog table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
