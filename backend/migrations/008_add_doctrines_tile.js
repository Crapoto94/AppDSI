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
    // Check if tile already exists
    const existing = await pool.query(
      `SELECT id FROM hub.tiles WHERE title = 'Notes de service et doctrines'`
    );

    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO hub.tiles (title, icon, description, status, sort_order)
        VALUES (
          'Notes de service et doctrines',
          '📋',
          'Gérez les notes de service et doctrines',
          'active',
          (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hub.tiles)
        )
      `);
      console.log('✅ Tile created successfully');
    } else {
      console.log('ℹ️  Tile already exists');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
