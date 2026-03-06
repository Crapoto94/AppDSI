const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

const path = require('path');

async function setupDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            last_action TEXT
        );

        CREATE TABLE IF NOT EXISTS import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT, -- 'lines', 'invoices', 'orders'
            user_id INTEGER,
            username TEXT,
            timestamp TEXT,
            filename TEXT
        );

        CREATE TABLE IF NOT EXISTS m57_plan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            label TEXT,
            section TEXT
        );

        CREATE TABLE IF NOT EXISTS tiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            icon TEXT,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS tile_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tile_id INTEGER,
            label TEXT,
            url TEXT,
            is_internal BOOLEAN DEFAULT 0,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS budget_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT
            -- Columns will be added dynamically on import
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT,
            provider TEXT,
            amount_ht REAL,
            date TEXT,
            status TEXT DEFAULT 'En attente',
            budget_line_code TEXT
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "Organisme" TEXT, "Budget" TEXT, "Exercice" TEXT, "N° Commande" TEXT, "Fournisseur" TEXT, "Libellé" TEXT,
            "Date de la commande" TEXT, "Date de livraison" TEXT, "Marché" TEXT, "Tranche" TEXT, "Service émetteur" TEXT,
            "Service de facturation" TEXT, "Service gestionnaire" TEXT, "N° ligne" TEXT, "Quantité" TEXT, "Prix unitaire" TEXT,
            "Remise" TEXT, "Unité" TEXT, "Montant HT" TEXT, "Montant TVA" TEXT, "Montant TTC" TEXT, "Taux" TEXT,
            "Imputation" TEXT, "Sens" TEXT, "Section" TEXT, "Chapitre par fonction" TEXT, "Article par fonction" TEXT,
            "Article par nature" TEXT, "Opération d'équipement" TEXT, "Service Destinataire" TEXT,
            "Nomenclature d'achat" TEXT, "Etat" TEXT, "Edité" TEXT, "Engagée" TEXT, "Désignation" TEXT,
            -- Old column mappings for backwards compatibility if needed
            order_number TEXT, description TEXT, provider TEXT, amount_ht REAL, date TEXT, status TEXT
        );

        CREATE TABLE IF NOT EXISTS column_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT,
            column_key TEXT,
            label TEXT,
            is_visible BOOLEAN DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            color TEXT,
            is_bold BOOLEAN DEFAULT 0,
            UNIQUE(page, column_key)
        );

        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT,
            nature TEXT,
            libelle TEXT,
            chapitre_fonction TEXT,
            montant_prevu REAL DEFAULT 0,
            termine BOOLEAN DEFAULT 0,
            solde REAL DEFAULT 0,
            commentaire TEXT
        );
    `);

    // Helper to add missing columns to existing orders table if needed
    const columns = [
        "Organisme","Budget","Exercice","N° Commande","Fournisseur","Libellé","Date de la commande",
        "Date de livraison","Marché","Tranche","Service émetteur","Service de facturation",
        "Service gestionnaire","N° ligne","Quantité","Prix unitaire","Remise","Unité",
        "Montant HT","Montant TVA","Montant TTC","Taux","Imputation","Sens","Section",
        "Chapitre par fonction","Article par fonction","Article par nature","Opération d'équipement",
        "Service Destinataire","Nomenclature d'achat","Etat","Edité","Engagée","Désignation"
    ];

    for (const col of columns) {
        try {
            await db.run(`ALTER TABLE orders ADD COLUMN "${col}" TEXT`);
            console.log(`Added column ${col}`);
        } catch (e) {
            // Column already exists
        }
    }

    // Initialize/Update column settings for budget_lines
    const budgetTableCols = await db.all("PRAGMA table_info(budget_lines)");
    for (const col of budgetTableCols) {
        if (col.name !== 'id') {
            try {
                await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['budget_lines', col.name, col.name, 1]);
            } catch (e) {}
        }
    }

    // Initialize/Update column settings for orders
    const colCount = await db.get('SELECT COUNT(*) as count FROM column_settings WHERE page = "orders"');
    
    // Migration for column_settings
    const csCols = await db.all("PRAGMA table_info(column_settings)");
    const csColNames = csCols.map(c => c.name);
    if (!csColNames.includes('display_order')) await db.run('ALTER TABLE column_settings ADD COLUMN display_order INTEGER DEFAULT 0');
    if (!csColNames.includes('color')) await db.run('ALTER TABLE column_settings ADD COLUMN color TEXT');
    if (!csColNames.includes('is_bold')) await db.run('ALTER TABLE column_settings ADD COLUMN is_bold BOOLEAN DEFAULT 0');

    // If not empty, we might want to refresh to include ALL columns
    for (const col of columns) {
        try {
            await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['orders', col, col, 1]);
        } catch (e) {}
    }
    
    // Add old ones if missing for consistency
    const oldCols = ["section", "order_number", "description", "provider", "date", "amount_ht", "status", "exercice", "service_emetteur"];
    for (const col of oldCols) {
        try {
            await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['orders', col, col, 1]);
        } catch (e) {}
    }

    // Clear orders as requested - REMOVED to persist data
    // await db.run('DELETE FROM orders');

    // Create default admin
    const adminUser = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!adminUser) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', hashedPassword, 'admin']);
    }

    return db;
}

module.exports = setupDb;
