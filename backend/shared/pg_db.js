const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

function convertSqliteToPostgres(sql) {
    let newSql = sql.replace(/magapp_categories/gi, 'magapp.categories')
                    .replace(/magapp_apps/gi, 'magapp.apps')
                    .replace(/magapp_favorites/gi, 'magapp.favorites')
                    .replace(/magapp_clicks/gi, 'magapp.clicks')
                    .replace(/magapp_subscriptions/gi, 'magapp.subscriptions')
                    .replace(/magapp_settings/gi, 'magapp.settings')
                    .replace(/(?<!hub\.)\busers\b/gi, 'hub.users')
                    .replace(/(?<!hub_rencontres\.)\brencontres_budgetaires\b/gi, 'hub_rencontres.rencontres_budgetaires')
                    .replace(/(?<!hub_rencontres\.)\brencontres_participants\b/gi, 'hub_rencontres.rencontres_participants')
                    .replace(/(?<!hub_rencontres\.)\brencontres_suivi\b/gi, 'hub_rencontres.rencontres_suivi')
                    .replace(/(?<!hub_rencontres\.)\brencontres_reunions\b/gi, 'hub_rencontres.rencontres_reunions')
                    .replace(/(?<!hub_rencontres\.)\breunion_participants\b/gi, 'hub_rencontres.reunion_participants')
                    .replace(/(?<!hub_rencontres\.)\breunion_attachments\b/gi, 'hub_rencontres.reunion_attachments')
                    .replace(/(?<!hub_rencontres\.)\bdirection_emails\b/gi, 'hub_rencontres.direction_emails');

    newSql = newSql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
    newSql = newSql.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
    
    if (newSql.toUpperCase().includes('INSERT INTO MAGAPP.FAVORITES') && sql.toUpperCase().includes('IGNORE')) {
        newSql += ' ON CONFLICT (username, app_id) DO NOTHING';
    } else if (newSql.toUpperCase().includes('INSERT INTO MAGAPP.SUBSCRIPTIONS') && sql.toUpperCase().includes('IGNORE')) {
        newSql += ' ON CONFLICT (email, app_id) DO NOTHING';
    }

    let paramIndex = 1;
    newSql = newSql.replace(/\?/g, () => `$${paramIndex++}`);
    return newSql;
}

const pgDb = {
    all: async (sql, params = []) => {
        const query = convertSqliteToPostgres(sql);
        const res = await pool.query(query, params);
        return res.rows;
    },
    get: async (sql, params = []) => {
        const query = convertSqliteToPostgres(sql);
        const res = await pool.query(query, params);
        return res.rows[0];
    },
    run: async (sql, params = []) => {
        let query = convertSqliteToPostgres(sql);
        if (query.toUpperCase().includes('INSERT') && !query.toUpperCase().includes('INTO HUB.USERS') && !query.toUpperCase().includes('INTO GLPI.')) {
            query += ' RETURNING id';
        }
        const res = await pool.query(query, params);
        return {
            lastID: res.rows.length > 0 ? res.rows[0].id : null,
            changes: res.rowCount
        };
    }
};

