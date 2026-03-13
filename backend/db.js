const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

async function setupDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Tables de base
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

        CREATE TABLE IF NOT EXISTS oracle_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_table TEXT, 
            target_id TEXT,    
            operation_id INTEGER,
            budgetId INTEGER,
            UNIQUE(target_table, target_id)
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

        CREATE TABLE IF NOT EXISTS tickets (
            glpi_id INTEGER PRIMARY KEY,
            title TEXT,
            status INTEGER,
            priority INTEGER,
            urgency INTEGER,
            impact INTEGER,
            category TEXT,
            type INTEGER,
            date_creation DATETIME,
            date_mod DATETIME,
            date_closed DATETIME,
            date_solved DATETIME,
            location TEXT,
            solution TEXT,
            source TEXT,
            entity TEXT,
            requester_name TEXT,
            requester_email TEXT
        );

        CREATE TABLE IF NOT EXISTS ticket_statuses (
            id INTEGER PRIMARY KEY,
            label TEXT
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

        CREATE TABLE IF NOT EXISTS magapp_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            url TEXT NOT NULL,
            icon TEXT,
            category TEXT,
            is_internal INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS magapp_favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            app_id INTEGER NOT NULL,
            FOREIGN KEY (app_id) REFERENCES magapp_apps (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS magapp_clicks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            username TEXT,
            clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (app_id) REFERENCES magapp_apps (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS magapp_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER,
            email TEXT NOT NULL,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (app_id) REFERENCES magapp_apps (id) ON DELETE CASCADE
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
            operation_id INTEGER, budgetId INTEGER,
            FOREIGN KEY (operation_id) REFERENCES operations (id)
        );
    `);

    // --- VUES ---
    await db.exec(`DROP VIEW IF EXISTS v_tickets`);
    await db.exec(`
        CREATE VIEW v_tickets AS
        SELECT t.*, s.label as status_label,
        LOWER(COALESCE(t.requester_email, '')) as search_email,
        LOWER(COALESCE(REPLACE(t.requester_email, '@ivry94.fr', ''), '')) as search_username
        FROM tickets t
        LEFT JOIN ticket_statuses s ON t.status = s.id
    `);

    try {
        await db.exec(`DROP VIEW IF EXISTS v_orders`);
        await db.exec(`
            CREATE VIEW v_orders AS
            SELECT oc.*, l.operation_id, l.budgetId,
            oc.COMMANDE_COMMANDE as id,
            oc.COMMANDE_COMMANDE as "N° Commande",
            TRIM(COALESCE(oc.COMMANDE_LIBELLE, '') || ' ' || COALESCE(oc.COMMANDE_CMD_LIBELLE2, '')) as "Libellé",
            oc.COMMANDE_CMD_DATECOMMANDE as "Date de la commande",
            oc.BUDGET_LIBELLE as "Budget",
            oc.SERVICEFI_LIBELLE as "Service émetteur",
            oc.SERVICEFI_LIBELLE as "Fournisseur",
            oc.COMMANDE_MONTANT_HT as "Montant HT",
            oc.COMMANDE_MONTANT_TTC as "Montant TTC",
            oc.COMMANDE_COMMANDE as order_number,
            oc.COMMANDE_LIBELLE as description,
            oc.SERVICEFI_LIBELLE as provider,
            oc.COMMANDE_MONTANT_HT as amount_ht,
            oc.COMMANDE_CMD_DATECOMMANDE as date
            FROM oracle_commande oc
            LEFT JOIN oracle_links l ON l.target_id = oc.COMMANDE_COMMANDE AND l.target_table = 'orders'
        `);
    } catch (e) {
        console.log("[DB] Note: v_orders non créée (oracle_commande absente).");
    }

    // --- AUTO-RÉPARATION ---
    try {
        await db.run("UPDATE users SET is_approved = 1, role = 'admin' WHERE LOWER(username) = 'admin'");
    } catch (e) {}

    return db;
}

module.exports = setupDb;
