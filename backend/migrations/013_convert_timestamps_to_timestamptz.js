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
    console.log('Converting timestamp columns to timestamp with time zone...');

    // Convert hub.backlog
    await pool.query(`
      ALTER TABLE hub.backlog
      ALTER COLUMN created_at SET DATA TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN updated_at SET DATA TYPE timestamptz USING updated_at AT TIME ZONE 'UTC'
    `);
    console.log('✅ hub.backlog converted');

    // Convert hub.doctrines if exists
    try {
      await pool.query(`
        ALTER TABLE hub.doctrines
        ALTER COLUMN created_at SET DATA TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN updated_at SET DATA TYPE timestamptz USING updated_at AT TIME ZONE 'UTC'
      `);
      console.log('✅ hub.doctrines converted');
    } catch (e) {
      console.log('⚠️  hub.doctrines not converted (table might not exist)');
    }

    // Convert other tables that might have timestamps
    const tables = ['hub.tiles', 'hub.tile_links'];
    for (const table of tables) {
      try {
        await pool.query(`
          ALTER TABLE ${table}
          ALTER COLUMN created_at SET DATA TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
          ALTER COLUMN updated_at SET DATA TYPE timestamptz USING updated_at AT TIME ZONE 'UTC'
        `);
        console.log(`✅ ${table} converted`);
      } catch (e) {
        console.log(`⚠️  ${table} not converted (might not exist)`);
      }
    }

    console.log('✅ Migration completed: timestamps converted to timestamptz');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
