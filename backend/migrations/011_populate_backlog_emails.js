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
    // Get all backlog items with created_by but no created_by_email
    const items = await pool.query(`
      SELECT id, created_by FROM hub.backlog
      WHERE created_by_email IS NULL OR created_by_email = ''
      ORDER BY id
    `);

    console.log(`Found ${items.rows.length} backlog items to update`);

    for (const item of items.rows) {
      const created_by = item.created_by || '';
      let email = null;

      const parts = created_by.trim().split(' ');

      if (parts.length >= 2) {
        let firstname, lastname;

        // Detect format: if first part is ALL CAPS, it's "LASTNAME Firstname"
        if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
          // Format: LASTNAME Firstname
          lastname = parts[0];
          firstname = parts.slice(1).join(' ');
        } else {
          // Format: Firstname Lastname
          firstname = parts[0];
          lastname = parts.slice(1).join(' ');
        }

        // Special case for Marc Chevalier
        if (firstname.toLowerCase() === 'marc' && lastname.toLowerCase() === 'chevalier') {
          email = 'machevalier@ivry94.fr';
        } else {
          // Standard pattern: initial(firstname) + lastname (e.g., yassine taraki → ytaraki@ivry94.fr)
          const initial = firstname.charAt(0).toLowerCase();
          email = `${initial}${lastname.toLowerCase()}@ivry94.fr`;
        }

        await pool.query(
          'UPDATE hub.backlog SET created_by_email = $1 WHERE id = $2',
          [email, item.id]
        );

        console.log(`✅ Updated ID ${item.id}: ${created_by} → ${email}`);
      } else {
        console.log(`⚠️  Could not parse created_by for ID ${item.id}: "${created_by}"`);
      }
    }

    console.log('✅ Migration completed: backlog emails populated');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
