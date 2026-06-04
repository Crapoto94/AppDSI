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
    if (val instanceof Date) {
        const pad = n => String(n).padStart(2, '0');
        return `'${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}'`;
    }
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

    // ─── Ensure unaccent extension for accent-insensitive search ──
    try { await client.query('CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public'); } catch (e) { console.log('[SETUP] unaccent extension not available, accent-insensitive search disabled'); }

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
        date_creation TIMESTAMP,
        date_mod TIMESTAMP,
        date_closed TIMESTAMP,
        date_solved TIMESTAMP,
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
    // Ensure glpi_id has a UNIQUE constraint (FK requirement for ticket_assignments),
    // mais de façon IDEMPOTENTE : l'ancien `ADD UNIQUE (glpi_id)` recréait un index à chaque
    // démarrage (→ des centaines de doublons tickets_glpi_id_keyN, INSERT très lents).
    try {
        // 1. Auto-réparation : les centaines de doublons sur glpi_id sont des CONTRAINTES
        //    UNIQUE nommées tickets_glpi_id_keyN (chacune avec son index). On en garde une
        //    seule et on supprime les contraintes redondantes numérotées.
        const dupCons = await client.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'hub_tickets.tickets'::regclass AND contype = 'u'
              AND conname ~ '^tickets_glpi_id_key[0-9]+$'
        `);
        for (const r of dupCons.rows) {
            await client.query(`ALTER TABLE hub_tickets.tickets DROP CONSTRAINT IF EXISTS "${r.conname}"`);
        }
        // Index uniques redondants éventuels non rattachés à une contrainte
        const dupIdx = await client.query(`
            SELECT indexname FROM pg_indexes
            WHERE schemaname = 'hub_tickets' AND tablename = 'tickets'
              AND indexname ~ '^tickets_glpi_id_key[0-9]+$'
        `);
        for (const r of dupIdx.rows) {
            await client.query(`DROP INDEX IF EXISTS hub_tickets."${r.indexname}"`);
        }
        // 2. Garantir qu'il reste exactement une unicité sur glpi_id.
        const hasUnique = await client.query(`
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'hub_tickets.tickets'::regclass AND contype IN ('u','p')
              AND conkey = (
                SELECT array_agg(attnum) FROM pg_attribute
                WHERE attrelid = 'hub_tickets.tickets'::regclass AND attname = 'glpi_id'
              )
            LIMIT 1
        `);
        if (hasUnique.rowCount === 0) {
            await client.query('ALTER TABLE hub_tickets.tickets ADD UNIQUE (glpi_id)');
        }
    } catch (e) { console.error('[MIGRATIONS] glpi_id unique repair:', e.message); }
    // Index fonctionnels pour les requêtes courantes (KPI, filtres, stats)
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_status ON hub_tickets.tickets(status)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON hub_tickets.tickets(category_id)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_date_creation ON hub_tickets.tickets(date_creation)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_source ON hub_tickets.tickets(source)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_requester_email ON hub_tickets.tickets(requester_email_22)'); } catch (e) {}
    // Create sequence for atomic ID generation
    try { await client.query('CREATE SEQUENCE IF NOT EXISTS hub_tickets.ticket_id_seq'); } catch (e) {}
    try { await client.query(`SELECT setval('hub_tickets.ticket_id_seq', COALESCE((SELECT MAX(glpi_id) FROM hub_tickets.tickets), 10000000))`); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS total_waiting_seconds DOUBLE PRECISION DEFAULT 0'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS subcategory_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.ticket_categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50)'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.assignment_rules ALTER COLUMN assign_to_id DROP NOT NULL'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.assignment_rules ADD COLUMN IF NOT EXISTS assign_to_value VARCHAR(255)'); } catch (e) {}
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
    // Allow multiple assignments per ticket (group escalation : tech + groupe).
    // DROP CONSTRAINT ne suffit pas si l'objet est resté un INDEX unique → on drope les deux.
    try { await client.query('ALTER TABLE hub_tickets.ticket_assignments DROP CONSTRAINT IF EXISTS ticket_assignments_ticket_id_key'); } catch (e) {}
    try { await client.query('DROP INDEX IF EXISTS hub_tickets.ticket_assignments_ticket_id_key'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.ticket_assignments ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT true'); } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
        full_path TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        icon VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tc_parent ON hub_tickets.ticket_categories(parent_id)`);

    // Auto-réparation : restaurer la PK de ticket_categories si elle a été perdue
    // (sinon les FK et les requêtes par id échouent).
    try {
        await client.query('DELETE FROM hub_tickets.ticket_categories WHERE id IS NULL');
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'hub_tickets.ticket_categories'::regclass AND contype = 'p'
                ) THEN
                    ALTER TABLE hub_tickets.ticket_categories
                        ALTER COLUMN id SET NOT NULL,
                        ADD PRIMARY KEY (id);
                END IF;
            END $$;
        `);
        // Garantir la séquence + le DEFAULT nextval sur id (le SERIAL a pu perdre son
        // default après import GLPI avec ids explicites → INSERT id NULL).
        await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.ticket_categories_id_seq OWNED BY hub_tickets.ticket_categories.id`);
        await client.query(`ALTER TABLE hub_tickets.ticket_categories ALTER COLUMN id SET DEFAULT nextval('hub_tickets.ticket_categories_id_seq')`);
        await client.query(`SELECT setval('hub_tickets.ticket_categories_id_seq', COALESCE((SELECT MAX(id) FROM hub_tickets.ticket_categories), 0) + 1, false)`);
        // is_active a aussi pu perdre son DEFAULT → les nouvelles catégories naissaient
        // is_active = NULL et restaient invisibles (filtre WHERE is_active = true).
        await client.query(`ALTER TABLE hub_tickets.ticket_categories ALTER COLUMN is_active SET DEFAULT true`);
    } catch (e) { console.error('[MIGRATIONS] ticket_categories PK repair:', e.message); }

    // Transposition des anciennes catégories GLPI (texte) → nouvelles catégories structurées.
    // category_id sans FK dur (la PK de ticket_categories peut avoir été instable) ; intégrité gérée applicativement.
    try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS hub_tickets.category_mapping (
            id SERIAL PRIMARY KEY,
            old_category TEXT NOT NULL UNIQUE,
            category_id INTEGER,
            software_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`ALTER TABLE hub_tickets.category_mapping ADD COLUMN IF NOT EXISTS software_id INTEGER`);
    } catch (e) { console.error('[MIGRATIONS] category_mapping:', e.message); }

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
    // Lien optionnel d'une pièce jointe vers le commentaire/suivi qui la porte
    // (affichage de la PJ directement sous le message concerné).
    try { await client.query(`ALTER TABLE hub_tickets.ticket_attachments ADD COLUMN IF NOT EXISTS followup_id INTEGER`); } catch (e) {}
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ta_file_ticket ON hub_tickets.ticket_attachments(ticket_id)`);
    // Stockage partagé : flag "fichier perdu" (migration vers storage/<module>/<id>/<f>)
    try { await client.query(`ALTER TABLE hub_tickets.ticket_attachments ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`); } catch (e) {}

    // ─── Réparation idempotente : colonnes id sans séquence (tables migrées de GLPI
    //     où le SERIAL n'a jamais été appliqué → id NULL à chaque INSERT). On ne
    //     répare QUE si la colonne id n'a pas de default (sinon no-op au démarrage). ──
    const repairSerialId = async (table, orderCol) => {
        try {
            const def = await client.query(
                `SELECT column_default FROM information_schema.columns
                 WHERE table_schema='hub_tickets' AND table_name=$1 AND column_name='id'`, [table]);
            if (!def.rows.length || def.rows[0].column_default) return; // déjà OK (SERIAL/identity)
            const seq = `hub_tickets.${table}_id_seq`;
            await client.query(`CREATE SEQUENCE IF NOT EXISTS ${seq}`);
            await client.query(
                `WITH ordered AS (
                    SELECT ctid, row_number() OVER (ORDER BY ${orderCol} NULLS FIRST, ctid) AS rn
                    FROM hub_tickets.${table} WHERE id IS NULL
                 )
                 UPDATE hub_tickets.${table} t SET id = o.rn FROM ordered o WHERE t.ctid = o.ctid`);
            await client.query(`SELECT setval('${seq}', GREATEST((SELECT COALESCE(MAX(id),0) FROM hub_tickets.${table}),1))`);
            await client.query(`ALTER TABLE hub_tickets.${table} ALTER COLUMN id SET DEFAULT nextval('${seq}')`);
            await client.query(`ALTER SEQUENCE ${seq} OWNED BY hub_tickets.${table}.id`);
            await client.query(`ALTER TABLE hub_tickets.${table} ALTER COLUMN id SET NOT NULL`);
            try { await client.query(`ALTER TABLE hub_tickets.${table} ADD PRIMARY KEY (id)`); } catch (e) {}
            console.log(`[MIGRATION] Réparation séquence id sur hub_tickets.${table} effectuée`);
        } catch (e) { console.error(`[MIGRATION] repairSerialId ${table}:`, e.message); }
    };
    await repairSerialId('ticket_followups', 'date_creation');
    await repairSerialId('ticket_attachments', 'created_at');

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
    // ── Index critiques pour la performance de la liste tickets ────────────────
    // ticket_followups.ticket_id : AUCUN index → full scan 42MB × 25 lignes par page.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tf_ticket_id ON hub_tickets.ticket_followups(ticket_id)`);
    // observers.ticket_id : seule la clé composite (ticket_id, user_id) existait.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_obs_ticket_id ON hub_tickets.observers(ticket_id) WHERE is_active = 1`);
    // ticket_assignments.ticket_id pour les sous-requêtes de filtrage tech/groupe.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ta_ticket_id ON hub_tickets.ticket_assignments(ticket_id)`);
    // Composite (status, date_creation) et (status, date_mod) pour les tris courants.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status_date ON hub_tickets.tickets(status, date_creation DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status_mod ON hub_tickets.tickets(status, date_mod DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_date_mod ON hub_tickets.tickets(date_mod DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_priority_status ON hub_tickets.tickets(priority, status)`);
    // Trigrams pour la recherche ILIKE (nécessite l'extension pg_trgm).
    try { await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`); } catch (e) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_title_trgm ON hub_tickets.tickets USING gin(title gin_trgm_ops)`); } catch (e) {}
    // Auteur de l'action stocké par USERNAME (l'id du JWT vient de SQLite et ne correspond
    // PAS à hub.users.id en PostgreSQL → un id-join affiche le mauvais utilisateur).
    try { await client.query(`ALTER TABLE hub_tickets.ticket_history ADD COLUMN IF NOT EXISTS username VARCHAR(255)`); } catch (e) {}
    // Répare les colonnes id (SERIAL absent → id NULL) et created_at (DEFAULT absent → horodatage NULL)
    try { await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.ticket_history_id_seq`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.ticket_history ALTER COLUMN id SET DEFAULT nextval('hub_tickets.ticket_history_id_seq')`); } catch (e) {}
    try { await client.query(`ALTER SEQUENCE hub_tickets.ticket_history_id_seq OWNED BY hub_tickets.ticket_history.id`); } catch (e) {}
    try { await client.query(`SELECT setval('hub_tickets.ticket_history_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM hub_tickets.ticket_history), 1))`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.ticket_history ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`); } catch (e) {}

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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_definitions_name ON hub_tickets.sla_definitions(name);
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sla_def_prio ON hub_tickets.sla_definitions(priority)`);
    await client.query(`ALTER TABLE hub_tickets.sla_definitions ADD COLUMN IF NOT EXISTS impact INTEGER`);
    await client.query(`ALTER TABLE hub_tickets.sla_definitions ADD COLUMN IF NOT EXISTS match_operator VARCHAR(10) DEFAULT 'AND'`);
    // Répare la séquence id si absente (anciennes tables : id NULL à l'insert)
    try { await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.sla_definitions_id_seq`); } catch (e) {}
    try { await client.query(`UPDATE hub_tickets.sla_definitions SET id = nextval('hub_tickets.sla_definitions_id_seq') WHERE id IS NULL`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.sla_definitions ALTER COLUMN id SET DEFAULT nextval('hub_tickets.sla_definitions_id_seq')`); } catch (e) {}
    try { await client.query(`ALTER SEQUENCE hub_tickets.sla_definitions_id_seq OWNED BY hub_tickets.sla_definitions.id`); } catch (e) {}
    try { await client.query(`SELECT setval('hub_tickets.sla_definitions_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM hub_tickets.sla_definitions), 1))`); } catch (e) {}

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

    // Migration: répare les tables créées sans id SERIAL PRIMARY KEY
    try { await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.notification_queue_id_seq`); } catch (e) {}
    try { await client.query(`UPDATE hub_tickets.notification_queue SET id = nextval('hub_tickets.notification_queue_id_seq') WHERE id IS NULL`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.notification_queue ALTER COLUMN id SET DEFAULT nextval('hub_tickets.notification_queue_id_seq')`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.notification_queue ALTER COLUMN id SET NOT NULL`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.notification_queue ADD PRIMARY KEY (id)`); } catch (e) { /* already exists */ }
    try { await client.query(`ALTER TABLE hub_tickets.notification_queue ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`); } catch (e) {}
    console.log('[DB] notification_queue id column repaired');

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

    // ── Migration fuseau horaire — LOT 1 : colonnes UTC pures (affichage seul) ──────────
    // Contexte : la session DB est en UTC ; ces colonnes sont écrites via DEFAULT
    // CURRENT_TIMESTAMP (donc heure murale UTC) mais stockées en `timestamp` SANS fuseau.
    // node-postgres les relit alors en heure locale du serveur (Europe/Paris) → l'affichage
    // apparaît 2h trop tôt. On les passe en `timestamptz` en déclarant l'existant comme UTC,
    // ce qui restitue un instant correct (le front les affiche ensuite à la bonne heure locale,
    // sans modification front).
    // ⚠️ Volontairement EXCLU de ce lot : les colonnes SLA (échéances en heure de Paris +
    //    comparaison SQL `NOW() AT TIME ZONE 'Europe/Paris'`) et toute colonne écrite via
    //    `new Date()` brut (heure de Paris) — elles seront traitées dans un lot dédié avec
    //    les changements de code coordonnés.
    for (const [tbl, col] of [
      ['ticket_history', 'created_at'],
      ['notification_queue', 'created_at'],
      ['notification_logs', 'sent_at'],
    ]) {
      try {
        await client.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'hub_tickets' AND table_name = '${tbl}'
                AND column_name = '${col}' AND data_type = 'timestamp without time zone'
            ) THEN
              EXECUTE 'ALTER TABLE hub_tickets.${tbl} ALTER COLUMN ${col} TYPE timestamptz USING ${col} AT TIME ZONE ''UTC''';
              RAISE NOTICE '[tz] hub_tickets.${tbl}.${col} -> timestamptz';
            END IF;
          END $$;
        `);
      } catch (e) { console.log('[DB][tz] skip', tbl, col, ':', e.message); }
    }
    console.log('[DB][tz] LOT 1 (history / notifications) vérifié');

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.assignment_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 0,
        match_type VARCHAR(50),
        match_value VARCHAR(255),
        assign_type VARCHAR(50) NOT NULL,
        assign_to_id INTEGER,
        assign_to_value VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.vip_users (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        username VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        email VARCHAR(255),
        is_elu BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username)
      );
    `);
    // Migration : ajout de la colonne is_elu pour les VIP hérités des élus
    await client.query(`ALTER TABLE hub_tickets.vip_users ADD COLUMN IF NOT EXISTS is_elu BOOLEAN DEFAULT FALSE`);
    // Cache local des documents/images GLPI (pour survivre au décommissionnement de GLPI)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.glpi_documents (
        docid INTEGER PRIMARY KEY,
        filename VARCHAR(512),
        mime VARCHAR(128),
        local_path VARCHAR(1024),
        byte_size BIGINT,
        ticket_id INTEGER,
        status VARCHAR(16) DEFAULT 'ok',
        error TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      CREATE TABLE IF NOT EXISTS hub_tickets.auto_resolution_settings (
        id SERIAL PRIMARY KEY,
        enabled BOOLEAN DEFAULT false,
        inactivity_days INTEGER DEFAULT 30,
        max_reminders INTEGER DEFAULT 3,
        reminder_frequency_days INTEGER DEFAULT 7,
        notify_observers BOOLEAN DEFAULT false,
        reminder_subject TEXT DEFAULT 'Votre ticket n°{{ticket_id}} est-il toujours d''actualité ?',
        reminder_message TEXT DEFAULT '<p>Bonjour {{requester_name}},</p><p>Le ticket <strong>#{{ticket_id}} – {{ticket_title}}</strong> n''a pas eu d''activité depuis {{inactivity_days}} jours.</p><p>Si vous avez toujours besoin d''assistance, merci de cliquer sur le bouton ci-dessous :</p><p><a href="{{keep_alive_url}}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Mon ticket est toujours d''actualité</a></p>',
        closure_message TEXT DEFAULT 'Le ticket n°{{ticket_id}} ({{ticket_title}}) a été automatiquement clos.',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await client.query("INSERT INTO hub_tickets.auto_resolution_settings (id) VALUES (1) ON CONFLICT DO NOTHING"); } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.auto_resolution_logs (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        reminder_count INTEGER DEFAULT 0,
        token VARCHAR(100),
        details TEXT,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_arl_ticket ON hub_tickets.auto_resolution_logs(ticket_id)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_arl_token ON hub_tickets.auto_resolution_logs(token)'); } catch (e) {}
    try { await client.query("ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS auto_resolution_status VARCHAR(20)"); } catch (e) {}

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
        // Nettoyage : appartenances orphelines (groupe parent supprimé) qui se rattachent
        // par erreur aux tickets ré-importés après un « Récupérer GLPI ».
        await client.query(`
            DELETE FROM hub_tickets.ticket_group_members
            WHERE group_id NOT IN (SELECT id FROM hub_tickets.ticket_groups)
        `);
    } catch (e) { console.error('[MIGRATIONS] ticket_groups:', e.message); }
    try { await client.query("ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS resolution_method TEXT"); } catch (e) {}
    try { await client.query("ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS knowledge_article TEXT"); } catch (e) {}
    try { await client.query("ALTER TABLE hub_tickets.ticket_followups ADD COLUMN IF NOT EXISTS sent_to_user INTEGER DEFAULT 0"); } catch (e) {}
    try { await client.query("ALTER TABLE hub_tickets.technician_groups ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE"); } catch (e) {}
    // Auto-réparation : des lignes corrompues (id NULL) ont pu être insérées après une
    // perte de la clé primaire, ce qui casse les requêtes GROUP BY g.id. On nettoie et on restaure la PK.
    try { await client.query("DELETE FROM hub_tickets.technician_groups WHERE id IS NULL"); } catch (e) {}
    try {
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'hub_tickets.technician_groups'::regclass AND contype = 'p'
                ) THEN
                    ALTER TABLE hub_tickets.technician_groups
                        ALTER COLUMN id SET NOT NULL,
                        ADD PRIMARY KEY (id);
                END IF;
            END $$;
        `);
        // Resynchroniser la séquence SERIAL au cas où elle aurait dérivé
        await client.query(`SELECT setval(pg_get_serial_sequence('hub_tickets.technician_groups','id'), COALESCE((SELECT MAX(id) FROM hub_tickets.technician_groups), 0) + 1, false)`);
        // Réparer le DEFAULT de la colonne id si perdu (ex: ancienne migration)
        await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.technician_groups_id_seq OWNED BY hub_tickets.technician_groups.id`);
        await client.query(`ALTER TABLE hub_tickets.technician_groups ALTER COLUMN id SET DEFAULT nextval('hub_tickets.technician_groups_id_seq')`);
        await client.query(`SELECT setval('hub_tickets.technician_groups_id_seq', COALESCE((SELECT MAX(id) FROM hub_tickets.technician_groups), 0) + 1, false)`);
        // Réparer le DEFAULT de is_active (perdu lors d'une ancienne migration)
        await client.query(`UPDATE hub_tickets.technician_groups SET is_active = true WHERE is_active IS NULL`);
        await client.query(`ALTER TABLE hub_tickets.technician_groups ALTER COLUMN is_active SET DEFAULT true`);
    } catch (e) { console.error('[MIGRATIONS] technician_groups PK repair:', e.message); }

    // Réparation de technician_group_members (a perdu PK, UNIQUE, NOT NULL et DEFAULT SERIAL)
    try {
        await client.query(`DELETE FROM hub_tickets.technician_group_members WHERE id IS NULL`);
        await client.query(`ALTER TABLE hub_tickets.technician_group_members ALTER COLUMN id SET NOT NULL`);
        await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.technician_group_members_id_seq OWNED BY hub_tickets.technician_group_members.id`);
        await client.query(`ALTER TABLE hub_tickets.technician_group_members ALTER COLUMN id SET DEFAULT nextval('hub_tickets.technician_group_members_id_seq')`);
        await client.query(`SELECT setval('hub_tickets.technician_group_members_id_seq', COALESCE((SELECT MAX(id) FROM hub_tickets.technician_group_members), 0) + 1, false)`);
        // Re-créer PK si absente
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hub_tickets.technician_group_members'::regclass AND contype = 'p') THEN
                    ALTER TABLE hub_tickets.technician_group_members ADD PRIMARY KEY (id);
                END IF;
            END $$;
        `);
        // Re-créer UNIQUE si absente
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hub_tickets.technician_group_members'::regclass AND contype = 'u') THEN
                    ALTER TABLE hub_tickets.technician_group_members ADD CONSTRAINT uq_group_user UNIQUE (group_id, user_id);
                END IF;
            END $$;
        `);
    } catch (e) { console.error('[MIGRATIONS] technician_group_members repair:', e.message); }

    // ── Réparation complète de toutes les tables hub_tickets ayant perdu leurs contraintes ──
    const repairSerialTable = async (schema, table, uniqueDefs) => {
        const full = `${schema}.${table}`;
        const seq = `${schema}.${table}_id_seq`;
        await client.query(`DELETE FROM ${full} WHERE id IS NULL`);
        await client.query(`ALTER TABLE ${full} ALTER COLUMN id SET NOT NULL`);
        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${seq} OWNED BY ${full}.id`);
        await client.query(`ALTER TABLE ${full} ALTER COLUMN id SET DEFAULT nextval('${seq}')`);
        await client.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${full}), 0) + 1, false)`);
        // PK
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '${full}'::regclass AND contype = 'p') THEN
                    ALTER TABLE ${full} ADD PRIMARY KEY (id);
                END IF;
            END $$;
        `);
        // UNIQUE constraints
        for (const cols of uniqueDefs) {
            const safeCols = cols.replace(/'/g, "''");
            await client.query(`
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = '${full}'::regclass
                          AND contype = 'u'
                          AND pg_get_constraintdef(oid) LIKE 'UNIQUE (${safeCols})%'
                    ) THEN
                        ALTER TABLE ${full} ADD UNIQUE (${cols});
                    END IF;
                END $$;
            `);
        }
    };

    try { await repairSerialTable('hub_tickets', 'ticket_assignments', ['ticket_id']); } catch (e) { console.error('[REPAIR] ticket_assignments:', e.message); }
    try { await repairSerialTable('hub_tickets', 'ticket_tag_links', ['ticket_id, tag_id']); } catch (e) { console.error('[REPAIR] ticket_tag_links:', e.message); }
    try { await repairSerialTable('hub_tickets', 'ticket_sla', []); } catch (e) { console.error('[REPAIR] ticket_sla:', e.message); }
    try { await repairSerialTable('hub_tickets', 'sla_calendars', []); } catch (e) { console.error('[REPAIR] sla_calendars:', e.message); }
    try { await repairSerialTable('hub_tickets', 'sla_calendar_hours', ['calendar_id, day_of_week, start_time']); } catch (e) { console.error('[REPAIR] sla_calendar_hours:', e.message); }
    try { await repairSerialTable('hub_tickets', 'notification_triggers', ['event, recipient_type']); } catch (e) { console.error('[REPAIR] notification_triggers:', e.message); }
    try { await repairSerialTable('hub_tickets', 'vip_users', ['username']); } catch (e) { console.error('[REPAIR] vip_users:', e.message); }
    try { await repairSerialTable('hub_tickets', 'ticket_favorites', ['user_id, ticket_id']); } catch (e) { console.error('[REPAIR] ticket_favorites:', e.message); }
    try { await repairSerialTable('hub_tickets', 'role_permissions', ['role, permission']); } catch (e) { console.error('[REPAIR] role_permissions:', e.message); }

    // technician_profiles : pas de colonne id, PK sur user_id
    try {
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hub_tickets.technician_profiles'::regclass AND contype = 'p') THEN
                    ALTER TABLE hub_tickets.technician_profiles ADD PRIMARY KEY (user_id);
                END IF;
            END $$;
        `);
    } catch (e) { console.error('[REPAIR] technician_profiles:', e.message); }

    // projets.projet_roles : PK probablement OK, UNIQUE (projet_id, username, role) peut manquer
    try {
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projets.projet_roles'::regclass AND contype = 'u') THEN
                    ALTER TABLE projets.projet_roles ADD UNIQUE (projet_id, username, role);
                END IF;
            END $$;
        `);
    } catch (e) { console.error('[REPAIR] projet_roles unique:', e.message); }

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
      CREATE TABLE IF NOT EXISTS hub_tickets.escalade_config (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        target_type VARCHAR(20),
        user_id INTEGER,
        username VARCHAR(100),
        display_name VARCHAR(200),
        email VARCHAR(200),
        service_code VARCHAR(100),
        service_label VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.mail_collectors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        mailbox VARCHAR(255) NOT NULL UNIQUE,
        domain_filter VARCHAR(255),
        is_enabled BOOLEAN DEFAULT true,
        frequency VARCHAR(50) DEFAULT 'hourly',
        module VARCHAR(50) DEFAULT 'tickets',
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`ALTER TABLE hub_tickets.mail_collectors ADD COLUMN IF NOT EXISTS module VARCHAR(50) DEFAULT 'tickets'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.mail_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        keywords TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.mail_collector_logs (
        id SERIAL PRIMARY KEY,
        collector_id INTEGER NOT NULL REFERENCES hub_tickets.mail_collectors(id) ON DELETE CASCADE,
        run_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        emails_received INTEGER DEFAULT 0,
        emails_imported INTEGER DEFAULT 0,
        emails_skipped INTEGER DEFAULT 0,
        emails_failed INTEGER DEFAULT 0,
        tickets_created INTEGER DEFAULT 0,
        comments_added INTEGER DEFAULT 0,
        attachments_processed INTEGER DEFAULT 0,
        errors TEXT,
        status VARCHAR(50) DEFAULT 'success'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.ticket_email_mapping (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
        email_message_id VARCHAR(255) NOT NULL UNIQUE,
        email_in_reply_to VARCHAR(255),
        is_initial_email BOOLEAN DEFAULT true,
        email_from VARCHAR(255),
        email_received_at TIMESTAMP,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    // Assignés (techniciens) GLPI — Ticket_User type 2 (miroir de glpi.observers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.assignees (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        name VARCHAR(255),
        login VARCHAR(255),
        email VARCHAR(255),
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, user_id)
      );
    `);

    // Groupes GLPI (cache des noms)
    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.glpi_groups (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Assignations de groupe GLPI — Group_Ticket (type 2 = technicien)
    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi.group_assignees (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        name VARCHAR(255),
        type INTEGER DEFAULT 2,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, group_id)
      );
    `);

    // Mapping des groupes GLPI → groupes techniciens de l'APP
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.glpi_group_mapping (
        id SERIAL PRIMARY KEY,
        glpi_group_id INTEGER NOT NULL UNIQUE,
        glpi_group_name VARCHAR(255),
        app_group_id INTEGER REFERENCES hub_tickets.technician_groups(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    try {
      await client.query(`ALTER TABLE magapp.settings ADD COLUMN IF NOT EXISTS show_chat_live BOOLEAN DEFAULT false`);
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
    // Stockage partagé : chemin "storage/reunions/<id>/<f>" + flag "fichier perdu".
    try { await client.query(`ALTER TABLE hub_rencontres.reunion_attachments ADD COLUMN IF NOT EXISTS file_path TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_rencontres.reunion_attachments ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`); } catch (e) {}

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
    // Stockage partagé : chemin "storage/projets/<doc>/<f>" + flag "fichier perdu".
    try { await client.query(`ALTER TABLE projets.projet_versions_document ADD COLUMN IF NOT EXISTS file_path TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE projets.projet_versions_document ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`); } catch (e) {}

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
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS prix_acquisition NUMERIC(12,2)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS options_achat TEXT DEFAULT ''`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS cout_options NUMERIC(12,2)`); } catch (e) {}

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
    // Stockage partagé : liste JSON des photos perdues (URLs introuvables).
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_visites ADD COLUMN IF NOT EXISTS photos_missing TEXT DEFAULT '[]'`); } catch (e) {}

    // Migration one-shot (anciens noms per-copieur → par marque, déjà exécutée)
    try { await client.query('DROP TABLE IF EXISTS hub_copieurs.copieur_compteur_tarifs CASCADE'); } catch (e) {}
    try { await client.query('DROP TABLE IF EXISTS hub_copieurs.copieur_compteurs CASCADE'); } catch (e) {}
    // NE PAS supprimer copieur_releves ici : ce nom est réutilisé pour la nouvelle table (données persistantes)

    // Codes compteur par marque (Canon 101 = A4 mono, 104 = A3 couleur...)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.compteur_codes (
        id SERIAL PRIMARY KEY,
        mainteneur TEXT NOT NULL,
        code TEXT NOT NULL,
        libelle TEXT DEFAULT '',
        format TEXT DEFAULT '',
        couleur BOOLEAN DEFAULT FALSE,
        description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(mainteneur, code)
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_compteur_codes_mainteneur ON hub_copieurs.compteur_codes(mainteneur)');

    // Tarifs par code compteur (niveau marque, historique daté)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.compteur_tarifs (
        id SERIAL PRIMARY KEY,
        code_id INTEGER NOT NULL REFERENCES hub_copieurs.compteur_codes(id) ON DELETE CASCADE,
        tarif NUMERIC(12,6) NOT NULL,
        date_debut DATE NOT NULL,
        date_fin DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_compteur_tarifs_code ON hub_copieurs.compteur_tarifs(code_id)');

    // Relevés trimestriels par copieur × code compteur
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_copieurs.copieur_releves (
        id SERIAL PRIMARY KEY,
        copieur_id INTEGER NOT NULL REFERENCES hub_copieurs.copieurs(id) ON DELETE CASCADE,
        code_id INTEGER NOT NULL REFERENCES hub_copieurs.compteur_codes(id) ON DELETE CASCADE,
        date_releve DATE NOT NULL,
        valeur BIGINT NOT NULL,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieur_releves_copieur ON hub_copieurs.copieur_releves(copieur_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_copieur_releves_code ON hub_copieurs.copieur_releves(code_id)');
    try { await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_copieur_releves_unique ON hub_copieurs.copieur_releves(copieur_id, code_id, date_releve)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_copieurs.copieur_releves ADD COLUMN IF NOT EXISTS mainteneur TEXT`); } catch (e) {}

    // Table diagnostic : compteurs bruts Canon (100-120) pour analyse
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS hub_copieurs.snmp_raw_counters (
                copieur_id INTEGER NOT NULL REFERENCES hub_copieurs.copieurs(id) ON DELETE CASCADE,
                counter_id INTEGER NOT NULL,
                libelle TEXT,
                valeur BIGINT,
                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (copieur_id, counter_id)
            )
        `);
    } catch (e) {}

    // Colonnes SNMP live (état toners, erreurs, derniers compteurs) sur le copieur
    for (const col of [
        'snmp_toner_black INTEGER', 'snmp_toner_cyan INTEGER', 'snmp_toner_magenta INTEGER',
        'snmp_toner_yellow INTEGER', 'snmp_toner_waste INTEGER',
        'snmp_error TEXT', 'snmp_console TEXT',
        'snmp_total BIGINT', 'snmp_total_noir BIGINT', 'snmp_total_couleur BIGINT',
        'snmp_last_check TIMESTAMP'
    ]) {
        try { await client.query(`ALTER TABLE hub_copieurs.copieurs ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) {}
    }

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

    // ─── hub_parc : inventaire matériel synchronisé depuis GLPI 10 ───────────────
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_parc;');
    for (const tbl of ['parc_ordinateurs', 'parc_moniteurs', 'parc_peripheriques', 'parc_imprimantes']) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_parc.${tbl} (
          glpi_id INTEGER PRIMARY KEY,
          name TEXT,
          serial TEXT,
          otherserial TEXT,
          manufacturer TEXT,
          model TEXT,
          type TEXT,
          state TEXT,
          location TEXT,
          entity TEXT,
          user_name TEXT,
          group_name TEXT,
          tech_user TEXT,
          comment TEXT,
          is_deleted BOOLEAN DEFAULT FALSE,
          date_creation TEXT,
          date_mod TEXT,
          raw JSONB,
          last_sync TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_serial ON hub_parc.${tbl}(serial)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_name ON hub_parc.${tbl}(name)`);
    }
    // Table unifiée : tous les types d'équipements + sous-éléments (infocom/os/réseau)
    // Permet au mode HUB de reproduire à l'identique listes, KPIs et fiches du mode LIVE.
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_parc.items (
        itemtype TEXT NOT NULL,
        glpi_id INTEGER NOT NULL,
        type_key TEXT,
        name TEXT,
        serial TEXT,
        otherserial TEXT,
        is_deleted BOOLEAN DEFAULT FALSE,
        raw JSONB,
        infocom JSONB,
        os JSONB,
        network JSONB,
        documents JSONB,
        software_count INTEGER DEFAULT 0,
        last_sync TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (itemtype, glpi_id)
      )
    `);
    await client.query(`ALTER TABLE hub_parc.items ADD COLUMN IF NOT EXISTS documents JSONB`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parc_items_typekey ON hub_parc.items(type_key)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parc_items_serial ON hub_parc.items(serial)`);

    // Usagers du parc enrichis depuis l'AD (e-mail). Alimenté par la synchro usagers.
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_parc.usagers (
        key TEXT PRIMARY KEY,
        source_name TEXT,
        ad_username TEXT,
        display_name TEXT,
        email TEXT,
        service TEXT,
        found BOOLEAN DEFAULT FALSE,
        last_sync TIMESTAMP DEFAULT NOW()
      )
    `);

    // Journal des synchros parc
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_parc.sync_logs (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP DEFAULT NOW(),
        finished_at TIMESTAMP,
        status TEXT,
        details JSONB,
        triggered_by TEXT
      )
    `);

    // ─── hub_parc : MOBILITÉ (téléphones & tablettes, importé depuis Excel) ──────
    // Modèle « historique par device » : chaque ligne du fichier source est un
    // ÉVÉNEMENT (action : dotation, mise à disposition, prêt, retour, vol, cession…)
    // rattaché à un appareil identifié par sa clé (IMEI normalisé, à défaut série /
    // étiquetage / n° de ligne). La table « devices » matérialise le DERNIER état de
    // chaque appareil + le nombre d'actions, recalculée à chaque import.
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_parc.mobilite_events (
        id            SERIAL PRIMARY KEY,
        device_key    TEXT NOT NULL,
        seq           INTEGER,                 -- ordre chronologique dans l'appareil
        direction     TEXT,
        service       TEXT,
        agent         TEXT,
        action        TEXT,                    -- ACTION brute (Dotation, Retour…)
        action_norm   TEXT,                    -- action normalisée (catégorie)
        is_retour     BOOLEAN DEFAULT FALSE,
        date_event    DATE,
        quantite      INTEGER,
        type_appareil TEXT,                    -- TYPE (Iphone, Smartphone Android…)
        famille       TEXT,                    -- 'telephone' | 'tablette' | 'sim' | 'autre'
        modele        TEXT,
        imei          TEXT,
        serial        TEXT,
        etiquetage    TEXT,
        numero_ligne  TEXT,
        carte_sim     TEXT,
        code_puk      TEXT,
        statut        TEXT,                    -- colonne PRÊT (MISE A DISPOSITION, STOCK, RETOUR DEFECTUEUX…)
        ligne_active  TEXT,
        forfait       TEXT,
        mdm           TEXT,
        pret_du       TEXT,
        pret_au       TEXT,
        rapport_pret  TEXT,
        dernier_util  TEXT,
        observations  TEXT,
        bl            TEXT,
        bl_date       TEXT,
        bdc           TEXT,
        bdc_date      TEXT,
        raw           JSONB,
        import_batch  TEXT,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_events_key ON hub_parc.mobilite_events(device_key)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_events_action ON hub_parc.mobilite_events(action_norm)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_events_date ON hub_parc.mobilite_events(date_event)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_parc.mobilite_devices (
        device_key       TEXT PRIMARY KEY,
        imei             TEXT,
        serial           TEXT,
        etiquetage       TEXT,
        type_appareil    TEXT,
        famille          TEXT,
        modele           TEXT,
        numero_ligne     TEXT,
        carte_sim        TEXT,
        forfait          TEXT,
        mdm              TEXT,
        ligne_active     TEXT,
        -- dernier état (dernier événement chronologique)
        last_action      TEXT,
        last_action_norm TEXT,
        last_statut      TEXT,
        last_date        DATE,
        last_direction   TEXT,
        last_service     TEXT,
        last_agent       TEXT,
        dernier_util     TEXT,
        observations     TEXT,
        -- agrégats
        events_count     INTEGER DEFAULT 0,
        retours_count    INTEGER DEFAULT 0,
        first_date       DATE,
        is_actif         BOOLEAN DEFAULT FALSE,  -- en service (pas retourné/volé/cédé)
        import_batch     TEXT,
        updated_at       TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_dev_famille ON hub_parc.mobilite_devices(famille)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_dev_lastaction ON hub_parc.mobilite_devices(last_action_norm)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_dev_dir ON hub_parc.mobilite_devices(last_direction)`);

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

    // Visibilité des « vrais modules » de l'app (cf. shared/modules-registry.js)
    // Un module sans ligne est considéré visible par défaut.
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.module_settings (
        module_key VARCHAR(100) PRIMARY KEY,
        is_visible BOOLEAN DEFAULT true,
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
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS refus_raison TEXT`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.user_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`); } catch (e) {}
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

    // Journal de tous les SMS envoyés via Frizbi
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.sms_logs (
        id SERIAL PRIMARY KEY,
        recipient TEXT NOT NULL,
        message TEXT,
        sender_id TEXT DEFAULT 'IVRY',
        status TEXT DEFAULT 'sent',
        error_message TEXT,
        source TEXT DEFAULT 'system',
        created_by TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON hub.sms_logs(sent_at DESC)`); } catch (e) {}

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
    try { await client.query(`ALTER TABLE hub.task_notes ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`); } catch (e) {}

    // Préférence sync Microsoft Todo — colonne legacy dans hub.users, conservée pour compatibilité
    try { await client.query(`ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS ms_todo_sync BOOLEAN DEFAULT FALSE`); } catch (e) {}

    // ─── Migration GLPI → hub_tickets + seed ─────────────────────
    try {
        await client.query(`
            INSERT INTO hub_tickets.tickets (glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22)
            SELECT glpi_id, title, content, status, priority, urgency, impact, category, type,
                   CASE WHEN date_creation::text ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_creation::text::TIMESTAMP ELSE NULL END,
                   CASE WHEN date_mod::text ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_mod::text::TIMESTAMP ELSE NULL END,
                   CASE WHEN date_closed::text ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_closed::text::TIMESTAMP ELSE NULL END,
                   CASE WHEN date_solved::text ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_solved::text::TIMESTAMP ELSE NULL END,
                   location, solution, 'hub', entity, requester_name, email_alt, requester_email_22 FROM glpi.tickets
            ON CONFLICT (glpi_id) DO UPDATE SET
                title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status,
                priority = EXCLUDED.priority, urgency = EXCLUDED.urgency, impact = EXCLUDED.impact,
                category = EXCLUDED.category, type = EXCLUDED.type,
                date_mod = EXCLUDED.date_mod, date_closed = EXCLUDED.date_closed, date_solved = EXCLUDED.date_solved,
                location = EXCLUDED.location, solution = EXCLUDED.solution,
                entity = EXCLUDED.entity, requester_name = EXCLUDED.requester_name,
                email_alt = EXCLUDED.email_alt, requester_email_22 = EXCLUDED.requester_email_22
        `);
        await client.query(`UPDATE hub_tickets.tickets SET source = 'hub' WHERE source IS NULL OR source = 'glpi'`);
        await client.query(`
            INSERT INTO hub_tickets.ticket_status (id, label) SELECT id, label FROM glpi.ticket_status
            ON CONFLICT (id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO hub_tickets.ticket_status (id, label) VALUES
            (4, 'En attente utilisateur'), (5, 'Résolu'), (6, 'Fermé'), (8, 'Rejeté')
            ON CONFLICT (id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO hub_tickets.observers (ticket_id, user_id, name, login, email)
            SELECT ticket_id, user_id, name, login, email FROM glpi.observers
            ON CONFLICT (ticket_id, user_id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO hub_tickets.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation)
            SELECT ticket_id, content, content_hash, author_name, author_email, is_private,
                   CASE WHEN date_creation::text ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_creation::text::TIMESTAMP ELSE NULL END FROM glpi.ticket_followups
            ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING
        `);
        console.log('[PG DB] hub_tickets migration from glpi completed');
    } catch (e) {
        console.log('[PG DB] hub_tickets migration skip:', e.message);
    }

    // Migrate date columns from TEXT to TIMESTAMP (after GLPI copy) — idempotent :
    // on ne migre que les colonnes encore en TEXT (no-op si déjà TIMESTAMP), et le
    // garde regex écarte les valeurs vides/invalides (ex. '0000-00-00') au lieu de planter.
    try {
        const dateCols = ['date_creation', 'date_mod', 'date_closed', 'date_solved'];
        const { rows: colTypes } = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'hub_tickets' AND table_name = 'tickets' AND column_name = ANY($1)
        `, [dateCols]);
        const textCols = colTypes
            .filter(c => c.data_type === 'text' || c.data_type.includes('character'))
            .map(c => c.column_name);
        for (const col of textCols) {
            await client.query(
                `ALTER TABLE hub_tickets.tickets ALTER COLUMN ${col} TYPE TIMESTAMP ` +
                `USING CASE WHEN ${col} ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN ${col}::TIMESTAMP ELSE NULL END`
            );
        }
        if (textCols.length) console.log('[PG DB] hub_tickets.tickets date columns migrated to TIMESTAMP:', textCols.join(', '));
    } catch (e) {
        console.log('[PG DB] date column migration skip:', e.message);
    }

    try {
        // Seed sequence
        await client.query(`INSERT INTO hub_tickets.ticket_sequence (last_id) SELECT COALESCE(MAX(glpi_id), 10000000) FROM hub_tickets.tickets`);

        // Seed notification templates
        await client.query(`
            INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html) VALUES
            ('ticket_created', 'Création de ticket', '{{app_name}} - Ticket #{{ticket_id}} créé : {{ticket_title}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Un nouveau ticket a été créé :</p><table cellpadding="4"><tr><td><strong>Priorité :</strong></td><td>{{priority_label}}</td></tr><tr><td><strong>Type :</strong></td><td>{{type_label}}</td></tr><tr><td><strong>Statut :</strong></td><td>{{status_label}}</td></tr></table><p>{{ticket_content}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('ticket_assigned', 'Assignation de ticket', '{{app_name}} - Ticket #{{ticket_id}} vous a été assigné', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{assignee_name}},</p><p>Le ticket <strong>#{{ticket_id}}</strong> vous a été assigné.</p><table cellpadding="4"><tr><td><strong>Priorité :</strong></td><td>{{priority_label}}</td></tr><tr><td><strong>Demandeur :</strong></td><td>{{requester_name}}</td></tr></table><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('ticket_status_changed', 'Changement de statut', '{{app_name}} - Ticket #{{ticket_id}} : {{old_status}} → {{new_status}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le statut du ticket est passé de <strong>{{old_status}}</strong> à <strong>{{new_status}}</strong>.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('ticket_new_comment', 'Nouveau commentaire', '{{app_name}} - Nouveau commentaire sur le ticket #{{ticket_id}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p><strong>{{author_name}}</strong> a ajouté un commentaire :</p><blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:8px 0;">{{comment_content}}</blockquote><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('ticket_comment_reply', 'Réponse à un ticket', '[Ticket #{{ticket_id}}] Réponse à votre demande', '<p>Bonjour {{recipient_name}},</p><p>Vous avez reçu une réponse concernant votre ticket <strong>#{{ticket_id}} – {{ticket_title}}</strong> :</p><blockquote style="border-left:4px solid #6366f1;padding-left:12px;margin:12px 0;color:#374151;">{{comment_content}}</blockquote><p style="margin-top:16px;"><a href="{{reply_url}}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">↩ Répondre à ce message</a></p><p style="font-size:12px;color:#94a3b8;">Ou copiez ce lien : {{reply_url}}</p><p>Cordialement,<br>{{author_name}}</p>'),
            ('sla_warning', 'Alerte SLA - Limite proche', '{{app_name}} - ALERTE SLA : Ticket #{{ticket_id}} approche de la limite', '<h2>⚠️ Alerte SLA</h2><p>Le ticket <strong>#{{ticket_id}} - {{ticket_title}}</strong> approche de sa deadline.</p><p><strong>{{sla_type}} :</strong> {{sla_deadline}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Agir maintenant</a></p>'),
            ('sla_breached', 'Dépassement SLA', '{{app_name}} - DÉPASSEMENT SLA : Ticket #{{ticket_id}}', '<h2>🚨 Dépassement SLA</h2><p>Le ticket <strong>#{{ticket_id}} - {{ticket_title}}</strong> a dépassé sa deadline.</p><p><strong>{{sla_type}} :</strong> {{sla_deadline}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('ticket_resolved', 'Ticket résolu', '{{app_name}} - Ticket #{{ticket_id}} résolu', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Votre ticket a été résolu par <strong>{{technician_name}}</strong>.</p><blockquote style="border-left:4px solid #22c55e;padding:8px 16px;margin:8px 0;">{{solution_text}}</blockquote><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#22c55e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir la solution</a></p>'),
            ('ticket_closed', 'Ticket fermé', '{{app_name}} - Ticket #{{ticket_id}} fermé', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le ticket est maintenant fermé.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('ticket_reopened', 'Ticket réouvert', '{{app_name}} - Ticket #{{ticket_id}} réouvert', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le ticket a été réouvert par <strong>{{reopened_by}}</strong>.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#f59e0b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
            ('live_summary', 'Résumé échange live', '[DSI Support] Résumé de votre échange live — Ticket #{{ticket_id}}', '<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:20px 24px;color:#fff"><div style="font-size:18px;font-weight:700">💬 Résumé de votre échange DSI</div><div style="font-size:13px;opacity:0.85;margin-top:4px">{{ticket_title}}</div></div><div style="padding:20px 24px"><p style="font-size:14px;color:#374151">Bonjour <strong>{{recipient_name}}</strong>,</p><p style="font-size:14px;color:#374151">Voici le résumé de votre échange avec le support DSI :</p></div><div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0"><a href="{{app_url}}/tickets/{{ticket_id}}" style="color:#6366f1;font-size:13px">→ Voir le ticket #{{ticket_id}}</a></div></div>')
            ON CONFLICT (slug) DO NOTHING
        `);

        // Seed triggers
        await client.query(`
            INSERT INTO hub_tickets.notification_triggers (event, template_slug, recipient_type) VALUES
            -- Création de ticket
            ('ticket.created', 'ticket_created', 'requester'),
            ('ticket.created', 'ticket_created', 'technician'),
            ('ticket.created', 'ticket_created', 'group'),
            ('ticket.created', 'ticket_created', 'supervisor'),
            ('ticket.created', 'ticket_created', 'watchers'),
            -- Assignation de ticket
            ('ticket.assigned', 'ticket_assigned', 'technician'),
            ('ticket.assigned', 'ticket_assigned', 'requester'),
            ('ticket.assigned', 'ticket_assigned', 'group'),
            ('ticket.assigned', 'ticket_assigned', 'supervisor'),
            -- Changement de statut
            ('ticket.status_changed', 'ticket_status_changed', 'requester'),
            ('ticket.status_changed', 'ticket_status_changed', 'technician'),
            ('ticket.status_changed', 'ticket_status_changed', 'group'),
            ('ticket.status_changed', 'ticket_status_changed', 'watchers'),
            -- Nouveau commentaire
            ('ticket.comment_added', 'ticket_new_comment', 'requester'),
            ('ticket.comment_added', 'ticket_new_comment', 'watchers'),
            ('ticket.comment_added', 'ticket_new_comment', 'technician'),
            ('ticket.comment_added', 'ticket_new_comment', 'group'),
            -- Alerte SLA (limite proche)
            ('ticket.sla_warning', 'sla_warning', 'technician'),
            ('ticket.sla_warning', 'sla_warning', 'group'),
            ('ticket.sla_warning', 'sla_warning', 'supervisor'),
            ('ticket.sla_warning', 'sla_warning', 'admin'),
            -- Dépassement SLA
            ('ticket.sla_breached', 'sla_breached', 'technician'),
            ('ticket.sla_breached', 'sla_breached', 'group'),
            ('ticket.sla_breached', 'sla_breached', 'supervisor'),
            ('ticket.sla_breached', 'sla_breached', 'admin'),
            -- Ticket résolu
            ('ticket.resolved', 'ticket_resolved', 'requester'),
            ('ticket.resolved', 'ticket_resolved', 'watchers'),
            ('ticket.resolved', 'ticket_resolved', 'admin'),
            -- Ticket fermé
            ('ticket.closed', 'ticket_closed', 'requester'),
            ('ticket.closed', 'ticket_closed', 'technician'),
            ('ticket.closed', 'ticket_closed', 'group'),
            ('ticket.closed', 'ticket_closed', 'admin'),
            ('ticket.closed', 'ticket_closed', 'watchers'),
            -- Ticket réouvert
            ('ticket.reopened', 'ticket_reopened', 'technician'),
            ('ticket.reopened', 'ticket_reopened', 'group'),
            ('ticket.reopened', 'ticket_reopened', 'supervisor'),
            ('ticket.reopened', 'ticket_reopened', 'watchers')
            ON CONFLICT (event, recipient_type) DO NOTHING
        `);

        console.log('[PG DB] hub_tickets tables ready');
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

    // ── Live chat ──────────────────────────────────────────────────────
    try { await client.query(`ALTER TABLE hub_tickets.tickets ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false`); } catch (e) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.live_sessions (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER,
        user_username VARCHAR(255),
        user_display_name VARCHAR(255),
        user_email VARCHAR(255),
        tech_username VARCHAR(255),
        tech_display_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'waiting',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        claimed_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.live_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES hub_tickets.live_sessions(id) ON DELETE CASCADE,
        sender_type VARCHAR(10) DEFAULT 'user',
        sender_name VARCHAR(255),
        sender_username VARCHAR(255),
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_live_messages_session ON hub_tickets.live_messages(session_id);`); } catch (e) {}
    // Attachments support (non-destructive migrations)
    try { await client.query(`ALTER TABLE hub_tickets.live_messages ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_messages ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_messages ADD COLUMN IF NOT EXISTS attachment_missing BOOLEAN DEFAULT FALSE`); } catch (e) {}
    // Live auth
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ADD COLUMN IF NOT EXISTS auth_method VARCHAR(20) DEFAULT 'guest'`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW()`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ADD COLUMN IF NOT EXISTS close_reason VARCHAR(50)`); } catch (e) {}
    // Ensure id column has proper serial/default/PK (survives CREATE TABLE IF NOT EXISTS being a no-op)
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ALTER COLUMN id SET NOT NULL`); } catch (e) {}
    try { await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.live_sessions_id_seq`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ALTER COLUMN id SET DEFAULT nextval('hub_tickets.live_sessions_id_seq'::regclass)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ADD PRIMARY KEY (id)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_messages ALTER COLUMN id SET NOT NULL`); } catch (e) {}
    try { await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.live_messages_id_seq`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_messages ALTER COLUMN id SET DEFAULT nextval('hub_tickets.live_messages_id_seq'::regclass)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_messages ADD PRIMARY KEY (id)`); } catch (e) {}
    try { await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.live_otp_codes (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100),
        email VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        code VARCHAR(4) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_otp_codes ADD COLUMN IF NOT EXISTS username VARCHAR(100)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.live_sessions ADD COLUMN IF NOT EXISTS app_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.technician_profiles ADD COLUMN IF NOT EXISTS mobile_phone VARCHAR(30)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_tickets.technician_profiles ADD COLUMN IF NOT EXISTS is_emergency_contact BOOLEAN DEFAULT FALSE`); } catch (e) {}
    try { await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.live_satisfaction (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES hub_tickets.live_sessions(id) ON DELETE CASCADE,
        ticket_id INTEGER,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `); } catch (e) {}

    // Mail collector TIMESTAMPTZ conversions
    try { await client.query('ALTER TABLE hub_tickets.mail_collector_logs ALTER COLUMN run_at TYPE TIMESTAMPTZ'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.mail_collectors ALTER COLUMN last_run TYPE TIMESTAMPTZ'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.mail_collectors ALTER COLUMN next_run TYPE TIMESTAMPTZ'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.mail_collectors ALTER COLUMN created_at TYPE TIMESTAMPTZ'); } catch (e) {}
    try { await client.query('ALTER TABLE hub_tickets.mail_collectors ALTER COLUMN updated_at TYPE TIMESTAMPTZ'); } catch (e) {}

    // Live chat destinations
    try { await client.query("ALTER TABLE hub_tickets.live_sessions ADD COLUMN IF NOT EXISTS chat_type VARCHAR(20) DEFAULT 'ville'"); } catch (e) {}

    // ─── hub.ville_config ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.ville_config (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(255),
        code_postal VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── hub.elus ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.elus (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(255) NOT NULL,
        prenom VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        telephone VARCHAR(20),
        role VARCHAR(100) NOT NULL,
        delegation VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── hub.sites ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.sites (
        id SERIAL PRIMARY KEY,
        code_bien VARCHAR(50),
        nom VARCHAR(255) NOT NULL,
        categorie VARCHAR(100),
        abbreviation VARCHAR(50),
        adresse TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ajouter colonnes si elles n'existent pas
    try { await client.query(`ALTER TABLE hub.sites ADD COLUMN IF NOT EXISTS code_bien VARCHAR(50)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.sites ADD COLUMN IF NOT EXISTS categorie VARCHAR(100)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.sites ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(50)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.sites ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub.sites ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`); } catch (e) {}
    // Géocodage manuel : bloque l'écrasement automatique par Nominatim
    try { await client.query(`ALTER TABLE hub.sites ADD COLUMN IF NOT EXISTS geocoded_manually BOOLEAN DEFAULT FALSE`); } catch (e) {}

    // ─── hub.ecoles ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.ecoles (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(255) NOT NULL,
        adresse TEXT,
        code_postal VARCHAR(10),
        email VARCHAR(255),
        telephone VARCHAR(20),
        directeur VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Gestion documentaire centralisée (hub_docs) ─────────────────────────
    // Tous les modules (certificats, projets, contrats, tickets, telecom,
    // rencontres, tasks, live, etc.) stockent leurs pièces jointes ici.
    // documents = pièce logique avec versions, document_versions = N versions.
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_docs;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_docs.documents (
        id SERIAL PRIMARY KEY,
        module VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL DEFAULT 'attachment',
        entity_id VARCHAR(100) NOT NULL,
        title VARCHAR(500) NOT NULL,
        current_version INTEGER NOT NULL DEFAULT 1,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_by VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_docs_entity ON hub_docs.documents(module, entity_type, entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_docs_module ON hub_docs.documents(module) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hub_docs_title ON hub_docs.documents(title)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_docs.document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES hub_docs.documents(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        filename VARCHAR(500) NOT NULL,
        original_name VARCHAR(500) NOT NULL,
        mimetype VARCHAR(200),
        size BIGINT,
        storage_backend VARCHAR(20) NOT NULL DEFAULT 'smb',
        storage_ref TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        uploaded_by VARCHAR(100),
        uploaded_at TIMESTAMPTZ DEFAULT NOW(),
        is_missing BOOLEAN DEFAULT FALSE,
        UNIQUE (document_id, version)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON hub_docs.document_versions(document_id)`);

    // Trace des migrations one-shot depuis tables legacy
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_docs.migration_log (
        id SERIAL PRIMARY KEY,
        source_table VARCHAR(100) NOT NULL,
        source_id VARCHAR(100) NOT NULL,
        document_id INTEGER REFERENCES hub_docs.documents(id) ON DELETE SET NULL,
        version_id INTEGER REFERENCES hub_docs.document_versions(id) ON DELETE SET NULL,
        migrated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (source_table, source_id)
      )
    `);

    // ─── hub_stocks — Module de gestion des stocks ───────────────
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_stocks;');

    // Magasins
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.stores (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Droits par magasin (résolus par username, comme tickets)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.store_members (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','operator','manager')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(store_id, username)
      );
    `);

    // Lieux de stockage paramétrables (hiérarchie via parent_id)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.storage_locations (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        code VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES hub_stocks.storage_locations(id) ON DELETE SET NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Catalogue articles
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.items (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(255) UNIQUE,
        label VARCHAR(500) NOT NULL,
        category VARCHAR(100),
        brand VARCHAR(255),
        model VARCHAR(255),
        ean VARCHAR(64),
        specs JSONB DEFAULT '{}'::jsonb,
        tracking_mode VARCHAR(20) NOT NULL DEFAULT 'batch' CHECK (tracking_mode IN ('batch','serial')),
        unit VARCHAR(50) DEFAULT 'unité',
        min_threshold INTEGER DEFAULT 0,
        photo_document_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Niveaux de stock par article / magasin / emplacement / type (normal|loan)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.stock_levels (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES hub_stocks.items(id) ON DELETE CASCADE,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        location_id INTEGER REFERENCES hub_stocks.storage_locations(id) ON DELETE SET NULL,
        stock_type VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (stock_type IN ('normal','loan')),
        quantity INTEGER NOT NULL DEFAULT 0,
        min_threshold INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(item_id, store_id, location_id, stock_type)
      );
    `);

    // Journal des mouvements (source de vérité)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.movements (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES hub_stocks.items(id) ON DELETE CASCADE,
        serial_item_id INTEGER,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        location_id INTEGER REFERENCES hub_stocks.storage_locations(id) ON DELETE SET NULL,
        counterpart_store_id INTEGER REFERENCES hub_stocks.stores(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('in','out','transfer','loan_out','loan_return','adjust')),
        stock_type VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (stock_type IN ('normal','loan')),
        quantity INTEGER NOT NULL,
        reason TEXT,
        reference VARCHAR(255),
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_members_user ON hub_stocks.store_members(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_members_store ON hub_stocks.store_members(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_locations_store ON hub_stocks.storage_locations(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_levels_item ON hub_stocks.stock_levels(item_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_levels_store ON hub_stocks.stock_levels(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_movements_item ON hub_stocks.movements(item_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_movements_store ON hub_stocks.movements(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_movements_created ON hub_stocks.movements(created_at DESC)');

    // ─── hub_stocks — Réception de commande (Phase 2) ────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.receptions (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(255),
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        supplier VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','partial','received')),
        notes TEXT,
        received_by VARCHAR(255),
        received_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.reception_lines (
        id SERIAL PRIMARY KEY,
        reception_id INTEGER NOT NULL REFERENCES hub_stocks.receptions(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES hub_stocks.items(id) ON DELETE SET NULL,
        reference VARCHAR(255),
        label VARCHAR(500),
        ean VARCHAR(64),
        quantity_received INTEGER NOT NULL DEFAULT 0,
        tracking_mode VARCHAR(20) NOT NULL DEFAULT 'batch' CHECK (tracking_mode IN ('batch','serial')),
        location_id INTEGER REFERENCES hub_stocks.storage_locations(id) ON DELETE SET NULL,
        specs JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Articles unitaires (sérialisés) — serial_number nullable = saisie différée
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.serial_items (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES hub_stocks.items(id) ON DELETE CASCADE,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        location_id INTEGER REFERENCES hub_stocks.storage_locations(id) ON DELETE SET NULL,
        serial_number VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','loaned','delivered','reserved')),
        order_number VARCHAR(255),
        reception_id INTEGER REFERENCES hub_stocks.receptions(id) ON DELETE SET NULL,
        specs JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_receptions_store ON hub_stocks.receptions(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_receptions_order ON hub_stocks.receptions(order_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_reclines_reception ON hub_stocks.reception_lines(reception_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_serials_item ON hub_stocks.serial_items(item_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_serials_store ON hub_stocks.serial_items(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_serials_status ON hub_stocks.serial_items(status)');

    // ─── hub_stocks — Sorties (BL signé) & Prêts (Phase 3) ───────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.deliveries (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        beneficiary_name VARCHAR(255),
        beneficiary_username VARCHAR(255),
        beneficiary_email VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','delivered')),
        signature_document_id INTEGER,
        signed_at TIMESTAMP,
        notes TEXT,
        delivered_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.delivery_lines (
        id SERIAL PRIMARY KEY,
        delivery_id INTEGER NOT NULL REFERENCES hub_stocks.deliveries(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL REFERENCES hub_stocks.items(id) ON DELETE CASCADE,
        serial_item_id INTEGER REFERENCES hub_stocks.serial_items(id) ON DELETE SET NULL,
        location_id INTEGER REFERENCES hub_stocks.storage_locations(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.loans (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES hub_stocks.stores(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL REFERENCES hub_stocks.items(id) ON DELETE CASCADE,
        serial_item_id INTEGER REFERENCES hub_stocks.serial_items(id) ON DELETE SET NULL,
        borrower_name VARCHAR(255),
        borrower_username VARCHAR(255),
        borrower_email VARCHAR(255),
        quantity INTEGER NOT NULL DEFAULT 1,
        loaned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        due_date DATE,
        returned_at TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned')),
        signature_document_id INTEGER,
        delivered_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_deliveries_store ON hub_stocks.deliveries(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_dlines_delivery ON hub_stocks.delivery_lines(delivery_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_loans_store ON hub_stocks.loans(store_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stocks_loans_status ON hub_stocks.loans(status)');

    // ─── hub_stocks — Gabarits de BL & livraison 2 phases (Phase 4) ─
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_stocks.bl_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        base_document_id INTEGER,
        fields JSONB DEFAULT '[]'::jsonb,
        is_default BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Livraison en 2 phases : colonnes additionnelles (non destructif)
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS template_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS prepared_by VARCHAR(255)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMP`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS preparer_signature_document_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS recipient_signature_document_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS bl_document_id INTEGER`); } catch (e) {}
    // Étendre le statut pour inclure 'prepared'
    try { await client.query(`ALTER TABLE hub_stocks.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD CONSTRAINT deliveries_status_check CHECK (status IN ('draft','prepared','signed','delivered'))`); } catch (e) {}

    // ─── Gabarits partagés (BL / remise / retour) + sorties « remise/retour » mobilité ─
    // Le module de gabarits de /stocks/admin devient partagé : une catégorie distingue
    // les bons de livraison classiques des fiches de remise/retour de matériel mobile.
    try { await client.query(`ALTER TABLE hub_stocks.bl_templates ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'bl'`); } catch (e) {}
    // Sorties réutilisées pour la mobilité : sens (remise/retour) + variables de fiche libres.
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'delivery'`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_stocks.deliveries ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb`); } catch (e) {}

    // ─── hub_parc.mobilite_* : liaison avec le stock (cycle de vie via /stocks) ────
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS serial_item_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS store_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS last_delivery_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_events ADD COLUMN IF NOT EXISTS delivery_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_events ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'import'`); } catch (e) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_dev_serialitem ON hub_parc.mobilite_devices(serial_item_id)`); } catch (e) {}

    // ─── Cycle de vie par état (stock / en_attribution / attribue / sorti) ────────
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS statut VARCHAR(20)`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS pret_due_date DATE`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS fiche_document_id INTEGER`); } catch (e) {}
    try { await client.query(`ALTER TABLE hub_parc.mobilite_devices ADD COLUMN IF NOT EXISTS attrib JSONB DEFAULT '{}'::jsonb`); } catch (e) {}
    // Backfill une seule fois (ne touche que les lignes sans statut) depuis la dernière action.
    try {
      await client.query(`
        UPDATE hub_parc.mobilite_devices SET statut = CASE
          WHEN last_action_norm = 'Retour' THEN 'stock'
          WHEN last_action_norm IN ('Vol','Cession') THEN 'sorti'
          WHEN last_action_norm IN ('Dotation','Mise à disposition','Prêt','Remplacement') THEN 'attribue'
          ELSE 'stock' END
        WHERE statut IS NULL`);
    } catch (e) { console.error('[DB] backfill mobilite statut:', e.message); }
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_mob_dev_statut ON hub_parc.mobilite_devices(statut)`); } catch (e) {}

    // ─── Module Réseau Ville (hub_reseau) — v2 DIP ────────────────
    // Données réelles extraites des DIP (Dossiers d'Infrastructure et de Production).
    // Géométrie en JSONB GeoJSON (PostGIS indisponible). Sites référencés via hub.sites.code_bien.
    try {
      await client.query('CREATE SCHEMA IF NOT EXISTS hub_reseau');

      // ENUM idempotents — v1
      await client.query(`DO $$ BEGIN CREATE TYPE hub_reseau.network_link_type AS ENUM ('FIBRE','WAN','OPERATEUR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      await client.query(`DO $$ BEGIN CREATE TYPE hub_reseau.network_operator AS ENUM ('LINKT','MOJI','RED','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      await client.query(`DO $$ BEGIN CREATE TYPE hub_reseau.duct_status AS ENUM ('LIBRE','OCCUPE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      await client.query(`DO $$ BEGIN CREATE TYPE hub_reseau.access_type AS ENUM ('FIBRE','WAN','ADSL','SDSL','4G'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      // ENUM extension v2
      await client.query(`DO $$ BEGIN ALTER TYPE hub_reseau.network_link_type ADD VALUE IF NOT EXISTS 'LASER'; EXCEPTION WHEN others THEN NULL; END $$;`);
      await client.query(`DO $$ BEGIN ALTER TYPE hub_reseau.network_operator ADD VALUE IF NOT EXISTS 'SFR'; EXCEPTION WHEN others THEN NULL; END $$;`);
      await client.query(`DO $$ BEGIN ALTER TYPE hub_reseau.access_type ADD VALUE IF NOT EXISTS '3G'; EXCEPTION WHEN others THEN NULL; END $$;`);

      // ── Tables existantes enrichies ───────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.network_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          site_a VARCHAR NOT NULL,
          site_b VARCHAR NOT NULL,
          type hub_reseau.network_link_type NOT NULL,
          capacity VARCHAR,
          operator hub_reseau.network_operator,
          carries_data BOOLEAN DEFAULT TRUE,
          carries_voice BOOLEAN DEFAULT FALSE,
          is_loop BOOLEAN DEFAULT FALSE,
          is_redundant BOOLEAN DEFAULT FALSE,
          geometry JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.network_access (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          site_code VARCHAR NOT NULL,
          type hub_reseau.access_type NOT NULL,
          operator hub_reseau.network_operator,
          mode VARCHAR,
          bandwidth VARCHAR,
          carries_data BOOLEAN DEFAULT TRUE,
          carries_voice BOOLEAN DEFAULT FALSE,
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.ducts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR,
          status hub_reseau.duct_status NOT NULL,
          capacity INTEGER,
          used_capacity INTEGER DEFAULT 0,
          geometry JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Colonnes additionnelles v2 (non-destructif)
      for (const col of [
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS bag_id VARCHAR`,
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS fo_pairs VARCHAR`,
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS port_a VARCHAR`,
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS port_b VARCHAR`,
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS vlan_trunk TEXT`,
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS notes TEXT`,
        `ALTER TABLE hub_reseau.network_links ADD COLUMN IF NOT EXISTS irf_stack_id INT`,
      ]) await client.query(col).catch(() => {});

      await client.query(`CREATE INDEX IF NOT EXISTS idx_links_site_a ON hub_reseau.network_links(site_a)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_links_site_b ON hub_reseau.network_links(site_b)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_access_site ON hub_reseau.network_access(site_code)`);

      // ── Nouvelles tables v2 ────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.irf_stacks (
          id SERIAL PRIMARY KEY,
          nom TEXT NOT NULL,
          irf_domain INT,
          ip_management TEXT,
          vlan_management INT DEFAULT 840,
          type_equipement TEXT,
          description TEXT,
          firmware TEXT,
          actif BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.equipements (
          id SERIAL PRIMARY KEY,
          site_code TEXT,
          nom TEXT NOT NULL,
          type TEXT NOT NULL,
          modele TEXT,
          reference TEXT,
          ip_management TEXT,
          numero_serie TEXT,
          firmware TEXT,
          irf_stack_id INT REFERENCES hub_reseau.irf_stacks(id) ON DELETE SET NULL,
          irf_membre_num INT,
          boucle TEXT,
          localisation TEXT,
          statut TEXT DEFAULT 'PROD',
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.vlans (
          id SERIAL PRIMARY KEY,
          vlan_id INT UNIQUE NOT NULL,
          nom TEXT NOT NULL,
          description TEXT,
          adresse_ip TEXT,
          adresse_ip2 TEXT,
          dhcp_relay TEXT,
          passerelle TEXT,
          usage TEXT,
          actif BOOLEAN DEFAULT TRUE
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.liaisons_fo (
          id SERIAL PRIMARY KEY,
          site_a TEXT NOT NULL,
          site_b TEXT NOT NULL,
          libelle TEXT,
          paires TEXT,
          boite_jonction TEXT,
          capacite TEXT,
          boucle TEXT,
          statut TEXT DEFAULT 'ACTIF',
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // ── Liens switchs (alimentés par l'API Infra réseau) ──────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.switch_links (
          id SERIAL PRIMARY KEY,
          ext_id INT,
          local_switch_id INT,
          local_hostname TEXT,
          local_alias TEXT,
          local_site_id TEXT,
          local_ip TEXT,
          local_port TEXT,
          local_port_description TEXT,
          remote_switch_id INT,
          remote_hostname TEXT,
          remote_alias TEXT,
          remote_site_id TEXT,
          remote_ip TEXT,
          remote_port TEXT,
          remote_port_description TEXT,
          is_intra_site BOOLEAN DEFAULT FALSE,
          synced_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_switch_links_local_site ON hub_reseau.switch_links(local_site_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_switch_links_remote_site ON hub_reseau.switch_links(remote_site_id)`);

      // ── Documents DXF (plans réseaux) ──────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.dxf_documents (
          id SERIAL PRIMARY KEY,
          nom_fichier TEXT NOT NULL,
          calques JSONB DEFAULT '[]',
          points_calage JSONB DEFAULT '[]',
          bounds JSONB,
          cree_le TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.dxf_entites (
          id SERIAL PRIMARY KEY,
          document_id INT NOT NULL REFERENCES hub_reseau.dxf_documents(id) ON DELETE CASCADE,
          calque TEXT NOT NULL,
          type_entite TEXT NOT NULL,
          geojson JSONB NOT NULL,
          couleur TEXT,
          epaisseur INT,
          cree_le TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_dxf_entites_doc ON hub_reseau.dxf_entites(document_id)`);
      // Paramètres de géoréférencement persistés (rappelés au ré-import du même fichier)
      await client.query(`ALTER TABLE hub_reseau.dxf_documents ADD COLUMN IF NOT EXISTS ajustement JSONB`);
      await client.query(`ALTER TABLE hub_reseau.dxf_documents ADD COLUMN IF NOT EXISTS transform JSONB`);
      // Géoréférencement conservé indépendamment du document : la suppression d'un DXF
      // n'efface pas son calage (rappelé au ré-import du même nom de fichier).
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.dxf_calibrations (
          nom_fichier TEXT PRIMARY KEY,
          points_calage JSONB DEFAULT '[]',
          ajustement JSONB,
          transform JSONB,
          maj_le TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      // Styles d'affichage par calque (visibilité + couleur), partagés entre documents.
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub_reseau.dxf_layer_styles (
          calque TEXT PRIMARY KEY,
          couleur TEXT,
          visible BOOLEAN DEFAULT TRUE,
          maj_le TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // ── Définitions d'API « Infra » (générique, extensible) ───────
      await client.query(`
        CREATE TABLE IF NOT EXISTS hub.infra_apis (
          id SERIAL PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          label TEXT,
          base_url TEXT,
          endpoint TEXT,
          api_key TEXT,
          header_name TEXT DEFAULT 'x-api-key',
          enabled BOOLEAN DEFAULT TRUE,
          last_sync_at TIMESTAMPTZ,
          last_sync_status TEXT,
          last_sync_count INT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        INSERT INTO hub.infra_apis (key, label, base_url, endpoint, api_key, header_name)
        VALUES ('reseau_links', 'API Liens réseau (switchs)', 'http://10.103.130.36:8080', '/api/links',
                'nhk_f525f12dc265cdd1b834e7cb26616831e781d403932358392166967b42556ff6', 'x-api-key')
        ON CONFLICT (key) DO NOTHING
      `);

      // ── Seed v2 (version-gated) ────────────────────────────────────
      // DÉSACTIVÉ : le réseau est désormais alimenté par l'API Infra (switchs + liens),
      // pas par le seed statique « DIP 2021 ». On conserve le bloc pour mémoire.
      const { rows: vs } = await client.query('SELECT COUNT(*)::int AS c FROM hub_reseau.irf_stacks');
      if (false /* seed DIP 2021 retiré : alimentation via API Infra (hub.infra_apis) */) {
        void vs;
        // Vider les tables pour repartir proprement
        await client.query('TRUNCATE hub_reseau.network_links, hub_reseau.network_access, hub_reseau.ducts CASCADE');

        // ── IRF Stacks ──
        await client.query(`
          INSERT INTO hub_reseau.irf_stacks (id, nom, irf_domain, ip_management, vlan_management, type_equipement, description, firmware) VALUES
          (1, 'COEUR',        2,  '10.103.135.9',  840, 'HP5940',   'Cœur de réseau IRF — Mairie + PRA (4 membres)',          '5940-CMW710-R2609'),
          (2, 'BOUCLE-NORD',  10, '10.103.135.11', 840, 'HP5500HI', 'IRF Boucle Nord — 5 membres (Coutant, Cachin, Régie, Casanova ×2)', NULL),
          (3, 'BOUCLE-SUD',   NULL,'10.103.135.10', 840, 'HP5500HI', 'IRF Boucle Sud — 3 membres (Neruda, JC, CAT)',          NULL)
        `);

        // ── Équipements ──
        await client.query(`
          INSERT INTO hub_reseau.equipements
            (site_code, nom, type, modele, reference, ip_management, numero_serie, firmware, irf_stack_id, irf_membre_num, boucle, localisation, statut) VALUES
          -- CŒUR Mairie (membres 1 & 2)
          ('S001B01','COEUR-MAIRIE-M1',   'SWITCH_L3','HP 5940 48SFP+ 6QSFP28','JH684A','10.103.135.9','CN70HLC060','5940-CMW710-R2609',1,1,'COEUR','Mairie — Baie principale','PROD'),
          ('S001B01','COEUR-MAIRIE-M2',   'SWITCH_L3','HP 5940 48SFP+ 6QSFP28','JH684A','10.103.135.9','CN70HLC05Y','5940-CMW710-R2609',1,2,'COEUR','Mairie — Baie principale','PROD'),
          -- CŒUR PRA (membres 3 & 4)
          ('S064B01','COEUR-PRA-M3',      'SWITCH_L3','HP 5940 48SFP+ 6QSFP28','JH684A','10.103.135.9','CN70HLC060','5940-CMW710-R2609',1,3,'COEUR','PRA Espace Robespierre — Baie 3','PROD'),
          ('S064B01','COEUR-PRA-M4',      'SWITCH_L3','HP 5940 48SFP+ 6QSFP28','JH684A','10.103.135.9','CN70HLC06K','5940-CMW710-R2609',1,4,'COEUR','PRA Espace Robespierre — Baie 4','PROD'),
          -- Switches Mairie distribution
          ('S001B01','SWMAIRIE01',         'SWITCH_L2','HP 5500HI 48G','JG312A','10.3.110.61',NULL,NULL,NULL,NULL,'COEUR','Mairie — Baie 2, distribution VLAN10','PROD'),
          ('S001B01','SWMAIRIEWIFI01',     'SWITCH_L2','HP 5500 Series',NULL,   '10.103.135.48',NULL,NULL,NULL,NULL,'COEUR','Mairie — WiFi 4ème étage','PROD'),
          -- Switch PRA distribution
          ('S064B01','SWROB-PRA-SERVEURS','SWITCH_L2','HP 5500HI 48G','JG312A','10.103.135.61',NULL,NULL,NULL,NULL,'COEUR','PRA — Baie 4, serveurs','PROD'),
          ('S064B01','SWES-ROBE-DIST01',  'SWITCH_L2','HP 1910 48G',  'JG540A','10.103.135.47',NULL,NULL,NULL,NULL,'COEUR','PRA — Baie 1, distribution VLAN10','PROD'),
          -- BOUCLE NORD
          ('S001B02','BN-COUTANT-M1',     'SWITCH_L2','HP 5500HI 48G','JG312A','10.103.135.11',NULL,NULL,2,1,'NORD','Coutant — Annexe','PROD'),
          ('S004B01','BN-CACHIN-M2',      'SWITCH_L2','HP 5500HI 48G','JG312A','10.103.135.11',NULL,NULL,2,2,'NORD','Cachin — 1er étage','PROD'),
          ('S022B01','BN-REGIE-M3',       'SWITCH_L2','HP 5500HI 48G','JG312A','10.103.135.11',NULL,NULL,2,3,'NORD','Ledru Rollin — Régie 1er étage','PROD'),
          ('S005B01','BN-CASA-M4',        'SWITCH_L2','HP 5500HI 48G','JG311A','10.103.135.11',NULL,NULL,2,4,'NORD','Casanova — Baie 3 LT','PROD'),
          ('S005B01','BN-CASA-M5',        'SWITCH_L2','HP 5500HI 48G','JG311A','10.103.135.11',NULL,NULL,2,5,'NORD','Casanova — Baie 3 LT','PROD'),
          -- BOUCLE SUD
          ('S007B01','BS-NERUDA-M1',      'SWITCH_L2','HP 5500HI 48G','JG312A','10.103.135.10',NULL,NULL,3,1,'SUD','Neruda — 1er étage','PROD'),
          ('S045B01','BS-JC-M2',          'SWITCH_L2','HP 5500HI 48G','JG312A','10.103.135.10',NULL,NULL,3,2,'SUD','JC — 1er Elem B','PROD'),
          ('S002B01','BS-CAT-M3',         'SWITCH_L2','HP 5500HI 48G','JG311A','10.103.135.10',NULL,NULL,3,3,'SUD','Saint-Just — CAT','PROD'),
          ('S002B01','BS-CAT-M4',         'SWITCH_L2','HP 5500HI 48G','JG311A','10.103.135.10',NULL,NULL,3,4,'SUD','Saint-Just — CAT','PROD'),
          -- Sites dépendants JC
          ('S045B01','SW-JC-SS',          'SWITCH_L2','SW SMC 24 ports',NULL,'10.103.148.53',NULL,NULL,NULL,NULL,'SUD','JC Sous-sol','PROD'),
          ('S036B07','SW-GAGARINE',        'SWITCH_L2',NULL,           NULL,'10.103.135.25',NULL,NULL,NULL,NULL,'SUD','MQ Gagarine','PROD'),
          ('S094B01','SW-PETIT-IVRY',      'SWITCH_L2',NULL,           NULL,'10.103.135.59',NULL,NULL,NULL,NULL,'SUD','MQ Petit Ivry','PROD'),
          ('S020B01','SW-CT-RIGAUD',       'SWITCH_L2',NULL,           NULL,'10.103.135.46',NULL,NULL,NULL,NULL,'SUD','CT Rigaud','PROD'),
          -- Équipements sécurité
          ('S005B01','SOPHOS-XG210-CASA',  'FIREWALL','Sophos XG210',  NULL,'86.65.184.173','C23076DGWJ3J980',NULL,NULL,NULL,'NORD','Casanova — EGIDE.LOCAL','PROD'),
          ('S001B01','SOPHOS-SG-MAIRIE',   'FIREWALL','Sophos SG',     NULL,NULL,NULL,NULL,NULL,NULL,'COEUR','Mairie — Internet/VPN RED','PROD'),
          -- Routeurs
          ('S005B01','ROUTEUR-SFR-CASA',   'ROUTEUR','Cisco 890',      NULL,'86.65.184.169',NULL,NULL,NULL,NULL,'NORD','Casanova — Internet SFR 30Mb','PROD'),
          ('S001B01','ROUTEUR-VPN-LINKT',  'ROUTEUR',NULL,             NULL,'10.103.50.100', NULL,NULL,NULL,NULL,'COEUR','Mairie — VPN LINKT 200Mb VRF Ecole','PROD'),
          ('S001B01','ROUTEUR-VPN-SIIM',   'ROUTEUR','Cisco 2600',     NULL,'10.100.101.48', NULL,NULL,NULL,NULL,'COEUR','Mairie — VPN SIIM','PROD'),
          ('S001B01','CISCO-SIIM',         'ROUTEUR','Cisco',          NULL,'10.103.110.6',  NULL,NULL,NULL,NULL,'COEUR','Mairie — Liaison SIIM GE0/1','PROD')
        `);

        // ── VLANs (référentiel complet) ──
        await client.query(`
          INSERT INTO hub_reseau.vlans (vlan_id, nom, description, adresse_ip, adresse_ip2, dhcp_relay, passerelle, usage, actif) VALUES
          (2,   'VLAN2-CAT',         'Réseau CAT',                            '10.103.100.9/24','10.103.101.9/24','10.103.130.142','10.103.100.9','UTILISATEURS',true),
          (3,   'VLAN3-CMS_LUXY',    'Réseau CMS & Luxy',                     '10.103.140.9/24',NULL,             '10.103.130.142','10.103.140.9','UTILISATEURS',true),
          (4,   'VLAN4-MEDIA',       'Réseau Médiathèque',                    '10.103.120.9/24',NULL,             '10.103.130.142','10.103.120.9','UTILISATEURS',true),
          (5,   'VLAN5-CASA',        'Réseau Casanova et sites dépendants',   '10.103.130.9/24','10.103.131.9/24','10.103.130.142','10.103.130.9','UTILISATEURS',true),
          (6,   'VLAN6-CACHIN',      'Réseau Cachin',                         '10.103.164.9/24',NULL,             '10.103.130.142','10.103.164.9','UTILISATEURS',true),
          (7,   'VLAN7-REGIE',       'Réseau Régie Ledru Rollin',             '10.103.161.9/24',NULL,             '10.103.130.142','10.103.161.9','UTILISATEURS',true),
          (8,   'VLAN8-NERUDA',      'Réseau Neruda',                         '10.103.152.9/24',NULL,             '10.103.130.142','10.103.152.9','UTILISATEURS',true),
          (9,   'VLAN9-JHACHETTE',   'Réseau J. Hachette / DDAC',             '10.103.115.9/24',NULL,             '10.103.130.142','10.103.115.9','UTILISATEURS',true),
          (10,  'VLAN10-MAIRIE',     'Réseau Mairie et sites dépendants',     '10.103.110.9/24','10.103.111.9/24','10.103.130.142','10.103.110.9','UTILISATEURS',true),
          (11,  'VLAN11-JC',         'Réseau Joliot-Curie et dépendants',     '10.103.148.9/24',NULL,             '10.103.130.142','10.103.148.9','UTILISATEURS',true),
          (12,  'VLAN12-CAT',        'Réseau CAT secondaire',                 '10.103.147.9/24',NULL,             '10.103.130.142','10.103.147.9','UTILISATEURS',true),
          (13,  'VLAN13-CASA',       'Réseau Casanova futur',                 '10.103.80.9/23', NULL,             '10.103.130.142','10.103.80.9', 'UTILISATEURS',true),
          (800, 'VLAN800-SECU',      'Contrôle d''accès transverse',          '10.103.250.0/24',NULL,             NULL,            NULL,          'SECURITE',    true),
          (810, 'VLAN810-INTVILLE',  'Internet Ville',                        '10.103.95.9/28', NULL,             NULL,            '10.103.95.9', 'INTERNET',    true),
          (840, 'VLAN840-ADMIN',     'Administration switches',               '10.103.135.9/24',NULL,             NULL,            '10.103.135.9','INFRASTRUCTURE',true),
          (850, 'VLAN850-INTD',      'Internet Direct GFU Sophos',            '10.103.252.0/23',NULL,             NULL,            NULL,          'INTERNET',    true),
          (860, 'VLAN860-VIDEO',     'Vidéoprotection',                       '10.103.251.9/24',NULL,             NULL,            '10.103.251.9','SECURITE',    true),
          (870, 'VLAN870-IvrEx',     'Réplication Exchange 2010 transverse',  NULL,             NULL,             NULL,            NULL,          'INFRASTRUCTURE',true),
          (871, 'VLAN871-REPNAS-FTP','Réplication NAS-FTP',                   NULL,             NULL,             NULL,            NULL,          'INFRASTRUCTURE',true),
          (872, 'VLAN872-REPNAS-VID','Réplication NAS-Vidéo',                 NULL,             NULL,             NULL,            NULL,          'INFRASTRUCTURE',true),
          (880, 'VLAN880-IPFX',      'Équipements IP Fixe (imprimantes)',     '10.103.90.9/23', NULL,             NULL,            '10.103.90.9', 'INFRASTRUCTURE',true),
          (890, 'VLAN890-MDT',       'Déploiement Système (MDT)',             '10.103.85.9/24', NULL,             NULL,            '10.103.85.9', 'INFRASTRUCTURE',true),
          (900, 'VLAN900-INTER',     'Accès Internet Direct Sophos',          '10.103.210.0/24',NULL,             NULL,            NULL,          'INTERNET',    true),
          (910, 'VLAN910-HSWIFI',    'Hotspot WiFi Sophos',                   '10.103.248.0/24',NULL,             NULL,            NULL,          'INTERNET',    true),
          (950, 'VLAN950-GFU-ECOL',  'Réseau Util. GFU DHCP Écoles',         NULL,             NULL,             NULL,            NULL,          'ECOLES',      true),
          (951, 'VLAN951-GFU-VPN',   'VPN Serveurs Écoles GFU',              '10.103.50.101/24',NULL,            NULL,            NULL,          'ECOLES',      true),
          (1099,'VLAN1099-TOIP',     'VRF ToIP LINKT',                        '10.203.99.15',   NULL,             NULL,            NULL,          'VOIP',        true)
        `);

        // ── Liaisons FO (brassages optiques détaillés) ──
        await client.query(`
          INSERT INTO hub_reseau.liaisons_fo (site_a, site_b, libelle, paires, boite_jonction, capacite, boucle, statut) VALUES
          -- Cœur ↔ PRA
          ('S001B01','S064B01','MAIRIE ↔ ESP ROBESPIERRE',       'Paire 22-23',   NULL,    '40G', 'COEUR','ACTIF'),
          -- Boucle Nord — IRF ring
          ('S001B01','S001B02','MAIRIE ↔ COUTANT',               'Paires 7-8 (via MAIRIE), 11-12 (MAIRIE→COUTANT)',NULL,'10G','NORD','ACTIF'),
          ('S001B02','S016B01','COUTANT ↔ LUXY',                 'Paires 3-4',    NULL,    '10G', 'NORD','ACTIF'),
          ('S016B01','S004B01','LUXY ↔ CACHIN',                  'Paires 3-4',    NULL,    '10G', 'NORD','ACTIF'),
          ('S004B01','S022B01','CACHIN ↔ REGIE LT 1er étage',    'Paires 3-4',    NULL,    '10G', 'NORD','ACTIF'),
          ('S022B01','S005B01','REGIE ↔ CASANOVA (via GP)',       'Paires 3-4',    'Mater Gabriel Péri','10G','NORD','ACTIF'),
          ('S005B01','S001B01','CASANOVA ↔ MAIRIE',               'Paires 9-10',   NULL,    '10G', 'NORD','ACTIF'),
          -- Boucle Nord — accès dépendants
          ('S005B01','S013B01','CASANOVA ↔ MÉDIATHÈQUE',          'Paires 1-2',    NULL,    '1G',  'NORD','ACTIF'),
          -- Boucle Sud — IRF ring
          ('S001B01','S007B01','MAIRIE ↔ NERUDA',                 'Paires 15-16 (FO Mairie 13-14 → Neruda paire 8)','Mairie Jarretières','10G','SUD','ACTIF'),
          ('S007B01','S045B01','NERUDA ↔ JC (1er Elem B)',        'Paires 15-16',  'FO SS JC 11-12 (paire 6)','10G','SUD','ACTIF'),
          ('S045B01','S002B01','JC ↔ CAT (St Just)',              'Paires 7-8',    'SS JC jarret. paires 13-14 (paire 7)','10G','SUD','ACTIF'),
          ('S002B01','S001B01','CAT ↔ MAIRIE',                    'Paire 6 (CAT-MAIRIE) / Paire 20 (MAIRIE-ESP ROB)','Mairie Jarretières','10G','SUD','ACTIF'),
          -- JC dépendants (Boucle Sud)
          ('S045B01','S092B01','JC ↔ GYMNASE LÉNINE',             'LTB 2eme 17-18 (paires 7-8 JC→Lénine)',NULL,'1G','SUD','ACTIF'),
          ('S045B01','S036B07','JC ↔ MQ GAGARINE',               'LTB 2eme 15-16 (paires 1-2 JC→MQ Gagarine)',NULL,'1G','SUD','ACTIF'),
          ('S092B01','S049B01','LÉNINE ↔ ORME AU CHAT',           'Paires 7-8',    NULL,    '1G',  'SUD','ACTIF'),
          ('S092B01','S094B01','LÉNINE ↔ MQ PETIT IVRY',          'Paires 3-4',    NULL,    '1G',  'SUD','ACTIF'),
          ('S049B01','S017B01','ORME AU CHAT ↔ CHEVALERET',       'Paires 11-12',  NULL,    '1G',  'SUD','ACTIF'),
          ('S049B01','S021B01','ORME AU CHAT ↔ CT GUILLOU',        'Paires 1-2',    NULL,    '1G',  'SUD','ACTIF'),
          ('S017B01','S020B01','CHEVALERET ↔ CT RIGAUD',           'Paires 11-12',  NULL,    '1G',  'SUD','ACTIF'),
          -- Lien Laser (JC → Manufacture des Œillets = CREDAC)
          ('S045B01','S019B01','JC ↔ MANUFACTURE DES ŒILLETS (Laser)',NULL,NULL,'100M','SUD','ACTIF')
        `);

        // ── Liens réseau principaux (backbone) ──
        await client.query(`
          INSERT INTO hub_reseau.network_links (site_a, site_b, type, capacity, is_loop, is_redundant, bag_id, fo_pairs, port_a, port_b, vlan_trunk, notes, irf_stack_id) VALUES
          -- Backbone cœur ↔ PRA (40G DAC)
          ('S001B01','S064B01','FIBRE','40G',false,true,'HUND1/0/53-54','Paire 22-23','HUND1/0/53','HUND3/0/53','5,6,7,10,13,800,840,850,860,870,880,890,900,910,950','DAC 40Gb IRF cœur',1),
          -- Boucle Nord (BAGG5 2×10G vers cœur)
          ('S001B01','S001B02','FIBRE','10G',true,false,'BAGG5','Paires 7-8 / 11-12','Ten1/0/1','Ten1/1/1','5,6,7,10,13,800,810,840,850,860,870,880,890,900,910,950','LACP 2×10Gb Boucle Nord',2),
          ('S001B02','S016B01','FIBRE','10G',true,false,NULL,'Paires 3-4','Ten1/0/53','Ten1/0/53',NULL,'FO COUTANT ↔ LUXY',2),
          ('S016B01','S004B01','FIBRE','10G',true,false,NULL,'Paires 3-4','Ten2/0/53','Ten2/0/53',NULL,'FO CACHIN ↔ LUXY',2),
          ('S004B01','S022B01','FIBRE','10G',true,false,NULL,'Paires 3-4','Ten2/0/53','Ten3/0/53',NULL,'FO REGIE ↔ CACHIN',2),
          ('S022B01','S005B01','FIBRE','10G',true,false,NULL,'Paires 3-4','Ten3/0/53','Ten4/0/54',NULL,'FO CASANOVA ↔ REGIE (via Mater Gabriel Péri)',2),
          ('S005B01','S001B01','FIBRE','10G',true,false,'BAGG5','Paires 9-10','Ten5/1/1','Ten3/0/1','5,6,7,10,13,800,810,840,850,860,870,880,890,900,910,950','FO CASANOVA ↔ MAIRIE (BAGG5)',2),
          -- Dépendant Boucle Nord
          ('S005B01','S013B01','FIBRE','1G',false,false,NULL,'Paires 1-2',NULL,NULL,'4,800,840,850,900','FO CASANOVA ↔ MEDIATHÈQUE',2),
          -- Boucle Sud (BAG4 2×10G vers cœur)
          ('S001B01','S007B01','FIBRE','10G',true,false,'BAG4','Paires 15-16','Ten2/0/1','Ten1/0/54','8,11,800,840,850,860,900,910,950','LACP 2×10Gb Boucle Sud – Neruda',3),
          ('S007B01','S045B01','FIBRE','10G',true,false,NULL,'Paires 15-16',NULL,'Ten2/0/53','11,800,840,850,860,900,950','FO NERUDA ↔ JC (1er Elem B)',3),
          ('S045B01','S002B01','FIBRE','10G',true,false,NULL,'Paires 7-8',NULL,'Ten4/1/1','2,800,840,850,860,900,910,950','FO JC ↔ CAT via SS JC paires 13-14',3),
          ('S002B01','S001B01','FIBRE','10G',true,false,'BAG4','Paire 6','Ten4/1/1','Ten4/0/1','2,800,840,850,860,900,910,950','FO CAT ↔ MAIRIE (BAG4)',3),
          -- Dépendants Boucle Sud (JC)
          ('S045B01','S092B01','FIBRE','1G',false,false,NULL,'LTB 2eme 17-18',NULL,NULL,'11','JC ↔ Gymnase Lénine',3),
          ('S045B01','S036B07','FIBRE','1G',false,false,NULL,'LTB 2eme 15-16',NULL,NULL,'11','JC ↔ MQ Gagarine',3),
          ('S092B01','S049B01','FIBRE','1G',false,false,NULL,'Paires 7-8',NULL,NULL,'11','Lénine ↔ Orme au Chat',3),
          ('S092B01','S094B01','FIBRE','1G',false,false,NULL,'Paires 3-4',NULL,NULL,'11','Lénine ↔ MQ Petit Ivry',3),
          ('S049B01','S017B01','FIBRE','1G',false,false,NULL,'Paires 11-12',NULL,NULL,'11','Orme au Chat ↔ Chevaleret',3),
          ('S049B01','S021B01','FIBRE','1G',false,false,NULL,'Paires 1-2',NULL,NULL,'10','Orme au Chat ↔ CT Guillou',3),
          ('S017B01','S020B01','FIBRE','1G',false,false,NULL,'Paires 11-12',NULL,NULL,'11','Chevaleret ↔ CT Rigaud',3),
          -- Lien Laser
          ('S045B01','S019B01','LASER','100M',false,false,NULL,NULL,NULL,NULL,'11','Liaison Laser JC ↔ Manufacture des Œillets (CREDAC)',NULL)
        `);

        // ── Accès WAN sites isolés ──
        await client.query(`
          INSERT INTO hub_reseau.network_access (site_code, type, operator, mode, bandwidth, carries_voice, comment) VALUES
          ('S028','ADSL','OTHER','INTERNET','20M',false,'Centre vacances Hery sur Ugine'),
          ('S027','3G','OTHER','BACKUP','?',false,'Centre vacances Les Mathes – 3G/4G'),
          ('S019B01','SDSL','OTHER','VPN','1M',false,'Manufacture des Œillets – SDSL 1M'),
          ('S079','SDSL','OTHER','VPN','1M',false,'Multi-Accueil Ada Lovelace – SDSL 1M'),
          ('S075','SDSL','OTHER','VPN','1M',false,'RAM Hartmann – SDSL 1M'),
          ('S141','SDSL','OTHER','VPN','1M',false,'Multi-accueil Maria Merian – SDSL 1M'),
          ('S038','ADSL','OTHER','VPN','?',false,'RAM Parmentier – ADSL'),
          ('S051','SDSL','OTHER','VPN','4M',false,'École Jacques Prévert – SDSL 4M'),
          ('S096','ADSL','OTHER','INTERNET','?',false,'Gymnase des Épinettes – ADSL'),
          ('S040','ADSL','OTHER','INTERNET','?',false,'Halte Garderie du Moulin – ADSL'),
          ('S104','ADSL','OTHER','INTERNET','?',false,'Stade de Gournay – ADSL'),
          ('S105','ADSL','OTHER','INTERNET','?',false,'Stade des Lilas – ADSL'),
          -- Écoles sur FO MPLS LINKT VRF ECOLE
          ('S041','FIBRE','LINKT','MPLS','100M',false,'GS Rosalind Franklin – Fibre 100Mb'),
          ('S042','FIBRE','LINKT','MPLS','100M',false,'GS Rosa Parks – Fibre 100Mb'),
          ('S043','FIBRE','LINKT','MPLS','100M',false,'GS Barbusse – Fibre 100Mb'),
          ('S048','FIBRE','LINKT','MPLS','100M',false,'École Dulcie September – Fibre 100Mb'),
          ('S056','FIBRE','LINKT','MPLS','100M',false,'École Maurice Thorez – Fibre 100Mb'),
          ('S037','FIBRE','LINKT','MPLS','100M',false,'Crèche Rosa Bonheur – Fibre 100Mb'),
          ('S058','FIBRE','LINKT','MPLS','100M',false,'MQ Monmousseau – Fibre 100Mb'),
          ('S094','FIBRE','LINKT','MPLS','100M',false,'Gymnase PMC – Fibre 100Mb'),
          ('S046','FIBRE','LINKT','MPLS','100M',false,'GS Langevin VLAN194'),
          ('S225','FIBRE','LINKT','MPLS','100M',false,'Complexe Sportif Alice Milliat – Fibre 2/100Mb'),
          -- WAN opérateurs (accès externes)
          ('S001B01','OPERATEUR','SFR','INTERNET','500M',false,'Internet + VPN RED – FO 500Mb Mairie + 2×ADSL 20Mb PRA'),
          ('S005B01','OPERATEUR','SFR','INTERNET','30M',false,'Internet SFR FO 30Mb Casanova (CISCO 890 86.65.184.169)'),
          ('S001B01','OPERATEUR','LINKT','MPLS','200M',true,'VPN MPLS LINKT FO 200Mb VRF DATA/ECOLES/TOIP')
        `);

        // ── Fourreaux FO ──
        await client.query(`
          INSERT INTO hub_reseau.ducts (name, status, capacity, used_capacity) VALUES
          ('FO_Boucle_Nord',    'OCCUPE', 48, 40),
          ('FO_Boucle_Sud',     'OCCUPE', 48, 44),
          ('FO_Cœur_PRA',       'OCCUPE', 24, 16),
          ('FO_JC_Dependants',  'OCCUPE', 24, 20),
          ('FO_Reserve_Nord',   'LIBRE',  24,  0),
          ('FO_Reserve_Sud',    'LIBRE',  24,  0)
        `);

        console.log('[PG DB] hub_reseau seed v2 (DIP) inséré');
      }
      console.log('[PG DB] hub_reseau schema v2 OK');
    } catch (e) {
      console.error('[PG DB] hub_reseau init error:', e.message);
    }

    // DSI Dashboard module
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.dsi_dashboards (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'Mon tableau de bord',
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE hub.dsi_dashboards ADD COLUMN IF NOT EXISTS is_rotating BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE hub.dsi_dashboards ADD COLUMN IF NOT EXISTS rotation_seconds INT NOT NULL DEFAULT 30`);
    await client.query(`ALTER TABLE hub.dsi_dashboards ADD COLUMN IF NOT EXISTS rotation_order INT NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE hub.dsi_dashboards ADD COLUMN IF NOT EXISTS rotation_filter JSONB NOT NULL DEFAULT '{}'`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.dsi_dashboard_widgets (
        id SERIAL PRIMARY KEY,
        dashboard_id INT NOT NULL REFERENCES hub.dsi_dashboards(id) ON DELETE CASCADE,
        widget_key TEXT NOT NULL,
        pos_x INT NOT NULL DEFAULT 0,
        pos_y INT NOT NULL DEFAULT 0,
        width INT NOT NULL DEFAULT 6,
        height INT NOT NULL DEFAULT 4,
        config_json JSONB NOT NULL DEFAULT '{}'
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.dsi_dashboard_subscriptions (
        id SERIAL PRIMARY KEY,
        dashboard_id INT NOT NULL REFERENCES hub.dsi_dashboards(id) ON DELETE CASCADE,
        frequency TEXT NOT NULL DEFAULT 'weekly',
        send_hour INT NOT NULL DEFAULT 7,
        send_day INT NOT NULL DEFAULT 1,
        emails TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT true,
        last_sent_at TIMESTAMPTZ,
        UNIQUE(dashboard_id)
      )
    `);

    // ── Base documentaire tickets ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.knowledge_documents (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category_id INT REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mimetype TEXT,
        size_bytes BIGINT,
        uploaded_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Association optionnelle à un logiciel métier (magapp.apps)
    await client.query(`ALTER TABLE hub_tickets.knowledge_documents ADD COLUMN IF NOT EXISTS app_id INT`);

    // ── Réponses auto aux tickets ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_tickets.response_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        message TEXT NOT NULL,
        category_id INT REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL,
        subcategory_id INT REFERENCES hub_tickets.ticket_categories(id) ON DELETE SET NULL,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── hub_deploiements — Fiches de déploiement parc informatique ────────────
    await client.query('CREATE SCHEMA IF NOT EXISTS hub_deploiements;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub_deploiements.fiches (
        id SERIAL PRIMARY KEY,
        fichier TEXT,
        fichier_lie TEXT,
        date_deploiement DATE,
        beneficiaire TEXT,
        direction TEXT,
        service TEXT,
        site TEXT,
        installateur TEXT,
        type_operation TEXT,
        uc_nouveau_num TEXT,
        uc_nouveau_serie TEXT,
        uc_nouveau_modele TEXT,
        uc_recupere_num TEXT,
        uc_recupere_serie TEXT,
        uc_recupere_modele TEXT,
        ecran1_nouveau_num TEXT,
        ecran1_nouveau_serie TEXT,
        ecran1_nouveau_modele TEXT,
        ecran1_recupere_num TEXT,
        ecran1_recupere_serie TEXT,
        ecran1_recupere_modele TEXT,
        ecran2_nouveau_serie TEXT,
        ecran2_nouveau_modele TEXT,
        autre_designation TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_fiches_date ON hub_deploiements.fiches(date_deploiement)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_fiches_direction ON hub_deploiements.fiches(direction)'); } catch (e) {}
    try { await client.query('CREATE INDEX IF NOT EXISTS idx_fiches_uc_nouveau_num ON hub_deploiements.fiches(uc_nouveau_num)'); } catch (e) {}
    // Colonnes ajoutées pour l'import du fichier deploy.xlsx (synthèse des déploiements)
    const alters = [
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'fiches'`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS quantite INTEGER`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS materiel_type TEXT`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS annee_materiel INTEGER`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS neuf_reco TEXT`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS type_flux TEXT`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS est_ordi BOOLEAN`,
      `ALTER TABLE hub_deploiements.fiches ADD COLUMN IF NOT EXISTS materiel_refs TEXT`,
    ];
    for (const sql of alters) { try { await client.query(sql); } catch (e) {} }

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
