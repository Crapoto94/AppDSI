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
    // Assign DSI service to all managers who don't have one
    await pool.query(`
      UPDATE hub.users
      SET service_code = 'DSI'
      WHERE username IN (
        SELECT u.username
        FROM hub.users u
        JOIN hub.calendrier_managers cm ON u.id = cm.user_id
        WHERE u.service_code IS NULL
      )
    `);

    console.log('✅ Migration completed: DSI service assigned to managers');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
