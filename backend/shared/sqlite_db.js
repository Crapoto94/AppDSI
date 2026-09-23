const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function setupDb() {
    const dbDir = path.join(__dirname, '..', 'data');
    require('fs').mkdirSync(dbDir, { recursive: true });

    const db = await open({
        filename: path.join(dbDir, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA busy_timeout = 30000');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            is_approved INTEGER DEFAULT 0,
            service_code TEXT,
            service_complement TEXT,
            email TEXT,
            displayName TEXT,
            last_activity DATETIME
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            libelle TEXT,
            content TEXT
        );

        CREATE TABLE IF NOT EXISTS user_tiles (
            user_id INTEGER,
            tile_id INTEGER,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (tile_id) REFERENCES tiles (id)
        );

        CREATE TABLE IF NOT EXISTS tile_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            icon TEXT,
            description TEXT,
            url TEXT,
            tile_id INTEGER,
            FOREIGN KEY (tile_id) REFERENCES tiles (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            icon TEXT,
            description TEXT,
            url TEXT,
            status TEXT DEFAULT 'active',
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS oracle_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT UNIQUE,
            host TEXT,
            port TEXT,
            service_name TEXT,
            username TEXT,
            password TEXT,
            is_enabled INTEGER DEFAULT 0
        );


        CREATE TABLE IF NOT EXISTS oracle_sync_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            table_name TEXT,
            where_clause TEXT,
            config_json TEXT,
            UNIQUE(type, table_name)
        );

        CREATE TABLE IF NOT EXISTS column_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT,
            column_key TEXT,
            label TEXT,
            is_visible INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            color TEXT,
            is_bold INTEGER DEFAULT 0,
            is_italic INTEGER DEFAULT 0,
            UNIQUE(page, column_key)
        );

        CREATE TABLE IF NOT EXISTS glpi_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT,
            app_token TEXT,
            user_token TEXT,
            login TEXT,
            password TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        -- GLPI 10 : apirest.php (App-Token + User-Token), pour la synchro du parc
        CREATE TABLE IF NOT EXISTS glpi10_settings (
            id INTEGER PRIMARY KEY,
            url TEXT,
            token TEXT,
            user_token TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS email_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            label TEXT,
            context TEXT,
            subject TEXT,
            body TEXT
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE,
            setting_value TEXT,
            description TEXT
        );

        INSERT OR IGNORE INTO app_settings (setting_key, setting_value, description)
        VALUES 
        ('budget_principal', '00001000000000001901000', 'Code du budget principal'),
        ('url_sedit_fi', 'https://seditgfprod.ivry.local/SeditGfSMProd', 'URL de base Sedit Finances'),
        ('groq_api_key', '', 'Clé API Groq pour les résumés'),
        ('ai_provider', 'groq', 'Fournisseur d''IA par défaut'),
        ('gemini_api_key', '', 'Clé API Google Gemini'),
        ('openrouter_api_key', '', 'Clé API OpenRouter'),
        ('anthropic_api_key', '', 'Clé API Anthropic'),
        ('ollama_host', 'http://localhost:11434', 'Hôte Ollama local'),
        ('anthropic_model', 'claude-3-5-sonnet-20240620', 'Modèle Anthropic par défaut'),
        ('app_base_url', '', 'URL de base de l''application (ex: https://dsihub.ivry.local)'),
        ('inventaire_ip', '10.103.130.95', 'Adresse IP du serveur d''inventaire'),
        ('inventaire_key', 'irs_hjThyQcvBMYvkWqvkA5NVapTB4EZctrOeUI1eoaE-dU', 'Clé API pour l''inventaire'),
        ('finance.share_root_path', '//seditgf-prod/editions$/SMPROD/eGF/pjust', 'Racine UNC du partage de pièces jointes Sedit Finances (eGF/pjust) — slashes acceptés, convertis en antislash'),
        ('finance.share_login', '', 'Compte dédié pour accéder au partage de pièces jointes Sedit Finances (si vide : repli sur le compte de sauvegarde storage.login)'),
        ('finance.share_domain', 'IVRY', 'Domaine du compte dédié Sedit Finances (requis par seditgf-prod, sinon lecture silencieusement vide)');

        CREATE TABLE IF NOT EXISTS ad_settings (
            id INTEGER PRIMARY KEY,
            is_enabled INTEGER DEFAULT 0,
            host TEXT DEFAULT '',
            port INTEGER DEFAULT 389,
            base_dn TEXT DEFAULT '',
            required_group TEXT DEFAULT '',
            bind_dn TEXT DEFAULT '',
            bind_password TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO ad_settings (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS azure_ad_settings (
            id INTEGER PRIMARY KEY,
            is_enabled INTEGER DEFAULT 0,
            tenant_id TEXT DEFAULT '',
            client_id TEXT DEFAULT '',
            client_secret TEXT DEFAULT '',
            redirect_uri TEXT DEFAULT '',
            mailbox TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO azure_ad_settings (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS frizbi_settings (
            id INTEGER PRIMARY KEY,
            is_enabled INTEGER DEFAULT 0,
            api_url TEXT DEFAULT 'https://apiv2.frizbi.evolnet.fr',
            client_id TEXT DEFAULT '',
            client_secret TEXT DEFAULT '',
            sender_id TEXT DEFAULT 'IVRY',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO frizbi_settings (id, is_enabled) VALUES (1, 0);

        CREATE TABLE IF NOT EXISTS o365_settings (
            id INTEGER PRIMARY KEY,
            is_enabled INTEGER DEFAULT 0,
            tenant_id TEXT DEFAULT '',
            client_id TEXT DEFAULT '',
            client_secret TEXT DEFAULT '',
            mailbox TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO o365_settings (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS mail_settings (
            id INTEGER PRIMARY KEY,
            smtp_host TEXT,
            smtp_port INTEGER,
            smtp_user TEXT,
            smtp_pass TEXT,
            smtp_secure TEXT,
            proxy_host TEXT,
            proxy_port INTEGER,
            sender_email TEXT,
            sender_name TEXT,
            api_key TEXT,
            template_html TEXT,
            global_enable INTEGER DEFAULT 1,
            use_api INTEGER DEFAULT 1,
            api_url TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO mail_settings (id, sender_name, template_html, global_enable, use_api) 
        VALUES (1, 'DSI Hub', '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<body style="margin: 0; padding: 0; min-width: 100%; background-color: #f4f7f9; font-family: ''Segoe UI'', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" bgcolor="#f4f7f9" border="0" cellpadding="0" cellspacing="0" style="background-color: #f4f7f9;">
    <tr>
        <td style="padding: 40px 0;">
            <table align="center" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 750px;">
                <!-- Header / Logo -->
                <tr>
                    <td align="center" style="padding-bottom: 30px;">
                        <img src="Ivry.png" width="180" border="0" alt="Ivry s/ Seine" style="display: block;" />
                        <div style="font-size: 18px; font-weight: 700; color: #1a202c; margin-top: 10px;">Ville d''Ivry-sur-seine</div>
                    </td>
                </tr>
                <!-- Content Area -->
                <tr>
                    <td bgcolor="#ffffff" style="background-color: #ffffff; padding: 40px; border: 1px solid #e1e7ed; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 100%; table-layout: fixed;">
                            <tr>
                                <td style="font-size: 16px; line-height: 1.6; color: #2d3748; width: 100%; max-width: 100%;">
                                    {{content}}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <!-- Footer area -->
                <tr>
                    <td align="center" style="padding: 30px;">
                        <!-- Accent Line -->
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td height="4" style="height: 4px; background: linear-gradient(to right, #e53e3e, {{footerColor}}); border-radius: 2px;"></td>
                            </tr>
                        </table>
                        <br />
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td align="center" style="color: #718096; font-size: 13px; line-height: 20px;">
                                    <div style="text-transform: uppercase; letter-spacing: 1.2px; font-weight: 800; color: {{footerColor}}; font-size: 11px; margin-bottom: 5px;">{{footer1}}</div>
                                    <div style="font-weight: 600; color: #4a5568;">{{footer2}}</div>
                                    <div>{{footer3}}</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    </table>
</body>
</html>', 1, 1);

        CREATE TABLE IF NOT EXISTS postgres_settings (
            id INTEGER PRIMARY KEY,
            is_enabled INTEGER DEFAULT 1,
            host TEXT DEFAULT '10.103.130.106',
            port INTEGER DEFAULT 5432,
            database TEXT DEFAULT 'ivry_admin',
            username TEXT DEFAULT 'postgres',
            password TEXT DEFAULT 'ivrypassword',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO postgres_settings (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS mariadb_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT UNIQUE,
            host TEXT,
            port INTEGER DEFAULT 3306,
            user TEXT,
            password TEXT,
            database TEXT,
            is_enabled INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO mariadb_settings (type, host, port, user, password, database, is_enabled)
        VALUES
        ('MAIN', '', 3306, '', '', '', 0);

    `);

    try {
        const result = await db.all("PRAGMA table_info(users)");
        const hasEmailColumn = result.some(col => col.name === 'email');
        if (!hasEmailColumn) {
            await db.exec('ALTER TABLE users ADD COLUMN email TEXT');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(tiles)");
        const hasIsPublicColumn = result.some(col => col.name === 'is_public');
        if (!hasIsPublicColumn) {
            await db.exec('ALTER TABLE tiles ADD COLUMN is_public INTEGER DEFAULT 0');
        }
    } catch (e) {}

    // Ajout de la colonne is_module pour les tuiles module
    try {
        const result = await db.all("PRAGMA table_info(tiles)");
        const hasIsModule = result.some(col => col.name === 'is_module');
        if (!hasIsModule) {
            await db.exec('ALTER TABLE tiles ADD COLUMN is_module INTEGER DEFAULT 0');
        }
        const hasModuleKey = result.some(col => col.name === 'module_key');
        if (!hasModuleKey) {
            await db.exec('ALTER TABLE tiles ADD COLUMN module_key TEXT');
        }
    } catch (e) {}

    // Migration oracle_settings : l'ancienne table était verrouillée par
    // CHECK (id IN (1, 2)) — impossible d'y ajouter une 3ᵉ connexion (DELIB).
    // SQLite ne sait pas retirer une contrainte CHECK : on reconstruit la table
    // (idempotent : ne fait rien si la contrainte a déjà disparu).
    try {
        const tbl = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='oracle_settings'");
        if (tbl && /CHECK\s*\(\s*id\s+IN\s*\(\s*1\s*,\s*2\s*\)\s*\)/i.test(tbl.sql)) {
            await db.exec(`
                CREATE TABLE oracle_settings_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT UNIQUE,
                    host TEXT,
                    port INTEGER,
                    service_name TEXT,
                    username TEXT,
                    password TEXT,
                    is_enabled INTEGER DEFAULT 0
                );
                INSERT INTO oracle_settings_new (id, type, host, port, service_name, username, password, is_enabled)
                    SELECT id, type, host, port, service_name, username, password, is_enabled FROM oracle_settings;
                DROP TABLE oracle_settings;
                ALTER TABLE oracle_settings_new RENAME TO oracle_settings;
            `);
            console.log('[DB Migration] oracle_settings : contrainte CHECK (id IN (1,2)) supprimée');
        }
    } catch (e) {
        console.warn('[DB Migration] oracle_settings rebuild:', e.message);
    }

    // Seed des tuiles module depuis le registre
    try {
        const { MODULES_REGISTRY } = require('./modules-registry');
        for (const mod of MODULES_REGISTRY) {
            const existing = await db.get('SELECT id FROM tiles WHERE module_key = ?', [mod.key]);
            if (!existing) {
                const maxOrder = await db.get('SELECT MAX(sort_order) as m FROM tiles');
                const result = await db.run(
                    'INSERT INTO tiles (title, icon, description, status, sort_order, is_public, is_module, module_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [mod.title, mod.icon, mod.description, 'active', (maxOrder?.m || 0) + 1, mod.is_public ? 1 : 0, 1, mod.key]
                );
                await db.run(
                    'INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)',
                    [result.lastID, 'Ouvrir', mod.url, 1]
                );
                console.log(`[DB Migration] Tuile module créée: ${mod.key}`);
            }
        }
    } catch (e) {
        console.warn('[DB Migration] Erreur seed tuiles module:', e.message);
    }

    // GLPI Settings migrations
        try { await db.exec("ALTER TABLE glpi_settings ADD COLUMN login TEXT"); } catch (e) {}
    try { await db.run("ALTER TABLE glpi_settings ADD COLUMN password TEXT"); } catch (e) {}
    // GLPI 10 : token de session (user_token) en plus de l'App-Token
    try { await db.run("ALTER TABLE glpi10_settings ADD COLUMN user_token TEXT"); } catch (e) {}

    // PostgreSQL Settings migrations
    try { await db.run("ALTER TABLE postgres_settings ADD COLUMN ssl_mode TEXT DEFAULT 'disable'"); } catch (e) {}
    try { await db.run("ALTER TABLE postgres_settings ADD COLUMN connect_timeout INTEGER DEFAULT 10"); } catch (e) {}
    try { await db.run("ALTER TABLE postgres_settings ADD COLUMN application_name TEXT DEFAULT 'DSIHub'"); } catch (e) {}
    try { await db.run("ALTER TABLE postgres_settings ADD COLUMN schema_name TEXT DEFAULT 'public'"); } catch (e) {}

    // Azure AD Settings migration — ajout mailbox pour fusion o365_settings
    try { await db.run("ALTER TABLE azure_ad_settings ADD COLUMN mailbox TEXT DEFAULT ''"); } catch (e) {}

    // Template email global : le lien de secours en clair ("Ou copiez ce lien")
    // débordait sans retour à la ligne sur certains clients mail (Outlook) faute
    // d'un word-break assez agressif. Idempotent : ne touche rien si le template
    // a déjà été mis à jour ou totalement personnalisé sans cette chaîne exacte.
    try {
        await db.run("UPDATE mail_settings SET template_html = REPLACE(template_html, 'word-break: break-word', 'word-break: break-all') WHERE template_html LIKE '%word-break: break-word%'");
    } catch (e) {}


    try {
        // Migrate old 'admin' role → 'superadmin' (the new 'admin' role is a limited admin)
        await db.run("UPDATE users SET role = 'superadmin' WHERE role = 'admin'");
        await db.run("UPDATE users SET is_approved = 1, role = 'superadmin' WHERE LOWER(username) = 'admin'");
    } catch (e) {}

    return db;
}

module.exports = setupDb;
