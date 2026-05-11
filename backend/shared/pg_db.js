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
                    .replace(/(?<!hub_rencontres\.)\bdirection_emails\b/gi, 'hub_rencontres.direction_emails')
                    .replace(/(?<!projets\.)\bprojets\b/gi, 'projets.projets')
                    .replace(/(?<!projets\.)\bprojet_services\b/gi, 'projets.projet_services')
                    .replace(/(?<!projets\.)\bprojet_roles\b/gi, 'projets.projet_roles')
                    .replace(/(?<!projets\.)\bprojet_visibilite\b/gi, 'projets.projet_visibilite')
                    .replace(/(?<!projets\.)\bprojet_transitions\b/gi, 'projets.projet_transitions')
                    .replace(/(?<!projets\.)\bprojet_documents\b/gi, 'projets.projet_documents')
                    .replace(/(?<!projets\.)\bprojet_versions_document\b/gi, 'projets.projet_versions_document')
                    .replace(/(?<!projets\.)\bprojet_scores\b/gi, 'projets.projet_scores')
                    .replace(/(?<!projets\.)\bprojet_scoring_config\b/gi, 'projets.projet_scoring_config')
                    .replace(/(?<!projets\.)\bprojet_reunions\b/gi, 'projets.projet_reunions')
                    .replace(/(?<!projets\.)\bprojet_journal\b/gi, 'projets.projet_journal')
                    .replace(/(?<!projets\.)\bprojet_indicateurs\b/gi, 'projets.projet_indicateurs')
                    .replace(/(?<!projets\.)\bprojet_notifications\b/gi, 'projets.projet_notifications')
                    .replace(/(?<!projets\.)\bprojet_types_documentaires\b/gi, 'projets.projet_types_documentaires')
                    .replace(/(?<!projets\.)\bprojet_taches\b/gi, 'projets.projet_taches')
                    .replace(/(?<!projets\.)\bprojet_jalons\b/gi, 'projets.projet_jalons')
                    .replace(/(?<!projets\.)\bprojet_groupes_taches\b/gi, 'projets.projet_groupes_taches')
                    .replace(/(?<!projets\.)\bprojet_favoris\b/gi, 'projets.projet_favoris')
                    .replace(/(?<!projets\.)\bprojet_dependances\b/gi, 'projets.projet_dependances')
                    .replace(/(?<!projets\.)\bprojet_attendus\b/gi, 'projets.projet_attendus')
                    .replace(/(?<!transcript\.)\btranscript_meetings\b/gi, 'transcript.meetings')
                    .replace(/(?<!transcript\.)\btranscript_cues\b/gi, 'transcript.cues')
                    .replace(/(?<!transcript\.)\btranscript_tasks\b/gi, 'transcript.tasks')
                    .replace(/(?<!projets\.)\bprojet_comites\b/gi, 'projets.projet_comites')
                    .replace(/(?<!projets\.)\bprojet_comites_membres\b/gi, 'projets.projet_comites_membres')
                    .replace(/(?<!projets\.)\bprojet_etapes\b/gi, 'projets.projet_etapes')
                    .replace(/(?<!projets\.)\bprojet_applications\b/gi, 'projets.projet_applications');

    newSql = newSql.replace(/transcript_meetings/gi, 'transcript.meetings')
                    .replace(/transcript_cues/gi, 'transcript.cues')
                    .replace(/transcript_tasks/gi, 'transcript.tasks')
                    .replace(/transcript_settings/gi, 'transcript.settings');

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
    await client.query('CREATE SCHEMA IF NOT EXISTS oracle;');
    await client.query('CREATE SCHEMA IF NOT EXISTS transcript;');

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
        releve_decision TEXT,
        liste_taches TEXT,
        statut TEXT DEFAULT 'planifiée',
        created_by TEXT,
        source TEXT DEFAULT 'rencontres_budgetaires',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try { await client.query(`ALTER TABLE hub_rencontres.rencontres_reunions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'rencontres_budgetaires'`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_rencontres.reunion_participants ADD COLUMN IF NOT EXISTS commentaire TEXT`); } catch (e) {}

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
        commentaire TEXT,
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

    // ============================================
    // PROJETS - Gestion de portefeuille projets
    // ============================================
    await client.query('CREATE SCHEMA IF NOT EXISTS projets;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projets (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE,
        titre TEXT NOT NULL,
        description TEXT,
        niveau_projet TEXT DEFAULT 'standard',
        statut TEXT DEFAULT 'idee',
        statut_precedent TEXT,
        service_pilote TEXT NOT NULL,
        commanditaire_username TEXT,
        chef_projet_username TEXT,
        responsable_dsi_username TEXT,
        representant_metier_username TEXT,
        dpo_username TEXT,
        date_debut_prevue TEXT,
        date_fin_prevue TEXT,
        date_debut_reelle TEXT,
        date_fin_reelle TEXT,
        priorite INTEGER DEFAULT 0,
        score_total NUMERIC DEFAULT 0,
        avancement NUMERIC DEFAULT 0,
        risque_global TEXT,
        satisfaction_metier INTEGER,
        benefices_attendus TEXT,
        benefices_realises TEXT,
        notes_internes TEXT,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by_username TEXT,
        modified_by_username TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_services (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        service_code TEXT NOT NULL,
        UNIQUE(projet_id, service_code)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_roles (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT,
        email TEXT,
        date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ajoute_par_username TEXT,
        UNIQUE(projet_id, username, role)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_visibilite (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        display_name TEXT,
        UNIQUE(projet_id, username)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_transitions (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        statut_avant TEXT NOT NULL,
        statut_apres TEXT NOT NULL,
        date_transition TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        username TEXT NOT NULL,
        commentaire TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_documents (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        type_documentaire TEXT NOT NULL,
        phase_concernee TEXT,
        description TEXT,
        est_attendu INTEGER DEFAULT 0,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by_username TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_versions_document (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES projets.projet_documents(id) ON DELETE CASCADE,
        version TEXT NOT NULL,
        fichier_nom TEXT NOT NULL,
        fichier_original TEXT NOT NULL,
        fichier_taille INTEGER,
        fichier_type TEXT,
        commentaire TEXT,
        est_version_courante INTEGER DEFAULT 1,
        date_depot TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        depose_par_username TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_scores (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        critere TEXT NOT NULL,
        note INTEGER NOT NULL CHECK(note >= 1 AND note <= 5),
        justification TEXT,
        date_notation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        note_par_username TEXT,
        UNIQUE(projet_id, critere)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_scoring_config (
        id SERIAL PRIMARY KEY,
        critere TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        poids INTEGER NOT NULL DEFAULT 10,
        actif INTEGER DEFAULT 1,
        ordre INTEGER DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_reunions (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        reunion_id INTEGER NOT NULL,
        type_gouvernance TEXT,
        UNIQUE(projet_id, reunion_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_journal (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        type_entree TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        username TEXT NOT NULL,
        date_entree TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_indicateurs (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        type_indicateur TEXT NOT NULL,
        valeur TEXT,
        date_saisie TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        saisi_par_username TEXT,
        commentaire TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_notifications (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        destinataire_username TEXT NOT NULL,
        type_notification TEXT NOT NULL,
        message TEXT,
        envoye INTEGER DEFAULT 0,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_envoi TIMESTAMP,
        erreur TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_types_documentaires (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        phase_concernee TEXT,
        obligatoire INTEGER DEFAULT 0,
        ordre INTEGER DEFAULT 0,
        actif INTEGER DEFAULT 1
      );
    `);

    // Index
    await client.query('CREATE INDEX IF NOT EXISTS idx_projets_statut ON projets.projets(statut);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projets_service_pilote ON projets.projets(service_pilote);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projets_priorite ON projets.projets(priorite);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projets_score ON projets.projets(score_total);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_roles_user ON projets.projet_roles(projet_id, username);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_journal_p ON projets.projet_journal(projet_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_documents_p ON projets.projet_documents(projet_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_scores_p ON projets.projet_scores(projet_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_visibilite_u ON projets.projet_visibilite(projet_id, username);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_notif_dest ON projets.projet_notifications(destinataire_username, envoye);');

    // Migration: Ajouter colonne meteo
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='meteo') THEN
            ALTER TABLE projets.projets ADD COLUMN meteo TEXT DEFAULT 'neutre';
          END IF;
        END $$;
      `);
    } catch (e) {}

    // Migration: colonnes est_contractuel et url dans projet_documents
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_documents' AND column_name='est_contractuel') THEN
            ALTER TABLE projets.projet_documents ADD COLUMN est_contractuel INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);
    } catch (e) {}
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_documents' AND column_name='url') THEN
            ALTER TABLE projets.projet_documents ADD COLUMN url TEXT;
          END IF;
        END $$;
      `);
    } catch (e) {}
    // Migration: colonne type_vrac pour distinguer les documents en vrac
    // ============================================
    // TRANSCRIPT - Gestion des transcripts
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS transcript.meetings (
        id SERIAL PRIMARY KEY,
        title TEXT,
        summary TEXT,
        meeting_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS transcript.cues (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER REFERENCES transcript.meetings(id) ON DELETE CASCADE,
        speaker_name TEXT,
        speaker_username TEXT,
        speaker_email TEXT,
        start_seconds REAL,
        text TEXT
      );
    `);
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='transcript' AND table_name='meetings' AND column_name='meeting_date') THEN
            ALTER TABLE transcript.meetings ADD COLUMN meeting_date TIMESTAMP;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='transcript' AND table_name='cues' AND column_name='speaker_username') THEN
            ALTER TABLE transcript.cues ADD COLUMN speaker_username TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='transcript' AND table_name='cues' AND column_name='speaker_email') THEN
            ALTER TABLE transcript.cues ADD COLUMN speaker_email TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='transcript' AND table_name='meetings' AND column_name='reunion_id') THEN
            ALTER TABLE transcript.meetings ADD COLUMN reunion_id INTEGER;
          END IF;
        END $$;
      `);
    } catch (e) {
        console.error('Error migrating transcript tables:', e.message);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS transcript.tasks (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER REFERENCES transcript.meetings(id) ON DELETE CASCADE,
        description TEXT,
        assignee TEXT,
        requester TEXT,
        deadline TEXT,
        is_completed INTEGER DEFAULT 0,
        origin TEXT,
        start_seconds REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS transcript.settings (
        id SERIAL PRIMARY KEY,
        setting_key TEXT UNIQUE,
        setting_value TEXT,
        description TEXT
      );
    `);
    await client.query(`
      INSERT INTO transcript.settings (setting_key, setting_value, description)
      VALUES 
      ('groq_api_key', 'gsk_h67R9mK9v8f4H7j2L3k5M1n0P9q8R7s6T5u4V3w2X1y0', 'Clé API Groq pour les résumés'),
      ('ai_provider', 'groq', 'Fournisseur d''IA par défaut'),
      ('gemini_api_key', '', 'Clé API Google Gemini'),
      ('openrouter_api_key', '', 'Clé API OpenRouter'),
      ('anthropic_api_key', '', 'Clé API Anthropic'),
      ('ollama_host', 'http://localhost:11434', 'Hôte Ollama local'),
      ('anthropic_model', 'claude-3-5-sonnet-20240620', 'Modèle Anthropic par défaut')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_documents' AND column_name='type_vrac') THEN
            ALTER TABLE projets.projet_documents ADD COLUMN type_vrac INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);
    } catch (e) {}

    // Migration: colonnes dpd_requis et rssi_requis
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='dpd_requis') THEN
            ALTER TABLE projets.projets ADD COLUMN dpd_requis INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);
    } catch (e) {}
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='rssi_requis') THEN
            ALTER TABLE projets.projets ADD COLUMN rssi_requis INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);
    } catch (e) {}
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='chef_projet_metier_username') THEN
            ALTER TABLE projets.projets ADD COLUMN chef_projet_metier_username TEXT;
          END IF;
        END $$;
      `);
    } catch (e) {}
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_comites_membres' AND column_name='role') THEN
            ALTER TABLE projets.projet_comites_membres ADD COLUMN role TEXT;
          END IF;
        END $$;
      `);
    } catch (e) {}

    // Migration: colonnes display_name gouvernance
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='commanditaire_display_name') THEN ALTER TABLE projets.projets ADD COLUMN commanditaire_display_name TEXT; END IF; END $$;`); } catch (e) {}
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='chef_projet_display_name') THEN ALTER TABLE projets.projets ADD COLUMN chef_projet_display_name TEXT; END IF; END $$;`); } catch (e) {}
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='chef_projet_metier_display_name') THEN ALTER TABLE projets.projets ADD COLUMN chef_projet_metier_display_name TEXT; END IF; END $$;`); } catch (e) {}
    // Migration: comite_id dans projet_reunions
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_reunions' AND column_name='comite_id') THEN ALTER TABLE projets.projet_reunions ADD COLUMN comite_id INTEGER REFERENCES projets.projet_comites(id) ON DELETE SET NULL; END IF; END $$;`); } catch (e) {}
    // Migration: projet_parent_id
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='projet_parent_id') THEN ALTER TABLE projets.projets ADD COLUMN projet_parent_id INTEGER REFERENCES projets.projets(id) ON DELETE SET NULL; END IF; END $$;`); } catch (e) {}
    // Migration: groupe_id dans projet_taches
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_taches' AND column_name='groupe_id') THEN ALTER TABLE projets.projet_taches ADD COLUMN groupe_id INTEGER REFERENCES projets.projet_groupes_taches(id) ON DELETE SET NULL; END IF; END $$;`); } catch (e) {}

    // ============================================
    // PROJETS - Planning / Tâches
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_taches (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        groupe_id INTEGER,
        titre TEXT NOT NULL,
        description TEXT,
        date_debut DATE,
        date_fin DATE,
        statut TEXT DEFAULT 'a_faire',
        responsable_username TEXT,
        couleur TEXT DEFAULT '#3b82f6',
        ordre INTEGER DEFAULT 0,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_groupes_taches (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        titre TEXT NOT NULL,
        couleur TEXT DEFAULT '#e2e8f0',
        ordre INTEGER DEFAULT 0,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_jalons (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        titre TEXT NOT NULL,
        description TEXT,
        date_jalon DATE NOT NULL,
        type TEXT DEFAULT 'jalon',
        atteint INTEGER DEFAULT 0,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_taches_p ON projets.projet_taches(projet_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projet_jalons_p ON projets.projet_jalons(projet_id);');

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_favoris (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(projet_id, username)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_attendus (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        type_code TEXT NOT NULL,
        obligatoire INTEGER DEFAULT 0,
        phase_concernee TEXT,
        UNIQUE(projet_id, type_code)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_comites (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        nom TEXT NOT NULL,
        role TEXT,
        frequence TEXT,
        responsable_username TEXT,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_comites_membres (
        id SERIAL PRIMARY KEY,
        comite_id INTEGER NOT NULL REFERENCES projets.projet_comites(id) ON DELETE CASCADE,
        prenom TEXT,
        nom TEXT NOT NULL,
        email TEXT,
        societe TEXT,
        fonction TEXT,
        telephone TEXT,
        ad_username TEXT,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_etapes (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        etape TEXT NOT NULL,
        actif INTEGER DEFAULT 1,
        ordre INTEGER DEFAULT 0,
        UNIQUE(projet_id, etape)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_applications (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        app_id INTEGER NOT NULL,
        UNIQUE(projet_id, app_id)
      );
    `);

    await client.query(`
      DROP TABLE IF EXISTS projets.projet_dependances CASCADE;
      CREATE TABLE IF NOT EXISTS projets.projet_dependances (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK(source_type IN ('tache','jalon')),
        source_id INTEGER NOT NULL,
        depend_type TEXT NOT NULL CHECK(depend_type IN ('tache','jalon')),
        depend_id INTEGER NOT NULL,
        UNIQUE(source_type, source_id, depend_type, depend_id)
      );
    `);

    // Seed default scoring config
    const scoringCount = await client.query('SELECT COUNT(*) FROM projets.projet_scoring_config');
    if (parseInt(scoringCount.rows[0].count) === 0) {
      const defaultCriteria = [
        ['alignement_strategique', 'Alignement stratégique', 15],
        ['valeur_metier', 'Valeur métier / usagers', 15],
        ['obligation_reglementaire', 'Obligation réglementaire', 15],
        ['urgence', 'Urgence', 10],
        ['risque_si_non_realise', 'Risque si non réalisé', 10],
        ['faisabilite', 'Faisabilité', 10],
        ['dependances', 'Dépendances', 5],
        ['complexite', 'Complexité', 5],
        ['cout_estimatif', 'Coût estimatif', 5],
        ['impact_transverse', 'Impact transverse', 10]
      ];
      let critereOrdre = 0;
      for (const [critere, label, poids] of defaultCriteria) {
        await client.query(
          'INSERT INTO projets.projet_scoring_config (critere, label, poids, ordre) VALUES ($1, $2, $3, $4)',
          [critere, label, poids, critereOrdre++]
        );
      }
    }

    // Seed default document types
    const docTypeCount = await client.query('SELECT COUNT(*) FROM projets.projet_types_documentaires');
    if (parseInt(docTypeCount.rows[0].count) === 0) {
      const defaultTypes = [
        ['fiche_idee', 'Fiche idée', 'idee', 0],
        ['fiche_demande', 'Fiche de demande', 'demande_initiale', 1],
        ['charte_projet', 'Charte projet', 'etude_dsi', 1],
        ['note_arbitrage', "Note d'arbitrage", 'arbitrage', 1],
        ['plan_projet', 'Plan projet', 'planification', 1],
        ['plan_communication', 'Plan de communication', 'planification', 0],
        ['journal_projet', 'Journal projet', 'planification', 0],
        ['compte_rendu', 'Compte rendu / MOM', null, 0],
        ['va', 'VA', 'recette', 1],
        ['vsr', 'VSR', 'recette', 1],
        ['doc_fonctionnelle', 'Documentation fonctionnelle', null, 0],
        ['doc_technique', 'Documentation technique', null, 0],
        ['doc_exploitation', "Documentation d'exploitation", null, 0],
        ['doc_support', 'Documentation support', null, 0],
        ['bilan_cloture', 'Bilan de clôture', 'cloture', 1],
        ['autre', 'Autre pièce jointe', null, 0]
      ];
      let docOrdre = 0;
      for (const [code, label, phase, obligatoire] of defaultTypes) {
        await client.query(
          'INSERT INTO projets.projet_types_documentaires (code, label, phase_concernee, obligatoire, ordre) VALUES ($1, $2, $3, $4, $5)',
          [code, label, phase, obligatoire, docOrdre++]
        );
      }
    }

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
