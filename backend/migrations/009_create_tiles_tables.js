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
    // Create tiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub.tiles (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        icon VARCHAR(255),
        description TEXT,
        status VARCHAR(50) DEFAULT 'active',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tile_links table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub.tile_links (
        id SERIAL PRIMARY KEY,
        tile_id INTEGER NOT NULL REFERENCES hub.tiles(id) ON DELETE CASCADE,
        label VARCHAR(255) NOT NULL,
        url VARCHAR(1024) NOT NULL,
        is_internal INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Migration completed: tiles and tile_links tables created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
