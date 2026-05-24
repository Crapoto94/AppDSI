const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
  timezone: 'UTC'
});

// Ensure all connections use UTC timezone
pool.on('connect', (client) => {
  client.query("SET timezone = 'UTC';");
});

function convertSqliteToPostgres(sql) {
    let newSql = sql.replace(/magapp_categories/gi, 'magapp.categories')
                    .replace(/magapp_apps/gi, 'magapp.apps')
                    .replace(/magapp_favorites/gi, 'magapp.favorites')
                    .replace(/magapp_clicks/gi, 'magapp.clicks')
                    .replace(/magapp_subscriptions/gi, 'magapp.subscriptions')
                    .replace(/magapp_settings/gi, 'magapp.settings')
                    .replace(/(?<!hub_contrats\.)\bcontrats\b(?!\s*\.)/gi, 'hub_contrats.contrats')
                    .replace(/(?<!hub_contrats\.)\bcontrat_documents\b/gi, 'hub_contrats.contrat_documents')
                    .replace(/(?<!hub\.)\bcertificates\b/gi, 'hub.certificates')
                    .replace(/(?<!\.)\busers\b/gi, 'hub.users')
                    .replace(/(?<!hub_rencontres\.)\brencontres_budgetaires\b/gi, 'hub_rencontres.rencontres_budgetaires')
                    .replace(/(?<!hub_rencontres\.)\brencontres_participants\b/gi, 'hub_rencontres.rencontres_participants')
                    .replace(/(?<!hub_rencontres\.)\brencontres_suivi\b/gi, 'hub_rencontres.rencontres_suivi')
                    .replace(/(?<!hub_rencontres\.)\brencontres_reunions\b/gi, 'hub_rencontres.rencontres_reunions')
                    .replace(/(?<!hub_rencontres\.)\breunion_participants\b/gi, 'hub_rencontres.reunion_participants')
                    .replace(/(?<!hub_rencontres\.)\breunion_attachments\b/gi, 'hub_rencontres.reunion_attachments')
                    .replace(/(?<!hub_rencontres\.)\bdirection_emails\b/gi, 'hub_rencontres.direction_emails')
                    .replace(/(?<!projets\.)\bprojets\b(?!\s*\.)/gi, 'projets.projets')
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
                    .replace(/(?<!projets\.)\bprojet_applications\b/gi, 'projets.projet_applications')
                    .replace(/(?<!projets\.)\bprojet_taches_standalone\b/gi, 'projets.projet_taches_standalone')
                    .replace(/(?<!hub\.)\bemail_automations\b/gi, 'hub.email_automations')
                    .replace(/(?<!hub\.)\bemail_automation_recipients\b/gi, 'hub.email_automation_recipients')
                    .replace(/(?<!hub\.)\bemail_automation_logs\b/gi, 'hub.email_automation_logs')
                    .replace(/(?<!hub_calendrier\.)\bo365_calendars\b/gi, 'hub_calendrier.o365_calendars')
                    .replace(/(?<!hub_calendrier\.)\bo365_events\b/gi, 'hub_calendrier.o365_events')
                    .replace(/(?<!hub\.)\bbacklog\b/gi, 'hub.backlog')
                    .replace(/(?<!hub_copieurs\.)\bcopieurs\b(?!\s*\.)/gi, 'hub_copieurs.copieurs')
                    .replace(/(?<!hub_copieurs\.)\bcopieur_visites\b/gi, 'hub_copieurs.copieur_visites')
                    .replace(/(?<!hub_consommables\.)\bconsumable_types\b/gi, 'hub_consommables.consumable_types')
                    .replace(/(?<!hub_consommables\.)\bconsumable_catalog\b/gi, 'hub_consommables.consumable_catalog')
                    .replace(/(?<!hub_consommables\.)\bconsumable_requests\b/gi, 'hub_consommables.consumable_requests')
                    .replace(/(?<!hub_consommables\.)\brequest_articles\b/gi, 'hub_consommables.request_articles');

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

function escapePgValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return String(val);
    if (val instanceof Date) return `'${val.toISOString()}'`;
    const s = String(val).replace(/'/g, "''");
    return `'${s}'`;
}

function inlineParams(sql, params) {
    if (!params || params.length === 0) return sql;
    return sql.replace(/\$(\d+)/g, (match, num) => {
        const i = parseInt(num, 10);
        if (i >= 1 && i <= params.length) return escapePgValue(params[i - 1]);
        return match;
    });
}

const pgDb = {
    all: async (sql, params = []) => {
        let query = convertSqliteToPostgres(sql);
        query = inlineParams(query, params);
        const res = await pool.query(query);
        return res.rows;
    },
    get: async (sql, params = []) => {
        let query = convertSqliteToPostgres(sql);
        query = inlineParams(query, params);
        const res = await pool.query(query);
        return res.rows[0];
    },
    run: async (sql, params = []) => {
        let query = convertSqliteToPostgres(sql);
        if (query.toUpperCase().includes('INSERT') && !query.toUpperCase().includes('INTO HUB.USERS') && !query.toUpperCase().includes('INTO GLPI.') && !query.toUpperCase().includes('INTO HUB_TICKETS.TICKETS') && !query.toUpperCase().includes('INTO HUB_TICKETS.TECHNICIAN_PROFILES') && !query.toUpperCase().includes('INTO HUB_TICKETS.MODULE_CONFIG')) {
            query += ' RETURNING id';
        }
        query = inlineParams(query, params);
        const res = await pool.query(query);
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
    // Set timezone to UTC for all connections
    await client.query("SET timezone = 'UTC';");
    await client.query('CREATE SCHEMA IF NOT EXISTS magapp;');
    await client.query('CREATE SCHEMA IF NOT EXISTS hub;');
    await client.query('CREATE SCHEMA IF NOT EXISTS glpi;');
    await client.query('CREATE SCHEMA IF NOT EXISTS oracle;');
    await client.query('CREATE SCHEMA IF NOT EXISTS transcript;');
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_contrats;');
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_tickets;');

    // ─── hub — Table utilisateurs (référencée par plusieurs FKs) ─
    // Initialisation non destructive: hub.users est referencee par plusieurs tables metier.
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE,
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

    // ─── hub_tickets — Tables core (copies de glpi) ──────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.tickets (
        glpi_id INTEGER PRIMARY KEY,
        title TEXT,
        content TEXT,
        status INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 3,
        urgency INTEGER DEFAULT 3,
        impact INTEGER DEFAULT 3,
        category TEXT,
        type TEXT,
        date_creation TEXT,
        date_mod TEXT,
        date_closed TEXT,
        date_solved TEXT,
        location TEXT,
        solution TEXT,
        source TEXT DEFAULT 'hub',
        entity TEXT,
        requester_name TEXT,
        email_alt TEXT,
        requester_email_22 TEXT,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Ensure glpi_id has a unique constraint (FK requirement for ticket_assignments)
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD UNIQUE (glpi_id)'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS total_waiting_seconds DOUBLE PRECISION DEFAULT 0'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS subcategory_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS software_id INTEGER REFERENCES magapp.apps(id) ON DELETE SET NULL'); } catch (e) {}
    // Supprimer la FK sur user_id (hub.users est vidée à chaque restart)
    try { await client.query('ALTER TABLE hub_tickets.ticket_history DROP CONSTRAINT IF EXISTS ticket_history_user_id_fkey'); } catch (e) {}
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_status (
        id INTEGER PRIMARY KEY,
        label VARCHAR(255) NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.observers (
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
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_followups (
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

    // ─── hub_tickets — Tables d'extension ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_sequence (
        last_id INTEGER NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.technician_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.technician_group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES hub_tickets.technician_groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        UNIQUE(group_id, user_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tgm_group ON hub_tickets.technician_group_members(group_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tgm_user ON hub_tickets.technician_group_members(user_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_assignments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        technician_id INTEGER REFERENCES hub.users(id) ON DELETE SET NULL,
        group_id INTEGER REFERENCES hub_tickets.technician_groups(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assigned_by INTEGER REFERENCES hub.users(id),
        UNIQUE(ticket_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ta_tech ON hub_tickets.ticket_assignments(technician_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ta_group ON hub_tickets.ticket_assignments(group_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
        full_path TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tc_parent ON hub_tickets.ticket_categories(parent_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_category_assignments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
        UNIQUE(ticket_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tca_cat ON hub_tickets.ticket_category_assignments(category_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        color VARCHAR(7) DEFAULT '#6366f1',
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_tag_links (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES hub_tickets.ticket_tags(id) ON DELETE CASCADE,
        UNIQUE(ticket_id, tag_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ttl_ticket ON hub_tickets.ticket_tag_links(ticket_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_attachments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mimetype TEXT,
        file_size INTEGER,
        file_path TEXT NOT NULL,
        is_image BOOLEAN DEFAULT FALSE,
        uploaded_by INTEGER REFERENCES hub.users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ta_file_ticket ON hub_tickets.ticket_attachments(ticket_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_links (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        linked_ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        link_type VARCHAR(50) NOT NULL CHECK (link_type IN ('parent','child','duplicate','related','blocked_by')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, linked_ticket_id, link_type)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tl_ticket ON hub_tickets.ticket_links(ticket_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_history (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES hub.users(id),
        action VARCHAR(100) NOT NULL,
        field_name VARCHAR(100),
        old_value TEXT,
        new_value TEXT,
        comment TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_th_ticket ON hub_tickets.ticket_history(ticket_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_th_created ON hub_tickets.ticket_history(created_at DESC)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.sla_calendars (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        timezone VARCHAR(50) DEFAULT 'Europe/Paris',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.sla_calendar_hours (
        id SERIAL PRIMARY KEY,
        calendar_id INTEGER NOT NULL REFERENCES hub_tickets.sla_calendars(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        UNIQUE(calendar_id, day_of_week, start_time)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.sla_holidays (
        id SERIAL PRIMARY KEY,
        calendar_id INTEGER NOT NULL REFERENCES hub_tickets.sla_calendars(id) ON DELETE CASCADE,
        holiday_date DATE NOT NULL,
        label VARCHAR(255) NOT NULL,
        UNIQUE(calendar_id, holiday_date)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.sla_definitions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        calendar_id INTEGER NOT NULL REFERENCES hub_tickets.sla_calendars(id),
        first_response_min INTEGER,
        resolution_min INTEGER,
        escalation_min INTEGER,
        priority INTEGER,
        category_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
        type VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sla_def_prio ON hub_tickets.sla_definitions(priority)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_sla (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        sla_definition_id INTEGER NOT NULL REFERENCES hub_tickets.sla_definitions(id),
        first_response_target TIMESTAMP,
        resolution_target TIMESTAMP,
        escalation_target TIMESTAMP,
        first_response_at TIMESTAMP,
        resolved_at TIMESTAMP,
        closed_at TIMESTAMP,
        sla_status VARCHAR(50) DEFAULT 'ok',
        pause_count INTEGER DEFAULT 0,
        total_paused_minutes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ts_status ON hub_tickets.ticket_sla(sla_status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_sla_pauses (
        id SERIAL PRIMARY KEY,
        sla_id INTEGER NOT NULL REFERENCES hub_tickets.ticket_sla(id) ON DELETE CASCADE,
        paused_at TIMESTAMP NOT NULL,
        resumed_at TIMESTAMP,
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.sla_escalation_rules (
        id SERIAL PRIMARY KEY,
        sla_definition_id INTEGER NOT NULL REFERENCES hub_tickets.sla_definitions(id) ON DELETE CASCADE,
        escalation_level INTEGER NOT NULL,
        trigger_before_min INTEGER,
        notify_role VARCHAR(50),
        notify_user_id INTEGER REFERENCES hub.users(id) ON DELETE SET NULL,
        action VARCHAR(100) DEFAULT 'notify',
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.notification_templates (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) NOT NULL UNIQUE,
        label VARCHAR(255) NOT NULL,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        context VARCHAR(50) DEFAULT 'ticket',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.notification_triggers (
        id SERIAL PRIMARY KEY,
        event VARCHAR(100) NOT NULL,
        template_slug VARCHAR(100) NOT NULL REFERENCES hub_tickets.notification_templates(slug),
        recipient_type VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        UNIQUE(event, recipient_type)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.notification_queue (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255),
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nq_status ON hub_tickets.notification_queue(status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.notification_logs (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES hub_tickets.tickets(glpi_id) ON DELETE SET NULL,
        event VARCHAR(100),
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255),
        subject TEXT,
        status VARCHAR(50),
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_nl_ticket ON hub_tickets.notification_logs(ticket_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.assignment_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 0,
        match_type VARCHAR(50),
        match_value VARCHAR(255),
        assign_type VARCHAR(50) NOT NULL,
        assign_to_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.saved_filters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        filter_json JSONB NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, ticket_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_relations (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        relation_type VARCHAR(50) NOT NULL CHECK (relation_type IN ('contract','project','task','asset')),
        relation_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, relation_type, relation_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tr_ticket ON hub_tickets.ticket_relations(ticket_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.dashboard_widgets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        widget_type VARCHAR(100) NOT NULL,
        config JSONB DEFAULT '{}',
        position INTEGER DEFAULT 0,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.technician_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES hub.users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','inactive')),
        paused_at TIMESTAMP,
        paused_until TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await client.query("ALTER TABLE hub_tickets.technician_profiles ADD COLUMN IF NOT EXISTS module_role VARCHAR(50) DEFAULT 'technician'"); } catch (e) {}
    // username column — authoritative key for lookups (hub users live in SQLite, not in hub.users PG)
    try { await client.query("ALTER TABLE hub_tickets.technician_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(255)"); } catch (e) {}
    try { await client.query("CREATE UNIQUE INDEX IF NOT EXISTS tech_profiles_username_uq ON hub_tickets.technician_profiles(username) WHERE username IS NOT NULL"); } catch (e) {}
    // Backfill username from hub.users for existing rows — normalize to lowercase
    try { await client.query("UPDATE hub_tickets.technician_profiles tp SET username = LOWER(u.username) FROM hub.users u WHERE tp.user_id = u.id AND (tp.username IS NULL OR tp.username != LOWER(u.username))"); } catch (e) {}
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS hub_tickets.role_permissions (
                id SERIAL PRIMARY KEY,
                role VARCHAR(50) NOT NULL,
                permission VARCHAR(100) NOT NULL,
                UNIQUE(role, permission)
            )
        `);
        const { rows: cntRows } = await client.query('SELECT COUNT(*) as cnt FROM hub_tickets.role_permissions');
        if (parseInt(cntRows[0].cnt) === 0) {
            const defaults = [
                ['readonly','ticket:read'],['user','ticket:read'],['technician','ticket:read'],['supervisor','ticket:read'],['admin','ticket:read'],['superadmin','ticket:read'],
                ['user','ticket:create'],['technician','ticket:create'],['supervisor','ticket:create'],['admin','ticket:create'],['superadmin','ticket:create'],
                ['technician','ticket:update'],['supervisor','ticket:update'],['admin','ticket:update'],['superadmin','ticket:update'],
                ['superadmin','ticket:delete'],
                ['supervisor','ticket:assign'],['admin','ticket:assign'],['superadmin','ticket:assign'],
                ['technician','ticket:assign_self'],
                ['supervisor','ticket:escalate'],['admin','ticket:escalate'],['superadmin','ticket:escalate'],
                ['technician','ticket:close'],['supervisor','ticket:close'],['admin','ticket:close'],['superadmin','ticket:close'],
                ['user','ticket:reopen'],['technician','ticket:reopen'],['supervisor','ticket:reopen'],['admin','ticket:reopen'],['superadmin','ticket:reopen'],
                ['technician','comment:read_private'],['supervisor','comment:read_private'],['admin','comment:read_private'],['superadmin','comment:read_private'],
                ['technician','comment:write_internal'],['supervisor','comment:write_internal'],['admin','comment:write_internal'],['superadmin','comment:write_internal'],
                ['user','comment:write_public'],['technician','comment:write_public'],['supervisor','comment:write_public'],['admin','comment:write_public'],['superadmin','comment:write_public'],
                ['user','attachment:upload'],['technician','attachment:upload'],['supervisor','attachment:upload'],['admin','attachment:upload'],['superadmin','attachment:upload'],
                ['admin','sla:configure'],['superadmin','sla:configure'],
                ['admin','category:manage'],['superadmin','category:manage'],
                ['admin','group:manage'],['superadmin','group:manage'],
                ['admin','rules:manage'],['superadmin','rules:manage'],
                ['admin','admin:access'],['superadmin','admin:access'],
                ['supervisor','ticket:view_all'],['admin','ticket:view_all'],['superadmin','ticket:view_all'],
                ['technician','dashboard:view_stats'],['supervisor','dashboard:view_stats'],['admin','dashboard:view_stats'],['superadmin','dashboard:view_stats'],
            ];
            for (const [role, perm] of defaults) {
                await client.query('INSERT INTO hub_tickets.role_permissions (role, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING', [role, perm]);
            }
        }
    } catch (e) { console.error('[MIGRATIONS] role_permissions:', e.message); }

    // ── Groupes de tickets ──────────────────────────────────────────
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS hub_tickets.ticket_groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_by_username VARCHAR(255),
                problem_ticket_id INTEGER NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS hub_tickets.ticket_group_members (
                id SERIAL PRIMARY KEY,
                group_id INTEGER NOT NULL REFERENCES hub_tickets.ticket_groups(id) ON DELETE CASCADE,
                ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
                added_by_username VARCHAR(255),
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ticket_id)
            )
        `);
    } catch (e) { console.error('[MIGRATIONS] ticket_groups:', e.message); }
    try { await client.query("ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS resolution_method TEXT"); } catch (e) {}
    try { await client.query("ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS knowledge_article TEXT"); } catch (e) {}

    // ── Historique quotidien des KPI ────────────────────────────────
    await client.query(`
        CREATE TABLE IF NOT EXISTS hub_tickets.kpi_history (
            id SERIAL PRIMARY KEY,
            snapshot_date DATE NOT NULL,
            total INTEGER DEFAULT 0,
            open INTEGER DEFAULT 0,
            in_progress INTEGER DEFAULT 0,
            waiting INTEGER DEFAULT 0,
            critical_open INTEGER DEFAULT 0,
            resolved INTEGER DEFAULT 0,
            closed INTEGER DEFAULT 0,
            problems INTEGER DEFAULT 0,
            vip_total INTEGER DEFAULT 0,
            open_incident INTEGER DEFAULT 0,
            open_request INTEGER DEFAULT 0,
            avg_age_open_seconds INTEGER DEFAULT 0,
            avg_waiting_seconds_active INTEGER DEFAULT 0,
            avg_active_seconds_week INTEGER DEFAULT 0,
            resolved_week_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(snapshot_date)
        )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.module_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT
      );
    `);

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
        show_health_check BOOLEAN DEFAULT TRUE,
        show_create_buttons BOOLEAN DEFAULT true,
        show_ideas BOOLEAN DEFAULT true,
        show_rencontres BOOLEAN DEFAULT true,
        show_library BOOLEAN DEFAULT false,
        show_consommables BOOLEAN DEFAULT true
      );
    `);

    await client.query('INSERT INTO magapp.settings (id, show_tickets, show_subscriptions, show_health_check, show_create_buttons, show_ideas, show_rencontres, show_consommables) VALUES (1, true, true, true, true, true, true, true) ON CONFLICT (id) DO NOTHING');

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
      CREATE TABLE IF NOT EXISTS hub.certificates (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(255),
        request_date DATE,
        beneficiary_name TEXT,
        beneficiary_email VARCHAR(255),
        product_code VARCHAR(255),
        product_label TEXT,
        file_path TEXT,
        expiry_date DATE,
        sedit_number VARCHAR(255) DEFAULT '',
        is_provisional INTEGER DEFAULT 0,
        observations TEXT DEFAULT '',
        renewal_status VARCHAR(50),
        renewal_comment TEXT DEFAULT '',
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try { await client.query(`ALTER TABLE hub.user_tile_order DROP CONSTRAINT IF EXISTS user_tile_order_user_id_fkey`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tile_order DROP CONSTRAINT IF EXISTS hub_user_tile_order_user_id_fkey`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tile_order DROP CONSTRAINT IF EXISTS fk_user_tile_order_user`); } catch (e) {}
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.user_tile_order (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        tile_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tile_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.calendrier_managers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES hub.users(id) ON DELETE CASCADE
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.users (
        username VARCHAR(255) PRIMARY KEY,
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

    // Copier les données existantes de hub.users vers magapp.users
    try {
      await client.query(`
        INSERT INTO magapp.users (username, role, displayName, email, service_code, service_complement, last_activity, is_approved, created_at)
        SELECT username, role, displayName, email, service_code, service_complement, last_activity, is_approved, created_at
        FROM hub.users
        ON CONFLICT (username) DO NOTHING
      `);
      console.log('[PG DB] Copie hub.users → magapp.users effectuée');
    } catch (e) { console.error('[MIGRATION magapp.users]', e.message); }

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
    try {
      await client.query(`ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_consommables BOOLEAN DEFAULT true`);
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
    try {
      await client.query(`ALTER TABLE magapp.apps ADD COLUMN IF NOT EXISTS project_manager_username VARCHAR(255) DEFAULT ''`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE magapp.apps ADD COLUMN IF NOT EXISTS project_manager_name VARCHAR(255) DEFAULT ''`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE magapp.apps ADD COLUMN IF NOT EXISTS dsi_only BOOLEAN DEFAULT FALSE`);
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
      INSERT INTO magapp.settings (id, show_tickets, show_subscriptions, show_health_check, show_create_buttons, show_ideas, show_rencontres, show_consommables)
      VALUES (1, true, true, true, true, true, true, true)
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magapp.maintenances (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES magapp.apps(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        severity VARCHAR(10) NOT NULL DEFAULT 'mineure',
        has_interruption BOOLEAN DEFAULT false,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      -- Convert existing dates from local time (Europe/Paris) to UTC if they look like local time
      UPDATE magapp.maintenances
        SET start_date = start_date AT TIME ZONE 'Europe/Paris' AT TIME ZONE 'UTC',
            end_date = end_date AT TIME ZONE 'Europe/Paris' AT TIME ZONE 'UTC'
        WHERE EXTRACT(HOUR FROM start_date) >= 12;

      CREATE TABLE IF NOT EXISTS magapp.maintenance_attachments (
        id SERIAL PRIMARY KEY,
        maintenance_id INTEGER NOT NULL REFERENCES magapp.maintenances(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.revues (
        id SERIAL PRIMARY KEY,
        titre TEXT NOT NULL,
        date_revue TIMESTAMP,
        lieu TEXT,
        statut TEXT DEFAULT 'planifiée',
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.revue_projets (
        id SERIAL PRIMARY KEY,
        revue_id INTEGER NOT NULL REFERENCES hub_rencontres.revues(id) ON DELETE CASCADE,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        commentaire TEXT,
        previous_revue_id INTEGER REFERENCES hub_rencontres.revues(id) ON DELETE SET NULL,
        UNIQUE(revue_id, projet_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.revue_participants (
        id SERIAL PRIMARY KEY,
        revue_id INTEGER NOT NULL REFERENCES hub_rencontres.revues(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        display_name TEXT,
        statut_presence TEXT DEFAULT 'present',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_rencontres.revue_taches (
        id SERIAL PRIMARY KEY,
        revue_id INTEGER NOT NULL REFERENCES hub_rencontres.revues(id) ON DELETE CASCADE,
        revue_projet_id INTEGER NOT NULL REFERENCES hub_rencontres.revue_projets(id) ON DELETE CASCADE,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        titre TEXT NOT NULL,
        statut TEXT DEFAULT 'a_faire',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try { await client.query(`ALTER TABLE hub_rencontres.revue_taches ADD COLUMN IF NOT EXISTS responsable TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_rencontres.revue_taches ADD COLUMN IF NOT EXISTS echeance DATE`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_rencontres.revue_taches ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '[]'`); } catch (e) {}

    await client.query(`CREATE INDEX IF NOT EXISTS idx_revues_date ON hub_rencontres.revues(date_revue);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_revue_projets_revue ON hub_rencontres.revue_projets(revue_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_revue_projets_projet ON hub_rencontres.revue_projets(projet_id);`);

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
    // Migration: groupe_id dans projet_jalons
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projet_jalons' AND column_name='groupe_id') THEN ALTER TABLE projets.projet_jalons ADD COLUMN groupe_id INTEGER REFERENCES projets.projet_groupes_taches(id) ON DELETE SET NULL; END IF; END $$;`); } catch (e) {}

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.projet_taches_standalone (
        id SERIAL PRIMARY KEY,
        projet_id INTEGER NOT NULL REFERENCES projets.projets(id) ON DELETE CASCADE,
        tache TEXT NOT NULL,
        responsable TEXT,
        echeance DATE,
        statut TEXT DEFAULT 'a_faire',
        notes TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add notes column if missing (migration)
    try {
      await client.query(`ALTER TABLE projets.projet_taches_standalone ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '[]'`);
    } catch (e) {}

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

    // oracle_links - links between oracle data and operations
    await client.query(`
      CREATE TABLE IF NOT EXISTS oracle.oracle_links (
        id SERIAL PRIMARY KEY,
        target_table TEXT NOT NULL,
        target_id TEXT NOT NULL,
        operation_id INTEGER,
        UNIQUE(target_table, target_id)
      )
    `);

    // operations - budget operations (mirror SQLite columns)
    await client.query(`
      CREATE TABLE IF NOT EXISTS oracle.operations (
        id SERIAL PRIMARY KEY,
        budget_id INTEGER,
        "Service" TEXT,
        "Service Complément" TEXT,
        "LIBELLE" TEXT,
        "MCO" TEXT,
        "C. Fonc." TEXT,
        "C. Nature" TEXT,
        "Montant prévu" NUMERIC DEFAULT 0,
        "Terminé" TEXT,
        "Commentaire" TEXT,
        used_amount NUMERIC DEFAULT 0,
        "Section" TEXT,
        exercice TEXT,
        CODE_FONCTION TEXT,
        montant_prevu NUMERIC DEFAULT 0
      )
    `);

    // Migrate data from SQLite
    try {
      const sqlite = require('../shared/database').getSqlite();
      if (sqlite) {
        // oracle_links: try from main db, then from gf attached db
        try {
          const links = await sqlite.all("SELECT target_table, target_id, operation_id FROM oracle_links").catch(() => sqlite.all("SELECT target_table, target_id, operation_id FROM gf.oracle_links"));
          if (links && links.length > 0) {
            let migrated = 0;
            for (const l of links) {
              await client.query(
                `INSERT INTO oracle.oracle_links (target_table, target_id, operation_id) VALUES ($1, $2, $3) ON CONFLICT (target_table, target_id) DO UPDATE SET operation_id = EXCLUDED.operation_id`,
                [l.target_table, String(l.target_id).trim(), l.operation_id]
              );
              migrated++;
            }
            console.log(`[PG DB] Migrated ${migrated} oracle_links → oracle.oracle_links`);
          }
        } catch (e) {
          console.log('[PG DB] oracle_links migration skipped:', e.message);
        }

        try {
          const existing = await client.query('SELECT COUNT(*) as cnt FROM oracle.operations');
          if (parseInt(existing.rows[0].cnt) === 0) {
            const ops = await sqlite.all("SELECT * FROM operations");
            if (ops && ops.length > 0) {
              // Deduplicate by business key (LIBELLE, Section, exercice)
              const seen = new Map();
              for (const o of ops) {
                const key = ((o.LIBELLE || '').trim().toLowerCase() + '|' + (o.Section || '') + '|' + (o.exercice || ''));
                if (!seen.has(key)) {
                  seen.set(key, o);
                } else {
                  console.log(`[PG DB] Skipping duplicate operation in SQLite: "${o.LIBELLE}"`);
                }
              }
              const uniqueOps = Array.from(seen.values());
              let migrated = 0;
              for (const o of uniqueOps) {
                const allCols = Object.keys(o).filter(k => k !== 'id');
                const cols = [];
                const vals = [];
                for (const k of allCols) {
                  if (o[k] !== undefined && o[k] !== null) {
                    cols.push(`"${k}"`);
                    vals.push(o[k]);
                  }
                }
                const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
                try {
                  await client.query(
                    `INSERT INTO oracle.operations (${cols.join(',')}) VALUES (${placeholders})`,
                    vals
                  );
                  migrated++;
                } catch (insertErr) {
                  console.log(`[PG DB] operations migration row skipped: ${insertErr.message}`);
                }
              }
              console.log(`[PG DB] Migrated ${migrated} operations → oracle.operations`);
            }
          } else {
            console.log(`[PG DB] oracle.operations already has ${existing.rows[0].cnt} rows, skipping import`);
          }
    } catch (e) {
      console.log('[PG DB] operations migration skipped:', e.message);
    }
      }
    } catch (e) {
      console.log('[PG DB] SQLite data migration skipped:', e.message);
    }

    // hub_contrats tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_contrats.contrats (
        id SERIAL PRIMARY KEY,
        svc VARCHAR(255) DEFAULT '',
        objet VARCHAR(255) DEFAULT '',
        budget VARCHAR(255) DEFAULT '',
        raison_sociale VARCHAR(255) DEFAULT '',
        tiers VARCHAR(255) DEFAULT '',
        app_id INTEGER,
        type_contrat VARCHAR(255) DEFAULT '',
        annee_initiale INTEGER,
        direction VARCHAR(255) DEFAULT '',
        service VARCHAR(255) DEFAULT '',
        perimetre VARCHAR(255) DEFAULT '',
        nature VARCHAR(255) DEFAULT '',
        fonction VARCHAR(255) DEFAULT '',
        date_debut DATE,
        duree_annees NUMERIC,
        nb_reconductions INTEGER,
        date_fin DATE,
        marche_contrat VARCHAR(255) DEFAULT '',
        piece VARCHAR(255) DEFAULT '',
        date_reconduction VARCHAR(255) DEFAULT '',
        reconduction VARCHAR(255) DEFAULT '',
        montant_2022 NUMERIC,
        montant_2023 NUMERIC,
        montant_2024 NUMERIC,
        montant_2025 NUMERIC,
        montant_2026 NUMERIC,
        prevision_2026 NUMERIC,
        prevision_2027 NUMERIC,
        prevision_2028 NUMERIC,
        commentaires TEXT DEFAULT '',
        gti VARCHAR(255) DEFAULT '',
        gtr VARCHAR(255) DEFAULT '',
        penalite VARCHAR(255) DEFAULT '',
        indice_revision VARCHAR(255) DEFAULT '',
        numero_facture VARCHAR(255) DEFAULT '',
        statut VARCHAR(50) DEFAULT 'actif',
        renouvellement_statut VARCHAR(50),
        renouvellement_commentaire TEXT DEFAULT '',
        doc_principal_path VARCHAR(1024) DEFAULT '',
        doc_principal_nom VARCHAR(255) DEFAULT '',
        contrat_renouvellement_id INTEGER,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_contrats.contrat_documents (
        id SERIAL PRIMARY KEY,
        contrat_id INTEGER NOT NULL REFERENCES hub_contrats.contrats(id) ON DELETE CASCADE,
        file_path VARCHAR(1024),
        file_name VARCHAR(255),
        nature VARCHAR(255),
        est_principal INTEGER DEFAULT 0,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add missing columns to existing contrats table
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='hub_contrats' AND table_name='contrats' AND column_name='tiers') THEN
            ALTER TABLE hub_contrats.contrats ADD COLUMN tiers VARCHAR(255) DEFAULT '';
          END IF;
        END $$;
      `);
    } catch (e) {
      console.log('[PG DB] Migration tiers column:', e.message);
    }

    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='hub_contrats' AND table_name='contrats' AND column_name='app_id') THEN
            ALTER TABLE hub_contrats.contrats ADD COLUMN app_id INTEGER;
          END IF;
        END $$;
      `);
    } catch (e) {
      console.log('[PG DB] Migration app_id column:', e.message);
    }

    // Create gf_oracle_tiers table for tier lookups
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gf_oracle_tiers (
          id SERIAL PRIMARY KEY,
          code VARCHAR(255) UNIQUE,
          nom VARCHAR(255),
          activite VARCHAR(255),
          siret VARCHAR(255),
          adresse VARCHAR(255),
          banque VARCHAR(255),
          guichet VARCHAR(255),
          compte VARCHAR(255),
          cle_rib VARCHAR(255),
          is_dsi INTEGER DEFAULT 0
        );
      `);
      console.log('[PG DB] gf_oracle_tiers table created or already exists');
    } catch (e) {
      console.log('[PG DB] Error creating gf_oracle_tiers:', e.message);
    }

    // Create indices for better performance
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_hub_contrats_statut ON hub_contrats.contrats(statut)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_hub_contrats_direction ON hub_contrats.contrats(direction)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_hub_contrats_date_fin ON hub_contrats.contrats(date_fin)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_hub_contrat_documents_contrat_id ON hub_contrats.contrat_documents(contrat_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_gf_oracle_tiers_code ON gf_oracle_tiers(code)');
    } catch (e) {}

    await client.query('CREATE SCHEMA IF NOT EXISTS finance;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS finance.field_mapping_rubriques (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        pg_schema TEXT NOT NULL DEFAULT 'public',
        pg_table TEXT NOT NULL,
        fiscal_year_column TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await client.query(`ALTER TABLE finance.field_mapping_rubriques ADD COLUMN IF NOT EXISTS fiscal_year_column TEXT`);
    } catch (e) {}

    try {
      await client.query(`ALTER TABLE finance.field_mapping_rubriques ADD COLUMN IF NOT EXISTS link_target TEXT`);
      await client.query(`ALTER TABLE finance.field_mapping_rubriques ADD COLUMN IF NOT EXISTS link_id_column TEXT`);
      await client.query(`ALTER TABLE finance.field_mapping_rubriques ADD COLUMN IF NOT EXISTS sedit_id_column TEXT`);
    } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS finance.field_mapping_variables (
        id SERIAL PRIMARY KEY,
        rubrique_id INTEGER NOT NULL REFERENCES finance.field_mapping_rubriques(id) ON DELETE CASCADE,
        variable_name TEXT NOT NULL,
        expression_type TEXT NOT NULL DEFAULT 'field',
        expression TEXT NOT NULL,
        display_type TEXT NOT NULL DEFAULT 'text',
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await client.query(`ALTER TABLE finance.field_mapping_variables ADD COLUMN IF NOT EXISTS display_type TEXT NOT NULL DEFAULT 'text'`);
    } catch (e) {}

    // Create hub_copieurs schema and table
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_copieurs;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.copieurs (
        id SERIAL PRIMARY KEY,
        direction TEXT DEFAULT '',
        service TEXT DEFAULT '',
        secteur TEXT DEFAULT '',
        adresse TEXT DEFAULT '',
        numero_serie TEXT DEFAULT '',
        modele TEXT DEFAULT '',
        modele_papercut TEXT DEFAULT '',
        couleur TEXT DEFAULT '',
        date_acquisition DATE,
        nom_reseau TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        present TEXT DEFAULT '',
        nb_pages INTEGER,
        mainteneur TEXT DEFAULT '',
        divers TEXT DEFAULT '',
        source TEXT DEFAULT 'ville',
        archive BOOLEAN DEFAULT FALSE,
        latitude NUMERIC,
        longitude NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieurs_archive ON hub_copieurs.copieurs(archive)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieurs_direction ON hub_copieurs.copieurs(direction)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieurs_numero_serie ON hub_copieurs.copieurs(numero_serie)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieurs_coords ON hub_copieurs.copieurs(latitude, longitude)');
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS ping_status TEXT DEFAULT 'inconnu'`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS last_seen_active TIMESTAMP`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS papercut_matched BOOLEAN DEFAULT FALSE`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS papercut_last_import TIMESTAMP`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS kpax_status TEXT DEFAULT 'non'`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS kpax_last_collecte TIMESTAMP`); } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.copieur_moves (
        id SERIAL PRIMARY KEY,
        copieur_id INTEGER NOT NULL REFERENCES hub_copieurs.copieurs(id) ON DELETE CASCADE,
        moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        moved_by TEXT,
        old_source TEXT,
        new_source TEXT,
        old_direction TEXT,
        new_direction TEXT,
        old_service TEXT,
        new_service TEXT,
        old_adresse TEXT,
        new_adresse TEXT,
        old_ip TEXT,
        new_ip TEXT
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieur_moves_copieur ON hub_copieurs.copieur_moves(copieur_id)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.copieur_interventions (
        id SERIAL PRIMARY KEY,
        copieur_id INTEGER NOT NULL REFERENCES hub_copieurs.copieurs(id) ON DELETE CASCADE,
        date_intervention DATE NOT NULL,
        mainteneur TEXT DEFAULT '',
        technicien TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieur_interventions_copieur ON hub_copieurs.copieur_interventions(copieur_id)');
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_interventions ADD COLUMN IF NOT EXISTS email_message_id TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_interventions ADD COLUMN IF NOT EXISTS email_subject TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_interventions ADD COLUMN IF NOT EXISTS email_received_at TIMESTAMP`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_interventions ADD COLUMN IF NOT EXISTS email_from TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_interventions ADD COLUMN IF NOT EXISTS email_demandeur TEXT`); } catch (e) {}
    try { await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_copieur_interventions_msgid ON hub_copieurs.copieur_interventions(email_message_id)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_interventions ALTER COLUMN copieur_id DROP NOT NULL`); } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.copieur_visites (
        id SERIAL PRIMARY KEY,
        copieur_id INTEGER NOT NULL REFERENCES hub_copieurs.copieurs(id) ON DELETE CASCADE,
        date_visite DATE NOT NULL,
        annotation TEXT DEFAULT '',
        photos TEXT DEFAULT '[]',
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieur_visites_copieur ON hub_copieurs.copieur_visites(copieur_id)');

    // Create hub_consommables schema and tables
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_consommables;');

    // Drop old tables if they have wrong schema
    try {
      const checkRequest = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'consumable_requests' AND table_schema = 'hub_consommables' AND column_name = 'type_consommable'
      `);
      if (checkRequest.rows.length > 0) {
        console.log('[PG DB] Dropping old consumable_requests table with wrong schema...');
        await client.query('DROP TABLE IF EXISTS hub_consommables.request_articles CASCADE');
        await client.query('DROP TABLE IF EXISTS hub_consommables.consumable_requests CASCADE');
      }
    } catch (e) {
      // Table doesn't exist yet, that's fine
    }

    // Types de consommables
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_consommables.consumable_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Articles disponibles (catalogue)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_consommables.consumable_catalog (
        id SERIAL PRIMARY KEY,
        type_id INTEGER NOT NULL REFERENCES hub_consommables.consumable_types(id) ON DELETE CASCADE,
        designation TEXT,
        article TEXT NOT NULL,
        code_fabricant TEXT,
        ref_commande TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Demandes de consommables
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_consommables.consumable_requests (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        date_commande DATE NOT NULL,
        direction TEXT NOT NULL,
        service TEXT NOT NULL,
        nom_referent TEXT NOT NULL,
        tel_complet TEXT NOT NULL,
        type_id INTEGER NOT NULL REFERENCES hub_consommables.consumable_types(id),
        status TEXT DEFAULT 'pending',
        order_number TEXT,
        tier TEXT DEFAULT 'UGAP',
        total_amount_ttc NUMERIC,
        is_school BOOLEAN DEFAULT FALSE,
        user_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Articles dans une demande
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_consommables.request_articles (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES hub_consommables.consumable_requests(id) ON DELETE CASCADE,
        catalog_id INTEGER NOT NULL REFERENCES hub_consommables.consumable_catalog(id),
        quantite INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Images des désignations
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_consommables.designation_images (
        id SERIAL PRIMARY KEY,
        designation TEXT NOT NULL UNIQUE,
        image_path TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: ajouter colonne email si absente
    try {
      const checkEmail = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'consumable_requests' AND table_schema = 'hub_consommables'
        AND column_name = 'email'
      `);
      if (checkEmail.rows.length === 0) {
        await client.query('ALTER TABLE hub_consommables.consumable_requests ADD COLUMN email TEXT DEFAULT \'\'');
        console.log('[PG DB] Added email column to consumable_requests');
      }
    } catch (e) {
      console.log('[PG DB] Migration email column skipped:', e.message);
    }

    // Migration: ajouter colonne archived si absente
    try {
      const checkArchived = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'consumable_requests' AND table_schema = 'hub_consommables'
        AND column_name = 'archived'
      `);
      if (checkArchived.rows.length === 0) {
        await client.query('ALTER TABLE hub_consommables.consumable_requests ADD COLUMN archived BOOLEAN DEFAULT FALSE');
        console.log('[PG DB] Added archived column to consumable_requests');
      }
    } catch (e) {
      console.log('[PG DB] Migration archived column skipped:', e.message);
    }

    // Migration: ajouter colonnes de commande si absentes
    try {
      await client.query(`
        ALTER TABLE hub_consommables.consumable_requests 
        ADD COLUMN IF NOT EXISTS order_number TEXT,
        ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'UGAP',
        ADD COLUMN IF NOT EXISTS total_amount_ttc NUMERIC;
      `);
    } catch (e) {
      console.log('[PG DB] Migration order columns skipped:', e.message);
    }

    // Indices
    await client.query('CREATE INDEX IF NOT EXISTS idx_consumable_requests_user ON hub_consommables.consumable_requests(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_consumable_requests_status ON hub_consommables.consumable_requests(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_consumable_requests_type ON hub_consommables.consumable_requests(type_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_consumable_catalog_type ON hub_consommables.consumable_catalog(type_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_request_articles_request ON hub_consommables.request_articles(request_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_request_articles_catalog ON hub_consommables.request_articles(catalog_id)');

    // Create hub_calendrier schema and table
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_calendrier;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_calendrier.evenements (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        categorie TEXT NOT NULL,
        periode TEXT DEFAULT '',
        titre TEXT NOT NULL,
        description TEXT DEFAULT '',
        agent_username TEXT,
        agent_nom TEXT,
        agent_email TEXT,
        couleur TEXT DEFAULT '',
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Agents DSI table
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_calendrier.agents_dsi (
        username TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        email TEXT DEFAULT '',
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // TT fixed days (multiple per agent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_calendrier.agents_tt_days (
        id SERIAL PRIMARY KEY,
        agent_username TEXT NOT NULL REFERENCES hub_calendrier.agents_dsi(username) ON DELETE CASCADE,
        jour_semaine INTEGER NOT NULL CHECK (jour_semaine >= 0 AND jour_semaine <= 6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_username, jour_semaine)
      );
    `);

    // Remove old single-column tt_fixed_day if it exists
    try {
      await client.query(`ALTER TABLE hub_calendrier.agents_dsi DROP COLUMN IF EXISTS tt_fixed_day`);
    } catch (e) {}
    // Add service column
    try {
      await client.query(`ALTER TABLE hub_calendrier.agents_dsi ADD COLUMN IF NOT EXISTS service TEXT DEFAULT ''`);
    } catch (e) {}
    // Add periode column to evenements
    try {
      await client.query(`ALTER TABLE hub_calendrier.evenements ADD COLUMN IF NOT EXISTS periode TEXT DEFAULT ''`);
    } catch (e) {}

    // Permanent absences (part-time)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_calendrier.absences_permanentes (
        id SERIAL PRIMARY KEY,
        agent_username TEXT NOT NULL REFERENCES hub_calendrier.agents_dsi(username) ON DELETE CASCADE,
        jour_semaine INTEGER NOT NULL CHECK (jour_semaine >= 0 AND jour_semaine <= 6),
        periode TEXT NOT NULL DEFAULT 'journee' CHECK (periode IN ('journee', 'matin', 'apres-midi')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add matricule column to agents_dsi
    try {
      await client.query(`ALTER TABLE hub_calendrier.agents_dsi ADD COLUMN IF NOT EXISTS matricule TEXT DEFAULT ''`);
    } catch (e) {}

    // Demabs table - synced from Oracle rh_tps_demabs
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_calendrier.demabs (
        id SERIAL PRIMARY KEY,
        matricule TEXT NOT NULL,
        nom TEXT DEFAULT '',
        prenom TEXT DEFAULT '',
        date_debut DATE,
        date_fin DATE,
        type_absence TEXT DEFAULT '',
        motif TEXT DEFAULT '',
        periode_debut TEXT DEFAULT '',
        periode_fin TEXT DEFAULT '',
        statut TEXT DEFAULT '',
        commentaire TEXT DEFAULT '',
        raw_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_demabs_matricule ON hub_calendrier.demabs (matricule)`);
    } catch (e) {}
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_demabs_date_debut ON hub_calendrier.demabs (date_debut)`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE hub_calendrier.demabs ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT ''`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE hub_calendrier.demabs ADD COLUMN IF NOT EXISTS prenom TEXT DEFAULT ''`);
    } catch (e) {}

    // Email automation tables
    await client.query(`CREATE TABLE IF NOT EXISTS hub.email_automations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        frequency TEXT NOT NULL DEFAULT 'daily:08:00',
        enabled INTEGER DEFAULT 1,
        content_type TEXT DEFAULT 'calendar_daily',
        content_url TEXT DEFAULT '',
        subject_template TEXT DEFAULT '',
        condition_type TEXT DEFAULT 'none',
        condition_value TEXT DEFAULT '',
        last_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS hub.email_automation_recipients (
        id SERIAL PRIMARY KEY,
        automation_id INTEGER NOT NULL REFERENCES hub.email_automations(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT DEFAULT '',
        source TEXT DEFAULT 'manual'
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS hub.email_automation_logs (
        id SERIAL PRIMARY KEY,
        automation_id INTEGER NOT NULL REFERENCES hub.email_automations(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL,
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // O365 calendar subscriptions
    await client.query(`CREATE TABLE IF NOT EXISTS hub_calendrier.o365_calendars (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        calendar_id TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        default_categorie TEXT DEFAULT 'reunion',
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS hub_calendrier.o365_events (
        id SERIAL PRIMARY KEY,
        calendar_id INTEGER NOT NULL REFERENCES hub_calendrier.o365_calendars(id) ON DELETE CASCADE,
        o365_id TEXT NOT NULL,
        subject TEXT DEFAULT '',
        body_preview TEXT DEFAULT '',
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        is_all_day INTEGER DEFAULT 0,
        location TEXT DEFAULT '',
        organizer TEXT DEFAULT '',
        categorie TEXT DEFAULT 'reunion',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(calendar_id, o365_id)
    )`);
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_o365_events_calendar_date ON hub_calendrier.o365_events (calendar_id, start_date)`);
    } catch (e) {}
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_o365_calendars_enabled ON hub_calendrier.o365_calendars (enabled)`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE hub_calendrier.o365_calendars ADD COLUMN IF NOT EXISTS default_categorie TEXT DEFAULT 'reunion'`);
    } catch (e) {}

    // Hotline tables
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS hub_calendrier.agents_hotline_defaults (
        id SERIAL PRIMARY KEY,
        agent_username VARCHAR(255) NOT NULL REFERENCES hub_calendrier.agents_dsi(username) ON DELETE CASCADE,
        jour_semaine INTEGER NOT NULL CHECK (jour_semaine >= 1 AND jour_semaine <= 5),
        semaine_type VARCHAR(10) NOT NULL DEFAULT 'les2' CHECK (semaine_type IN ('paire','impaire','les2')),
        periode VARCHAR(10) NOT NULL DEFAULT 'journee' CHECK (periode IN ('matin','apres-midi','journee'))
      )`);
    } catch (e) {}
    try {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hotline_defaults_unique ON hub_calendrier.agents_hotline_defaults (agent_username, jour_semaine, semaine_type, periode)`);
    } catch (e) {}
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS hub_calendrier.hotline_overrides (
        id SERIAL PRIMARY KEY,
        agent_username VARCHAR(255) NOT NULL REFERENCES hub_calendrier.agents_dsi(username) ON DELETE CASCADE,
        date DATE NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true
      )`);
    } catch (e) {}
    try {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hotline_overrides_unique ON hub_calendrier.hotline_overrides (agent_username, date)`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE hub_calendrier.hotline_overrides ADD COLUMN IF NOT EXISTS periode VARCHAR(20) NOT NULL DEFAULT ''`);
    } catch (e) {}
    try {
      // Drop old index without periode
      try {
        await client.query(`DROP INDEX IF EXISTS hub_calendrier.idx_hotline_overrides_unique CASCADE`);
      } catch (e) {
        // Index may not exist, that's ok
      }

      // Clean up duplicate hotline_overrides (keep latest id for each agent/date/periode combo)
      try {
        await client.query(`
          DELETE FROM hub_calendrier.hotline_overrides h1
          WHERE id NOT IN (
            SELECT MAX(id) FROM hub_calendrier.hotline_overrides h2
            WHERE h2.agent_username = h1.agent_username
            AND h2.date = h1.date
            AND h2.periode = h1.periode
            GROUP BY h2.agent_username, h2.date, h2.periode
          )
        `);
      } catch (e) {
        // Table might not have duplicates, that's ok
      }

      // Create unique index on (agent_username, date, periode)
      try {
        await client.query(`CREATE UNIQUE INDEX idx_hotline_overrides_unique ON hub_calendrier.hotline_overrides (agent_username, date, periode)`);
        console.log('[PG DB] Created idx_hotline_overrides_unique with periode');
      } catch (e) {
        if (!e.message?.includes('already exists')) {
          console.log('[PG DB] Index note:', e.message);
        }
      }
    } catch (e) {
      console.log('[PG DB] Error managing hotline index:', e.message);
    }

    // Vacances et jours fériés
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS hub_calendrier.vacances (
        id SERIAL PRIMARY KEY,
        date_debut DATE NOT NULL,
        date_fin DATE NOT NULL,
        label VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'ferie' CHECK (type IN ('ferie', 'vacances')),
        created_by VARCHAR(255) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (e) {}
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_vacances_dates ON hub_calendrier.vacances (date_debut, date_fin)`);
    } catch (e) {}

    // Set default fiscal_year_column for known rubriques
    try {
      await client.query(`UPDATE finance.field_mapping_rubriques SET fiscal_year_column = 'COMMANDE_CMD_DATECOMMANDE' WHERE name = 'Commandes' AND (fiscal_year_column IS NULL OR fiscal_year_column = '')`);
    } catch (e) {}
    try {
      await client.query(`UPDATE finance.field_mapping_rubriques SET fiscal_year_column = 'FACTURE_DATENTREE' WHERE name = 'Factures' AND (fiscal_year_column IS NULL OR fiscal_year_column = '')`);
    } catch (e) {}

    // Add created_by_email column to backlog if missing
    try {
      await client.query(`
        ALTER TABLE hub.backlog ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(255)
      `);
    } catch (e) {}

    // Tiles and tile_links for dashboard
    await client.query(`
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

    await client.query(`
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

    // Doctrines table for Notes de service et doctrines
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.doctrines (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100),
        doctrine_date DATE NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctrines_category ON hub.doctrines(category)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctrines_date ON hub.doctrines(doctrine_date DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.changelog_versions (
        id SERIAL PRIMARY KEY,
        version VARCHAR(20) NOT NULL,
        release_date VARCHAR(20),
        changes JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed changelog from JSON file if table is empty
    try {
      const clCount = await client.query('SELECT COUNT(*) FROM hub.changelog_versions');
      if (parseInt(clCount.rows[0].count) === 0) {
        const clPath = require('path').join(__dirname, '..', 'data', 'changelog.json');
        const fsSync = require('fs');
        if (fsSync.existsSync(clPath)) {
          const cl = JSON.parse(fsSync.readFileSync(clPath, 'utf8'));
          const history = (cl.history || []).slice().reverse();
          for (const v of history) {
            await client.query(
              'INSERT INTO hub.changelog_versions (version, release_date, changes) VALUES ($1, $2, $3)',
              [v.version, v.date || null, JSON.stringify(v.changes || [])]
            );
          }
          console.log(`[PG DB] Seeded ${history.length} changelog versions from JSON`);
        }
      }
    } catch (e) {
      console.log('[PG DB] Changelog seed skipped:', e.message);
    }

    // Table de tâches personnelles (Mes Tâches)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.user_tasks (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        description TEXT NOT NULL,
        echeance DATE,
        statut TEXT DEFAULT 'a_faire',
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tasks_username ON hub.user_tasks(username)`);

    // ─── Champs unifiés pour tâches d'équipe et contexte multi-modules ──────
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS is_team_task BOOLEAN DEFAULT FALSE`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS team_group_id UUID`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS created_by TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS context_source TEXT DEFAULT 'personal'`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS context_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS context_title TEXT`); } catch (e) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tasks_context ON hub.user_tasks(context_source, context_id)`); } catch (e) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tasks_team ON hub.user_tasks(team_group_id) WHERE team_group_id IS NOT NULL`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS todo_task_id TEXT`); } catch (e) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tasks_todo ON hub.user_tasks(todo_task_id) WHERE todo_task_id IS NOT NULL`); } catch (e) {}
    try { await client.query(`
        CREATE TABLE IF NOT EXISTS hub.todo_reunion_task_map (
            reunion_id  INTEGER NOT NULL,
            task_idx    INTEGER NOT NULL,
            username    TEXT    NOT NULL,
            todo_task_id TEXT   NOT NULL,
            PRIMARY KEY (reunion_id, task_idx, username)
        )
    `); } catch (e) {}

    // responsable_username sur les tâches standalone projet (pour matching fiable par username)
    try { await client.query(`ALTER TABLE projets.projet_taches_standalone ADD COLUMN IF NOT EXISTS responsable_username TEXT DEFAULT ''`); } catch (e) {}

    // Table de préférences utilisateur (indépendante de hub.users — pas de FK, survit aux DROP CASCADE)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.user_prefs (
        username TEXT PRIMARY KEY,
        task_alert_email BOOLEAN DEFAULT FALSE,
        ms_todo_sync BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Préférence d'alerte mail quotidienne (Mes Tâches) — colonne legacy dans hub.users, conservée pour compatibilité
    try { await client.query(`ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS task_alert_email BOOLEAN DEFAULT FALSE`); } catch (e) {}

    // Journal global de tous les emails envoyés par l'application
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.email_logs (
        id SERIAL PRIMARY KEY,
        recipient TEXT NOT NULL,
        subject TEXT,
        status TEXT DEFAULT 'sent',
        error_message TEXT,
        source TEXT DEFAULT 'system',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON hub.email_logs(sent_at DESC)`); } catch (e) {}

    // Table de notes génériques pour toutes les tâches (Mes Tâches)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.task_notes (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        task_id TEXT NOT NULL,
        content TEXT,
        type TEXT DEFAULT 'comment',
        filename TEXT,
        filepath TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_task_notes_src ON hub.task_notes(source, task_id)`); } catch (e) {}

    // Préférence sync Microsoft Todo — colonne legacy dans hub.users, conservée pour compatibilité
    try { await client.query(`ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS ms_todo_sync BOOLEAN DEFAULT FALSE`); } catch (e) {}

    // ─── Migration GLPI → hub_tickets + seed ─────────────────────
    try {
        await client.query(`
            INSERT INTO hub_tickets.tickets (glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22)
            SELECT glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, 'hub', entity, requester_name, email_alt, requester_email_22 FROM glpi.tickets
            ON CONFLICT (glpi_id) DO NOTHING
        `);
        await client.query(`UPDATE hub_tickets.tickets SET source = 'hub' WHERE source IS NULL OR source = 'glpi'`);
        await client.query(`
            INSERT INTO hub_tickets.ticket_status (id, label) SELECT id, label FROM glpi.ticket_status
            ON CONFLICT (id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO hub_tickets.ticket_status (id, label) VALUES
            (4, 'En attente utilisateur'), (5, 'En attente fournisseur'), (8, 'Rejeté')
            ON CONFLICT (id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO hub_tickets.observers (ticket_id, user_id, name, login, email)
            SELECT ticket_id, user_id, name, login, email FROM glpi.observers
            ON CONFLICT (ticket_id, user_id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO hub_tickets.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation)
            SELECT ticket_id, content, content_hash, author_name, author_email, is_private, date_creation FROM glpi.ticket_followups
            ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING
        `);
        console.log('[PG DB] hub_tickets migration from glpi completed');
    } catch (e) {
        console.log('[PG DB] hub_tickets migration skip:', e.message);
    }

    try {
        // Seed sequence
        await client.query(`INSERT INTO hub_tickets.ticket_sequence (last_id) SELECT COALESCE(MAX(glpi_id), 10000000) FROM hub_tickets.tickets`);

        // Seed notification templates
        await client.query(`
            INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html) VALUES
            ('ticket_created', 'Création de ticket', '{{app_name}} - Ticket #{{ticket_id}} créé : {{ticket_title}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Un nouveau ticket a été créé.</p><table><tr><td>Priorité :</td><td>{{priority_label}}</td></tr><tr><td>Type :</td><td>{{type_label}}</td></tr></table><p><a href="{{app_url}}/tickets/{{ticket_id}}">Voir le ticket</a></p>'),
            ('ticket_assigned', 'Assignation de ticket', '{{app_name}} - Ticket #{{ticket_id}} vous a été assigné', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{assignee_name}},</p><p>Le ticket <strong>#{{ticket_id}}</strong> vous a été assigné.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}">Voir le ticket</a></p>')
            ON CONFLICT (slug) DO NOTHING
        `);

        // Seed triggers
        await client.query(`
            INSERT INTO hub_tickets.notification_triggers (event, template_slug, recipient_type) VALUES
            ('ticket.created', 'ticket_created', 'requester'),
            ('ticket.created', 'ticket_created', 'technician'),
            ('ticket.assigned', 'ticket_assigned', 'technician'),
            ('ticket.assigned', 'ticket_assigned', 'requester')
            ON CONFLICT (event, recipient_type) DO NOTHING
        `);

        // Seed calendar
        await client.query(`INSERT INTO hub_tickets.sla_calendars (id, name, description, timezone, is_default) VALUES (1, 'Calendrier standard', 'Lun-Ven 08-12 14-18', 'Europe/Paris', true) ON CONFLICT (id) DO NOTHING`);
        for (const day of [1, 2, 3, 4, 5]) {
            await client.query(`INSERT INTO hub_tickets.sla_calendar_hours (calendar_id, day_of_week, start_time, end_time) VALUES (1, $1, '08:00', '12:00'), (1, $1, '14:00', '18:00') ON CONFLICT DO NOTHING`, [day]);
        }

        // Seed SLA definitions
        await client.query(`
            INSERT INTO hub_tickets.sla_definitions (name, description, calendar_id, first_response_min, resolution_min, priority) VALUES
            ('SLA P1 - Très haute', 'Incident critique', 1, 15, 60, 1),
            ('SLA P2 - Haute', 'Incident majeur', 1, 30, 240, 2),
            ('SLA P3 - Normale', 'Incident standard', 1, 120, 1440, 3),
            ('SLA P4 - Basse', 'Demande simple', 1, 480, 4320, 4)
            ON CONFLICT (id) DO NOTHING
        `);

        console.log('[PG DB] hub_tickets seed data inserted');
    } catch (e) {
        console.log('[PG DB] hub_tickets seed skip:', e.message);
    }

    // Migration: is_mini_projet column
    try { await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='projets' AND table_name='projets' AND column_name='is_mini_projet') THEN ALTER TABLE projets.projets ADD COLUMN is_mini_projet BOOLEAN DEFAULT FALSE; END IF; END $$;`); } catch (e) {}

    // PMO agents assignments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projets.pmo_assignments (
        id SERIAL PRIMARY KEY,
        pmo_username TEXT NOT NULL,
        agent_username TEXT,
        service_code TEXT,
        secteur_code TEXT,
        direction_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_pmo_assign_pmo ON projets.pmo_assignments(pmo_username);`); } catch (e) {}

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
