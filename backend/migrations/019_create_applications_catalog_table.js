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
      CREATE TABLE IF NOT EXISTS hub.applications_catalog (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(255) NOT NULL,
        agent VARCHAR(255) NOT NULL,
        dossier VARCHAR(255),
        nature VARCHAR(255),
        version VARCHAR(255),
        repo_github VARCHAR(512),
        ports_docker VARCHAR(255),
        objectif TEXT,
        modules_fonctions TEXT,
        techno_stack TEXT,
        base_donnees TEXT,
        dependances_integrations TEXT,
        ia_embarquee TEXT,
        variables_env TEXT,
        complexite INTEGER,
        justification_complexite TEXT,
        swagger_doc TEXT,
        etat VARCHAR(150),
        lien_prod VARCHAR(512),
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_applications_catalog_agent ON hub.applications_catalog(agent)
    `);

    console.log('✅ Migration completed: applications_catalog table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
