const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

async function setupDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Attach external databases
    const glpiDbPath = path.join(__dirname, 'glpi.sqlite');
    const gfDbPath = path.join(__dirname, 'oracle_gf.sqlite');
    const rhDbPath = path.join(__dirname, 'oracle_rh.sqlite');

    await db.exec(`ATTACH DATABASE '${glpiDbPath}' AS glpi`);
    await db.exec(`ATTACH DATABASE '${gfDbPath}' AS gf`);
    await db.exec(`ATTACH DATABASE '${rhDbPath}' AS rh`);

    // Tables de base (kept in main DB)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            is_approved INTEGER DEFAULT 0,
            service_code TEXT,
            service_complement TEXT,
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
            status TEXT DEFAULT 'active'
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
        ('url_sedit_fi', 'https://seditgfprod.ivry.local/SeditGfSMProd', 'URL de base Sedit Finances');

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
        VALUES (1, 'DSI Hub', '<html><body>{{content}}</body></html>', 1, 1);

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
    `);

    // Note: Tables moved to external DBs (glpi, gf, rh) are not created here anymore.
    // They are accessed via their attached aliases (e.g. glpi.tickets, gf.oracle_commande).
    // However, views that were migrated (v_tickets, v_orders) need to be recreated in the main DB
    // so that code querying them directly doesn't break. These views will query the attached DBs.

    // --- VUES ---
    // Recreate v_tickets in the main DB as TEMP view, querying from glpi.tickets and glpi.ticket_statuses
    try { await db.exec(`DROP VIEW IF EXISTS main.v_tickets`); } catch(e) {}
    await db.exec(`DROP VIEW IF EXISTS temp.v_tickets`);
    await db.exec(`
        CREATE TEMP VIEW v_tickets AS
        SELECT t.*, s.label as status_label,
        LOWER(COALESCE(t.requester_email, '')) as search_email,
        LOWER(COALESCE(REPLACE(t.requester_email, '@ivry94.fr', ''), '')) as search_username
        FROM glpi.tickets t
        LEFT JOIN glpi.ticket_statuses s ON t.status = s.id
    `);

    // Recreate v_orders in the main DB as TEMP view, querying from gf.oracle_commande and gf.oracle_links
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
            -- Déduplication du join budget pour éviter de doubler les montants
            LEFT JOIN (
                SELECT BUDGET_BUDGET, MIN(BUDGET_ROO_IMA_REF) as BUDGET_ROO_IMA_REF, MIN(BUDGET_LIBELLE) as BUDGET_LIBELLE 
                FROM gf.oracle_budget 
                GROUP BY BUDGET_BUDGET
            ) ob ON oc.BUDGET_BUDGET = ob.BUDGET_BUDGET
            LEFT JOIN gf.oracle_links l ON l.target_id = oc.COMMANDE_COMMANDE AND l.target_table = 'orders'
        `);
    } catch (e) {
        console.log("[DB] Note: v_orders non créée (gf.oracle_commande ou gf.oracle_links absente). Erreur: ", e.message);
    }
    
    // Create v_invoices to query the raw oracle_facture table from gf
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
            -- Utilisation directe de FACTURE_DATENTREE pour l'arrivée
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
            -- Déduplication du join budget pour éviter de doubler les montants
            LEFT JOIN (
                SELECT BUDGET_BUDGET, MIN(BUDGET_ROO_IMA_REF) as BUDGET_ROO_IMA_REF, MIN(BUDGET_LIBELLE) as BUDGET_LIBELLE 
                FROM gf.oracle_budget 
                GROUP BY BUDGET_BUDGET
            ) ob ON f.FACTURE_POBJ_EXTRACT_1 = ob.BUDGET_BUDGET
            LEFT JOIN gf.oracle_links l ON l.target_id = f.FACTURE_FACTURE AND l.target_table = 'invoices'
        `);
    } catch (e) {
        console.log("[DB] Note: v_invoices non créée. Erreur: ", e.message);
    }

    // --- AUTO-RÉPARATION ---
    try {
        await db.run("UPDATE users SET is_approved = 1, role = 'admin' WHERE LOWER(username) = 'admin'");
    } catch (e) {}

    return db;
}

module.exports = setupDb;
