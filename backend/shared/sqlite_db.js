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

    const gfDbPath = path.join(dbDir, 'oracle_gf.sqlite');
    const rhDbPath = path.join(dbDir, 'oracle_rh.sqlite');

    try {
        await db.exec(`ATTACH DATABASE '${gfDbPath}' AS gf`);
    } catch (e) {
        console.warn('[DB] Could not attach gf database:', e.message);
    }

    try {
        await db.exec(`ATTACH DATABASE '${rhDbPath}' AS rh`);
    } catch (e) {
        console.warn('[DB] Could not attach rh database:', e.message);
    }

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

        CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            username TEXT
        );

        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_type TEXT,
            target_id TEXT,
            file_path TEXT,
            original_name TEXT,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            username TEXT
        );

        CREATE TABLE IF NOT EXISTS m57_plan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            label TEXT,
            section TEXT,
            type TEXT
        );

        CREATE TABLE IF NOT EXISTS access_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            requested_tiles TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
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

        CREATE TABLE IF NOT EXISTS budget_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "C. Fonction" TEXT, "C. Nature" TEXT, "Libellé Fonction" TEXT, "Libellé Nature" TEXT,
            "JE" TEXT, "Budget voté" REAL, "Disponible" REAL, "Mt. prévision" REAL,
            "Mt. pré-engagé" REAL, "Mt. engagé" REAL, "Mt. facturé" REAL,
            "Mt. pré-mandaté" REAL, "Mt. mandaté" REAL, "Mt. payé" REAL,
            year INTEGER, allocated_amount REAL
        );

        CREATE TABLE IF NOT EXISTS oracle_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT UNIQUE,
            host TEXT,
            port TEXT,
            sid TEXT,
            user TEXT,
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

        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Annee INTEGER,
            numero INTEGER,
            Libelle TEXT
        );

        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            budget_id INTEGER,
            CODE_FONCTION TEXT,
            LIBELLE TEXT,
            montant_prevu REAL DEFAULT 0,
            used_amount REAL DEFAULT 0,
            Section TEXT,
            FOREIGN KEY (budget_id) REFERENCES budgets (id)
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

        CREATE TABLE IF NOT EXISTS tiers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            nom TEXT,
            activite TEXT,
            siret TEXT,
            adresse TEXT,
            banque TEXT,
            guichet TEXT,
            compte TEXT,
            cle_rib TEXT,
            is_dsi INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tier_id INTEGER,
            name TEXT,
            role TEXT,
            email TEXT,
            phone TEXT,
            is_order_recipient INTEGER DEFAULT 0,
            FOREIGN KEY (tier_id) REFERENCES tiers (id) ON DELETE CASCADE
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

        CREATE TABLE IF NOT EXISTS glpi_observers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            name TEXT,
            login TEXT,
            email TEXT,
            is_active INTEGER DEFAULT 1,
            last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticket_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS email_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            label TEXT,
            context TEXT,
            subject TEXT,
            body TEXT
        );

        CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT,
            request_date DATE,
            beneficiary_name TEXT,
            beneficiary_email TEXT,
            product_code TEXT,
            product_label TEXT,
            file_path TEXT,
            expiry_date DATE,
            sedit_number TEXT DEFAULT '',
            is_provisional INTEGER,
            observations TEXT DEFAULT '',
            renewal_status TEXT DEFAULT NULL,
            renewal_comment TEXT DEFAULT '',
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tier_stats (
            tier_id INTEGER PRIMARY KEY,
            order_count INTEGER DEFAULT 0,
            invoice_count INTEGER DEFAULT 0,
            FOREIGN KEY(tier_id) REFERENCES tiers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "Collectivité" TEXT, "Budget" TEXT, "Exercice" TEXT, 
            "N° Facture interne" TEXT, "N° Facture fournisseur" TEXT,
            "Fournisseur" TEXT, "Libellé" TEXT, "Emission" DATE,
            "Montant HT" REAL, "Montant TVA" REAL, "Montant TTC" REAL,
            "Date Paiement" DATE, "N° Mandat" TEXT, "N° Bordereau" TEXT,
            "Statut" TEXT, "Article par nature" TEXT, "Article par fonction" TEXT,
            operation_id INTEGER, budgetId INTEGER, COMMANDE_ROO_IMA_REF TEXT,
            FOREIGN KEY (operation_id) REFERENCES operations (id)
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
        ('groq_api_key', 'gsk_h67R9mK9v8f4H7j2L3k5M1n0P9q8R7s6T5u4V3w2X1y0', 'Clé API Groq pour les résumés'),
        ('ai_provider', 'groq', 'Fournisseur d''IA par défaut'),
        ('gemini_api_key', '', 'Clé API Google Gemini'),
        ('openrouter_api_key', '', 'Clé API OpenRouter'),
        ('anthropic_api_key', '', 'Clé API Anthropic'),
        ('ollama_host', 'http://localhost:11434', 'Hôte Ollama local'),
        ('anthropic_model', 'claude-3-5-sonnet-20240620', 'Modèle Anthropic par défaut');

        CREATE TABLE IF NOT EXISTS rh.ad_proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matricule TEXT,
            ad_username TEXT,
            score INTEGER,
            status TEXT DEFAULT 'pending',
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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

        CREATE TABLE IF NOT EXISTS rh_sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_type TEXT,
            status TEXT,
            message TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            username TEXT
        );

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
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td style="font-size: 16px; line-height: 1.6; color: #2d3748;">
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

        CREATE TABLE IF NOT EXISTS rencontres_budgetaires (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titre TEXT NOT NULL,
            direction TEXT NOT NULL,
            service TEXT,
            date_reunion DATETIME,
            annee INTEGER,
            type TEXT,
            description TEXT,
            cout_ttc REAL,
            arbitrage TEXT,
            responsable_dsi TEXT,
            ticket_glpi TEXT,
            lien_reference TEXT,
            statut TEXT DEFAULT 'planifiée',
            commentaires TEXT,
            reunion_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reunion_id) REFERENCES rencontres_reunions(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS rencontres_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rencontre_id INTEGER NOT NULL,
            nom TEXT,
            role TEXT,
            email TEXT,
            statut TEXT DEFAULT 'en attente',
            FOREIGN KEY (rencontre_id) REFERENCES rencontres_budgetaires (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS rencontres_suivi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rencontre_id INTEGER NOT NULL,
            action_item TEXT,
            responsable TEXT,
            date_echeance DATE,
            statut TEXT DEFAULT 'en cours',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rencontre_id) REFERENCES rencontres_budgetaires (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS direction_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            direction TEXT NOT NULL,
            service TEXT,
            email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(direction, service, email)
        );

        CREATE TABLE IF NOT EXISTS rencontres_reunions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titre TEXT NOT NULL,
            date_reunion DATETIME,
            annee INTEGER,
            lieu TEXT,
            description TEXT,
            releve_decision TEXT,
            liste_taches TEXT,
            statut TEXT DEFAULT 'planifiée',
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reunion_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reunion_id INTEGER NOT NULL,
            nom TEXT NOT NULL,
            prenom TEXT,
            email TEXT,
            service TEXT,
            direction TEXT,
            type_presence TEXT DEFAULT 'metier',
            statut_presence TEXT DEFAULT 'present',
            ad_username TEXT,
            commentaire TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reunion_id) REFERENCES rencontres_reunions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS transcript_meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            summary TEXT,
            meeting_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transcript_cues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER,
            speaker_name TEXT,
            start_seconds REAL,
            text TEXT,
            FOREIGN KEY (meeting_id) REFERENCES transcript_meetings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS contrats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            svc TEXT DEFAULT '',
            objet TEXT DEFAULT '',
            budget TEXT DEFAULT '',
            raison_sociale TEXT DEFAULT '',
            type_contrat TEXT DEFAULT '',
            annee_initiale INTEGER,
            direction TEXT DEFAULT '',
            service TEXT DEFAULT '',
            perimetre TEXT DEFAULT '',
            nature TEXT DEFAULT '',
            fonction TEXT DEFAULT '',
            date_debut DATE,
            duree_annees REAL,
            nb_reconductions INTEGER,
            date_fin DATE,
            marche_contrat TEXT DEFAULT '',
            piece TEXT DEFAULT '',
            date_reconduction TEXT DEFAULT '',
            reconduction TEXT DEFAULT '',
            montant_2022 REAL,
            montant_2023 REAL,
            montant_2024 REAL,
            montant_2025 REAL,
            montant_2026 REAL,
            prevision_2026 REAL,
            prevision_2027 REAL,
            prevision_2028 REAL,
            commentaires TEXT DEFAULT '',
            gti TEXT DEFAULT '',
            gtr TEXT DEFAULT '',
            penalite TEXT DEFAULT '',
            indice_revision TEXT DEFAULT '',
            numero_facture TEXT DEFAULT '',
            statut TEXT DEFAULT 'actif',
            renouvellement_statut TEXT DEFAULT NULL,
            renouvellement_commentaire TEXT DEFAULT '',
            doc_principal_path TEXT DEFAULT '',
            doc_principal_nom TEXT DEFAULT '',
            contrat_renouvellement_id INTEGER DEFAULT NULL,
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS contrat_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrat_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            nature TEXT DEFAULT '',
            est_principal INTEGER DEFAULT 0,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contrat_id) REFERENCES contrats(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS transcript_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER,
            description TEXT,
            assignee TEXT,
            requester TEXT,
            deadline TEXT,
            is_completed INTEGER DEFAULT 0,
            origin TEXT,
            start_seconds REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (meeting_id) REFERENCES transcript_meetings(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_transcript_cues_meeting ON transcript_cues(meeting_id);
        CREATE INDEX IF NOT EXISTS idx_transcript_tasks_meeting ON transcript_tasks(meeting_id);

        CREATE INDEX IF NOT EXISTS idx_rencontres_direction ON rencontres_budgetaires(direction);
        CREATE INDEX IF NOT EXISTS idx_rencontres_annee ON rencontres_budgetaires(annee);
        CREATE INDEX IF NOT EXISTS idx_rencontres_statut ON rencontres_budgetaires(statut);
        CREATE INDEX IF NOT EXISTS idx_direction_emails ON direction_emails(direction);
        CREATE INDEX IF NOT EXISTS idx_direction_emails_email ON direction_emails(email);

        CREATE INDEX IF NOT EXISTS idx_contrats_statut ON contrats(statut);
        CREATE INDEX IF NOT EXISTS idx_contrats_direction ON contrats(direction);
        CREATE INDEX IF NOT EXISTS idx_contrats_date_fin ON contrats(date_fin);
        CREATE INDEX IF NOT EXISTS idx_contrat_documents_contrat_id ON contrat_documents(contrat_id);
    `);

    try {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS reunion_attachments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reunion_id INTEGER NOT NULL,
              filename TEXT NOT NULL,
              original_name TEXT NOT NULL,
              mimetype TEXT,
              size INTEGER,
              uploaded_by TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (reunion_id) REFERENCES rencontres_reunions(id) ON DELETE CASCADE
            )
        `);
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(users)");
        const hasEmailColumn = result.some(col => col.name === 'email');
        if (!hasEmailColumn) {
            await db.exec('ALTER TABLE users ADD COLUMN email TEXT');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(direction_emails)");
        const hasServiceColumn = result.some(col => col.name === 'service');
        if (!hasServiceColumn) {
            await db.exec('ALTER TABLE direction_emails ADD COLUMN service TEXT');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(rencontres_budgetaires)");
        const hasServiceColumn = result.some(col => col.name === 'service');
        if (!hasServiceColumn) {
            await db.exec('ALTER TABLE rencontres_budgetaires ADD COLUMN service TEXT');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(rencontres_budgetaires)");
        const hasSuiviColumn = result.some(col => col.name === 'suivi');
        if (!hasSuiviColumn) {
            await db.exec('ALTER TABLE rencontres_budgetaires ADD COLUMN suivi TEXT');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(rencontres_budgetaires)");
        const hasReunionIdColumn = result.some(col => col.name === 'reunion_id');
        if (!hasReunionIdColumn) {
            await db.exec('ALTER TABLE rencontres_budgetaires ADD COLUMN reunion_id INTEGER');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(reunion_participants)");
        const hasColumn = result.some(col => col.name === 'commentaire');
        if (!hasColumn) {
            await db.exec('ALTER TABLE reunion_participants ADD COLUMN commentaire TEXT');
        }
    } catch (e) {}

    try {
        const result = await db.all("PRAGMA table_info(transcript_meetings)");
        const hasReunionIdColumn = result.some(col => col.name === 'reunion_id');
        if (!hasReunionIdColumn) {
            await db.exec('ALTER TABLE transcript_meetings ADD COLUMN reunion_id INTEGER');
        }
    } catch (e) {}

    try {
        const existingTile = await db.get("SELECT id FROM tiles WHERE title = 'Transcript Manager'");
        if (!existingTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Transcript Manager', 'FileText', 'Gérez vos réunions et générez des comptes-rendus IA', 'active', (maxOrder?.max || 999) + 1, 1]
            );
            const tileId = result.lastID;
            await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, 'Ouvrir', '/transcriptmanager', 1]);
        }
    } catch (e) {}

    try {
        const existingTile = await db.get("SELECT id FROM tiles WHERE title = 'Rencontres Budgétaires'");
        if (!existingTile) {
            await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order) VALUES (?, ?, ?, ?, ?)",
                ['Rencontres Budgétaires', 'BarChart3', 'Demandes associées à votre direction', 'active', 999]
            );
        }
    } catch (e) {}

    try {
        const existingTile = await db.get("SELECT id FROM tiles WHERE title = 'Mes Réunions'");
        if (!existingTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Mes Réunions', 'Calendar', 'Réunions où je suis participant', 'active', (maxOrder?.max || 999) + 1, 1]
            );
            const tileId = result.lastID;
            const existingLink = await db.get("SELECT id FROM tile_links WHERE tile_id = ? AND label = 'Voir mes réunions'", [tileId]);
            if (!existingLink) {
                try {
                    await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, 'Voir mes réunions', '/mes-reunions', 1]);
                } catch (e2) {}
            }
        }
    } catch (e) {}

    try {
        const existingTile = await db.get("SELECT id FROM tiles WHERE title = 'Gestion des Contrats'");
        if (!existingTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Gestion des Contrats', 'FileSignature', 'Gérez les contrats de maintenance', 'active', (maxOrder?.max || 999) + 1, 0]
            );
            const tileId = result.lastID;
            const existingLink = await db.get("SELECT id FROM tile_links WHERE tile_id = ? AND label = 'Voir les contrats'", [tileId]);
            if (!existingLink) {
                try {
                    await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, 'Voir les contrats', '/contrats', 1]);
                } catch (e2) {}
            }
        }
    } catch (e) {}

    try {
        const existingManagerTile = await db.get("SELECT id FROM tiles WHERE title = 'Manager Calendrier'");
        if (!existingManagerTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Manager Calendrier', 'Shield', 'Gestionnaires du calendrier DSI', 'active', (maxOrder?.max || 999) + 1, 0]
            );
            const tileId = result.lastID;
            const existingLink = await db.get("SELECT id FROM tile_links WHERE tile_id = ? AND label = 'Ouvrir'", [tileId]);
            if (!existingLink) {
                try {
                    await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, 'Ouvrir', '/calendrier-dsi', 1]);
                } catch (e2) {}
            }
        }
    } catch (e) {}

    try {
        const existingTasksTile = await db.get("SELECT id FROM tiles WHERE title = 'Mes Tâches'");
        if (!existingTasksTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Mes Tâches', 'CheckSquare', 'Retrouvez toutes vos tâches en un seul endroit', 'active', (maxOrder?.max || 999) + 1, 0]
            );
            const tileId = result.lastID;
            await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, 'Voir mes tâches', '/mes-taches', 1]);
        }
    } catch (e) {}

    try {
        const existingConsoTile = await db.get("SELECT id FROM tiles WHERE title = 'Gestion des Consommables'");
        if (!existingConsoTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Gestion des Consommables', 'Package', 'Demandez des consommables informatiques', 'active', (maxOrder?.max || 999) + 1, 1]
            );
            const tileId = result.lastID;
            const existingLink = await db.get("SELECT id FROM tile_links WHERE tile_id = ? AND label = 'Faire une demande'", [tileId]);
            if (!existingLink) {
                try {
                    await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, 'Faire une demande', '/consommables', 1]);
                } catch (e2) {}
            }
        }
    } catch (e) {}

    // Migration: Créer la tuile Support IT (Tickets) si elle n'existe pas
    try {
        const existingTile = await db.get("SELECT id FROM tiles WHERE title = 'Support IT'");
        if (!existingTile) {
            const maxOrder = await db.get("SELECT MAX(sort_order) as max FROM tiles");
            const result = await db.run(
                "INSERT INTO tiles (title, icon, description, status, sort_order, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                ['Support IT', 'Ticket', 'Gestion des incidents et demandes de service', 'active', (maxOrder?.max || 999) + 1, 1]
            );
            const tileId = result.lastID;
            const links = [
                ['Voir les tickets', '/tickets', 1],
                ['Nouveau ticket', '/tickets/new', 1],
                ['Administration des tickets', '/admin/tickets', 1],
            ];
            for (const [label, url, isInternal] of links) {
                try {
                    const existingLink = await db.get("SELECT id FROM tile_links WHERE tile_id = ? AND url = ?", [tileId, url]);
                    if (!existingLink) {
                        await db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)", [tileId, label, url, isInternal]);
                    }
                } catch (e2) {}
            }
            console.log('[DB Migration] Tuile Support IT créée');
        }
    } catch (e) {
        console.warn('[DB Migration] Erreur création tuile Support IT:', e.message);
    }

    try {
        const result = await db.all("PRAGMA table_info(tiles)");
        const hasIsPublicColumn = result.some(col => col.name === 'is_public');
        if (!hasIsPublicColumn) {
            await db.exec('ALTER TABLE tiles ADD COLUMN is_public INTEGER DEFAULT 0');
        }
    } catch (e) {}

    // Migrations table certificates
    try { await db.run("ALTER TABLE certificates ADD COLUMN sedit_number TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE certificates ADD COLUMN observations TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE certificates ADD COLUMN renewal_status TEXT DEFAULT NULL"); } catch (e) {}
    try { await db.run("ALTER TABLE certificates ADD COLUMN renewal_comment TEXT DEFAULT ''"); } catch (e) {}

    // Migrations table contrats
    try { await db.run("ALTER TABLE contrats ADD COLUMN gti TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN gtr TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN penalite TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN indice_revision TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN numero_facture TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN statut TEXT DEFAULT 'actif'"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN renouvellement_statut TEXT DEFAULT NULL"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN renouvellement_commentaire TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN doc_principal_path TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN doc_principal_nom TEXT DEFAULT ''"); } catch (e) {}
    try { await db.run("ALTER TABLE contrats ADD COLUMN contrat_renouvellement_id INTEGER DEFAULT NULL"); } catch (e) {}

    // GLPI Settings migrations
        try { await db.exec("ALTER TABLE glpi_settings ADD COLUMN login TEXT"); } catch (e) {}
    try { await db.run("ALTER TABLE glpi_settings ADD COLUMN password TEXT"); } catch (e) {}


    try {
        try { await db.exec(`DROP VIEW IF EXISTS main.v_orders`); } catch(e) {}
        await db.exec(`DROP VIEW IF EXISTS temp.v_orders`);
        await db.exec(`
            CREATE TEMP VIEW v_orders AS
            SELECT oc.*, l.operation_id, l.budgetId,
            oc.COMMANDE_COMMANDE as id,
            oc.COMMANDE_COMMANDE as "N° Commande",
            TRIM(COALESCE(oc.COMMANDE_LIBELLE, '') || ' ' || COALESCE(oc.COMMANDE_CMD_LIBELLE2, '')) as "Libellé",
            oc.COMMANDE_CMD_DATECOMMANDE as "Date de la commande",
            ob.BUDGET_LIBELLE as "Budget",
            oc.SERVICEFI_LIBELLE as "Service émetteur",
            oc.SERVICEFI_LIBELLE as "Fournisseur",
            oc.COMMANDE_MONTANT_HT as "Montant HT",
            oc.COMMANDE_MONTANT_TTC as "Montant TTC",
            oc.COMMANDE_COMMANDE as order_number,
            oc.COMMANDE_LIBELLE as description,
            oc.SERVICEFI_LIBELLE as provider,
            oc.COMMANDE_MONTANT_HT as amount_ht,
            oc.COMMANDE_CMD_DATECOMMANDE as date,
            TRIM(ob.BUDGET_ROO_IMA_REF) as BUDGET_ROO_IMA_REF
            FROM gf.oracle_commande oc
            LEFT JOIN (
                SELECT BUDGET_BUDGET, MIN(BUDGET_ROO_IMA_REF) as BUDGET_ROO_IMA_REF, MIN(BUDGET_LIBELLE) as BUDGET_LIBELLE 
                FROM gf.oracle_budget 
                GROUP BY BUDGET_BUDGET
            ) ob ON oc.BUDGET_BUDGET = ob.BUDGET_BUDGET
            LEFT JOIN gf.oracle_links l ON l.target_id = oc.COMMANDE_COMMANDE AND l.target_table = 'orders'
        `);
    } catch (e) {}
    
    try {
        try { await db.exec(`DROP VIEW IF EXISTS main.v_invoices`); } catch(e) {}
        await db.exec(`DROP VIEW IF EXISTS temp.v_invoices`);
        await db.exec(`
            CREATE TEMP VIEW v_invoices AS
            SELECT f.*, l.operation_id, l.budgetId,
            f.FACTURE_FACTURE as id,
            f.FACTURE_FACTURE as "N° Facture interne",
            f.FACTURE_REFERENCE as "N° Facture fournisseur",
            f.FACTURE_LIBELLE2 as "Fournisseur",
            f.FACTURE_LIBELLE1 as "Libellé",
            f.FACTURE_MONTANTTC_E as "Montant TTC",
            'Non spécifié' as "Service",
            ob.BUDGET_LIBELLE as "Budget",
            f.FACETAT_LIBELLE as "Etat",
            f.FACTURE_DATENTREE as "Arrivée",
            substr(f.FACTURE_DATENTREE, 1, 4) as "Exercice",
            f.FACTURE_DATPAIPREV as FACTURE_DATPAIPREV_RAW,
            CASE 
                WHEN f.FACTURE_DATPAIPREV LIKE '____-__-__%' 
                THEN substr(f.FACTURE_DATPAIPREV, 9, 2) || '/' || substr(f.FACTURE_DATPAIPREV, 6, 2) || '/' || substr(f.FACTURE_DATPAIPREV, 1, 4)
                ELSE f.FACTURE_DATPAIPREV 
            END as "Échéance",
            TRIM(ob.BUDGET_ROO_IMA_REF) as BUDGET_CODE
            FROM gf.oracle_facture f
            LEFT JOIN (
                SELECT BUDGET_BUDGET, MIN(BUDGET_ROO_IMA_REF) as BUDGET_ROO_IMA_REF, MIN(BUDGET_LIBELLE) as BUDGET_LIBELLE 
                FROM gf.oracle_budget 
                GROUP BY BUDGET_BUDGET
            ) ob ON f.FACTURE_POBJ_EXTRACT_1 = ob.BUDGET_BUDGET
            LEFT JOIN gf.oracle_links l ON l.target_id = f.FACTURE_FACTURE AND l.target_table = 'invoices'
        `);
    } catch (e) {}

    try {
        // Migrate old 'admin' role → 'superadmin' (the new 'admin' role is a limited admin)
        await db.run("UPDATE users SET role = 'superadmin' WHERE role = 'admin'");
        await db.run("UPDATE users SET is_approved = 1, role = 'superadmin' WHERE LOWER(username) = 'admin'");
    } catch (e) {}

    return db;
}

module.exports = setupDb;
