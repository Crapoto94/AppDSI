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
    // Add all managers from hub.calendrier_managers to hub_calendrier.agents_dsi if not already present
    await pool.query(`
      INSERT INTO hub_calendrier.agents_dsi (username, nom, email, service, created_by)
      SELECT u.username, u.displayname, u.email, 'DSI', 'machevalier'
      FROM hub.users u
      JOIN hub.calendrier_managers cm ON u.id = cm.user_id
      WHERE NOT EXISTS (
        SELECT 1 FROM hub_calendrier.agents_dsi a WHERE a.username = u.username
      )
      ON CONFLICT (username) DO NOTHING
    `);

    console.log('✅ Migration completed: managers added to agents_dsi table');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