async function setupPgDb() {
  let client;
  try {
    client = await pool.connect();
    await client.query('CREATE SCHEMA IF NOT EXISTS magapp;');
    await client.query('CREATE SCHEMA IF NOT EXISTS hub;');
    await client.query('CREATE SCHEMA IF NOT EXISTS glpi;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(255),
        display_order INTEGER DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.apps (
        id SERIAL PRIMARY KEY,
        category_id INTEGER,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        url VARCHAR(1024) NOT NULL,
        icon VARCHAR(1024),
        display_order INTEGER DEFAULT 0,
        is_maintenance INTEGER DEFAULT 0,
        maintenance_start TIMESTAMP,
        maintenance_end TIMESTAMP,
        app_type VARCHAR(50) DEFAULT 'Web',
        present_magapp VARCHAR(3) DEFAULT 'oui',
        present_onboard VARCHAR(3) DEFAULT 'oui',
        email_createur VARCHAR(255) DEFAULT '',
        lien_mercator VARCHAR(1024) DEFAULT '',
        mercator_id INTEGER DEFAULT NULL,
        mercator_name VARCHAR(255) DEFAULT '',
        CONSTRAINT fk_category FOREIGN KEY(category_id) REFERENCES magapp.categories(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.settings (
        id SERIAL PRIMARY KEY,
        show_tickets BOOLEAN DEFAULT TRUE,
        show_subscriptions BOOLEAN DEFAULT TRUE,
        show_health_check BOOLEAN DEFAULT TRUE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.versions (
        id SERIAL PRIMARY KEY,
        version_number VARCHAR(50) NOT NULL,
        release_notes_html TEXT,
        release_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.user_versions (
        username VARCHAR(255) PRIMARY KEY,
        last_seen_version_id INTEGER,
        seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_version FOREIGN KEY(last_seen_version_id) REFERENCES magapp.versions(id) ON DELETE CASCADE
      );
    `);

    const settingsCount = await client.query('SELECT COUNT(*) FROM magapp.settings');
    if (parseInt(settingsCount.rows[0].count) === 0) {
      await client.query('INSERT INTO magapp.settings (show_tickets, show_subscriptions, show_health_check) VALUES (TRUE, TRUE, TRUE)');
      console.log('[PG DB] MagApp settings initialized');
    }

    const columnsToMigrate = [
      { name: 'app_type', type: "VARCHAR(50) DEFAULT 'Web'" },
      { name: 'present_magapp', type: "VARCHAR(3) DEFAULT 'oui'" },
      { name: 'present_onboard', type: "VARCHAR(3) DEFAULT 'oui'" },
      { name: 'email_createur', type: "VARCHAR(255) DEFAULT ''" },
      { name: 'lien_mercator', type: "VARCHAR(1024) DEFAULT ''" },
      { name: 'mercator_id', type: "INTEGER DEFAULT NULL" },
      { name: 'mercator_name', type: "VARCHAR(255) DEFAULT ''" }
    ];

    for (const col of columnsToMigrate) {
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='magapp' AND table_name='apps' AND column_name='${col.name}') THEN
            ALTER TABLE magapp.apps ADD COLUMN ${col.name} ${col.type};
          END IF;
        END $$;
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.favorites (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        app_id INTEGER NOT NULL,
        CONSTRAINT fk_app_fav FOREIGN KEY(app_id) REFERENCES magapp.apps(id) ON DELETE CASCADE,
        UNIQUE(username, app_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.clicks (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL,
        username VARCHAR(255),
        ip_address VARCHAR(255),
        user_agent TEXT,
        clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_app_click FOREIGN KEY(app_id) REFERENCES magapp.apps(id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.subscriptions (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL,
        email VARCHAR(255) NOT NULL,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_app_sub FOREIGN KEY(app_id) REFERENCES magapp.apps(id) ON DELETE CASCADE,
        UNIQUE(email, app_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.users (
        username VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        displayName VARCHAR(255),
        email VARCHAR(255),
        service_code VARCHAR(100),
        service_complement VARCHAR(255),
        last_activity VARCHAR(100),
        is_approved INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.observers (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        name VARCHAR(255),
        login VARCHAR(255),
        email VARCHAR(255),
        is_active INTEGER DEFAULT 1,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, user_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.ticket_status (
        id INTEGER PRIMARY KEY,
        label VARCHAR(255) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.tickets (
        glpi_id INTEGER PRIMARY KEY,
        title TEXT,
        content TEXT,
        status INTEGER,
        priority INTEGER DEFAULT 0,
        urgency INTEGER DEFAULT 0,
        impact INTEGER DEFAULT 0,
        category TEXT,
        type TEXT,
        date_creation TEXT,
        date_mod TEXT,
        date_closed TEXT,
        date_solved TEXT,
        location TEXT,
        solution TEXT,
        source TEXT,
        entity TEXT,
        requester_name TEXT,
        email_alt TEXT,
        requester_email_22 TEXT,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`DROP VIEW IF EXISTS glpi.v_tickets`);
    await client.query(`
      CREATE VIEW glpi.v_tickets AS
      SELECT t.*,
             s.label as status_label,
             LOWER(COALESCE(t.requester_email_22, '')) as search_email,
             LOWER(COALESCE(REPLACE(t.requester_email_22, '@ivry94.fr', ''), '')) as search_username
      FROM glpi.tickets t
      LEFT JOIN glpi.ticket_status s ON t.status = s.id
    `);

    try {
      await client.query(`ALTER TABLE glpi.tickets ADD COLUMN IF NOT EXISTS email_alt TEXT`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE glpi.tickets ADD COLUMN IF NOT EXISTS requester_email_22 TEXT`);
    } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.ideas (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        author_email TEXT,
        author_name TEXT,
        status VARCHAR(50) DEFAULT 'new',
        admin_response TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.idea_attachments (
        id SERIAL PRIMARY KEY,
        idea_id INTEGER REFERENCES magapp.ideas(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.app_users (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES magapp.apps(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        last_connection TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50) DEFAULT 'magapp',
        UNIQUE(app_id, username)
      );
    `);

    try {
      await client.query(`ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_create_buttons BOOLEAN DEFAULT true`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_ideas BOOLEAN DEFAULT true`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_rencontres BOOLEAN DEFAULT true`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_library BOOLEAN DEFAULT false`);
    } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.app_docs (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES magapp.apps(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        doc_type VARCHAR(20) NOT NULL DEFAULT 'pdf',
        url TEXT NOT NULL,
        is_obsolete BOOLEAN DEFAULT FALSE,
        is_favorite BOOLEAN DEFAULT FALSE,
        is_technical BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await client.query(`ALTER TABLE magapp.app_docs ADD COLUMN IF NOT EXISTS description TEXT`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE magapp.app_docs ADD COLUMN IF NOT EXISTS is_technical BOOLEAN DEFAULT FALSE`);
    } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.doc_interactions (
        id SERIAL PRIMARY KEY,
        doc_id INTEGER NOT NULL REFERENCES magapp.app_docs(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        interaction_type VARCHAR(20) NOT NULL DEFAULT 'view',
        rating INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO magapp.settings (id, show_tickets, show_subscriptions, show_health_check, show_create_buttons, show_ideas, show_rencontres)
      VALUES (1, true, true, true, true, true, true)
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.sync_logs (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL,
        sync_mode VARCHAR(20) NOT NULL,
        triggered_by VARCHAR(255) DEFAULT 'system',
        status VARCHAR(20) NOT NULL,
        total_tickets INTEGER DEFAULT 0,
        processed_tickets INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.ticket_followups (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        content TEXT,
        content_hash VARCHAR(32),
        author_name VARCHAR(255),
        author_email VARCHAR(255),
        is_private INTEGER DEFAULT 0,
        date_creation TIMESTAMP,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, content_hash, date_creation)
      );
    `);

    try {
      await client.query(`ALTER TABLE glpi.ticket_followups ADD COLUMN IF NOT EXISTS content_hash VARCHAR(32)`);
      await client.query(`UPDATE glpi.ticket_followups SET content_hash = md5(content) WHERE content_hash IS NULL AND content IS NOT NULL`);
      await client.query(`ALTER TABLE glpi.ticket_followups DROP CONSTRAINT IF EXISTS ticket_followups_ticket_id_content_date_creation_key`);
      await client.query(`
        ALTER TABLE glpi.ticket_followups
        ADD CONSTRAINT ticket_followups_ticket_id_content_hash_date_creation_key
        UNIQUE (ticket_id, content_hash, date_creation)
      `);
    } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.scheduled_syncs (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL,
        sync_mode VARCHAR(20) NOT NULL,
        frequency_type VARCHAR(20) NOT NULL DEFAULT 'minutes',
        frequency_value INTEGER NOT NULL DEFAULT 60,
        execution_time VARCHAR(5) DEFAULT '00:00',
        is_enabled INTEGER DEFAULT 1,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await client.query(`ALTER TABLE glpi.scheduled_syncs ADD COLUMN IF NOT EXISTS execution_time VARCHAR(5) DEFAULT '00:00'`);
    } catch (e) {}

    await client.query('CREATE SCHEMA IF NOT EXISTS hub_rencontres;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.rencontres_reunions (
        id SERIAL PRIMARY KEY,
        titre TEXT NOT NULL,
        date_reunion TIMESTAMP,
        annee INTEGER,
        lieu TEXT,
        description TEXT,
        statut TEXT DEFAULT 'planifiée',
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.rencontres_budgetaires (
        id SERIAL PRIMARY KEY,
        titre TEXT NOT NULL,
        direction TEXT NOT NULL,
        service TEXT,
        date_reunion TIMESTAMP,
        annee INTEGER,
        type TEXT,
        description TEXT,
        cout_ttc NUMERIC,
        arbitrage TEXT,
        responsable_dsi TEXT,
        ticket_glpi TEXT,
        lien_reference TEXT,
        statut TEXT DEFAULT 'planifiée',
        commentaires TEXT,
        suivi TEXT,
        reunion_id INTEGER REFERENCES hub_rencontres.rencontres_reunions(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.rencontres_participants (
        id SERIAL PRIMARY KEY,
        rencontre_id INTEGER NOT NULL REFERENCES hub_rencontres.rencontres_budgetaires(id) ON DELETE CASCADE,
        nom TEXT,
        role TEXT,
        email TEXT,
        statut TEXT DEFAULT 'en attente'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.rencontres_suivi (
        id SERIAL PRIMARY KEY,
        rencontre_id INTEGER NOT NULL REFERENCES hub_rencontres.rencontres_budgetaires(id) ON DELETE CASCADE,
        action_item TEXT,
        responsable TEXT,
        date_echeance DATE,
        statut TEXT DEFAULT 'en cours',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.direction_emails (
        id SERIAL PRIMARY KEY,
        direction TEXT NOT NULL,
        service TEXT,
        email TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(direction, service, email)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.reunion_participants (
        id SERIAL PRIMARY KEY,
        reunion_id INTEGER NOT NULL REFERENCES hub_rencontres.rencontres_reunions(id) ON DELETE CASCADE,
        nom TEXT NOT NULL,
        prenom TEXT,
        email TEXT,
        service TEXT,
        direction TEXT,
        type_presence TEXT DEFAULT 'metier',
        statut_presence TEXT DEFAULT 'present',
        ad_username TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.reunion_attachments (
        id SERIAL PRIMARY KEY,
        reunion_id INTEGER NOT NULL REFERENCES hub_rencontres.rencontres_reunions(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mimetype TEXT,
        size INTEGER,
        uploaded_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_rb_direction ON hub_rencontres.rencontres_budgetaires(direction);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rb_annee ON hub_rencontres.rencontres_budgetaires(annee);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rb_statut ON hub_rencontres.rencontres_budgetaires(statut);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_de_direction ON hub_rencontres.direction_emails(direction);`);

    console.log('[PG DB] Schema and tables initialized successfully');
  } catch (error) {
    console.error('[PG DB] Initialization error:', error.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  pool,
  pgDb,
  setupPgDb
};
