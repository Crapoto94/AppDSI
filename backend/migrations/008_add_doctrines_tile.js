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
      // Create tile
      const result = await pool.query(`
        INSERT INTO hub.tiles (title, icon, description, status, sort_order)
        VALUES (
          'Notes de service et doctrines',
          '📋',
          'Gérez les notes de service et doctrines',
          'active',
          (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hub.tiles)
        )
        RETURNING id
      `);

      const tileId = result.rows[0].id;

      // Add link to doctrines page
      await pool.query(`
        INSERT INTO hub.tile_links (tile_id, label, url, is_internal)
        VALUES ($1, 'Accéder', '/doctrines', 1)
      `, [tileId]);

      console.log('✅ Tile and link created successfully');
    } else {
      // Check if link exists
      const linkExists = await pool.query(
        `SELECT id FROM hub.tile_links WHERE tile_id = $1 AND url = '/doctrines'`,
        [existing.rows[0].id]
      );

      if (linkExists.rows.length === 0) {
        // Add link if it doesn't exist
        await pool.query(`
          INSERT INTO hub.tile_links (tile_id, label, url, is_internal)
          VALUES ($1, 'Accéder', '/doctrines', 1)
        `, [existing.rows[0].id]);
        console.log('✅ Link added to existing tile');
      } else {
        console.log('ℹ️  Tile and link already exist');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
