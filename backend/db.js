const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

async function setupDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Create tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            last_activity DATETIME,
            service_code TEXT,
            service_complement TEXT
        );

        CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT, -- 'lines', 'invoices', 'orders'
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            username TEXT
        );

        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_type TEXT, -- 'order' ou 'invoice'
            target_id TEXT,   -- N° Commande ou identifiant facture (stable)
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "Code" TEXT,
            "Libellé" TEXT,
            "Masque" TEXT,
            "Sens" TEXT,
            "Section" TEXT,
            "Article par nature" TEXT,
            "Chapitre par nature" TEXT,
            "Référence Fonctionnelle" TEXT,
            "Opération d'équipement" TEXT,
            "Service Gestionnaire" TEXT,
            "EQUIPEMENT" TEXT,
            "TVA" TEXT,
            "JE" TEXT,
            "Budget voté" REAL,
            "Disponible" REAL,
            "Mt. prévision" REAL,
            "Mt. pré-engagé" REAL,
            "Mt. engagé" REAL,
            "Mt. facturé" REAL,
            "Mt. pré-mandaté" REAL,
            "Mt. mandaté" REAL,
            "Mt. payé" REAL,
            year INTEGER,
            allocated_amount REAL
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
            order_number TEXT, description TEXT, provider TEXT, amount_ht REAL, date TEXT, status TEXT
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "Collectivité" TEXT,
            "Budget" TEXT,
            "Exercice" TEXT,
            "N° Facture interne" TEXT,
            "N° Facture fournisseur" TEXT,
            "Fournisseur" TEXT,
            "Libellé" TEXT,
            "Emission" DATE,
            "Montant HT" REAL,
            "Montant TVA" REAL,
            "Montant TTC" REAL,
            "Mandat" TEXT,
            "Etat" TEXT,
            "Arrivée" DATE,
            "Début DGP" DATE,
            "Fin DGP" DATE,
            "Date Réception Pièce" DATE,
            "Date Suspension" DATE,
            "Marché" TEXT,
            "Service" TEXT,
            "Utilisateur" TEXT
        );

        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "Service" TEXT,
            "Service Complément" TEXT,
            "LIBELLE" TEXT,
            "MCO" TEXT,
            "C. Fonc." TEXT,
            "C. Nature" TEXT,
            "Montant prévu" REAL DEFAULT 0,
            "Terminé" TEXT,
            "Commentaire" TEXT
        );

        CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT,
            request_date TEXT,
            beneficiary_name TEXT,
            beneficiary_email TEXT,
            product_code TEXT,
            product_label TEXT,
            file_path TEXT,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            is_italic BOOLEAN DEFAULT 0,
            UNIQUE(page, column_key)
        );
    `);

    // Initialize/Update column settings for all main tables
    const tableConfigs = [
        { page: 'lines', table: 'budget_lines' },
        { page: 'invoices', table: 'invoices' },
        { page: 'orders', table: 'orders' },
        { page: 'operations', table: 'operations' }
    ];

    for (const config of tableConfigs) {
        const tableCols = await db.all(`PRAGMA table_info(${config.table})`);
        for (const col of tableCols) {
            if (col.name !== 'id') {
                await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, 1)', [config.page, col.name, col.name]);
            }
        }
    }

    // Update specific column labels for orders
    await db.run("UPDATE column_settings SET label = 'num' WHERE page = 'orders' AND column_key = 'N° Commande'");
    await db.run("UPDATE column_settings SET label = 'tiers' WHERE page = 'orders' AND column_key = 'Fournisseur'");
    await db.run("UPDATE column_settings SET label = 'service' WHERE page = 'orders' AND column_key = 'Service émetteur'");
    await db.run("UPDATE column_settings SET label = 'date' WHERE page = 'orders' AND column_key = 'Date de la commande'");
    await db.run("UPDATE column_settings SET label = 'nature' WHERE page = 'orders' AND column_key = 'Article par nature'");
    await db.run("UPDATE column_settings SET label = 'fonction' WHERE page = 'orders' AND column_key = 'Article par fonction'");

    // Update labels for operations
    await db.run("UPDATE column_settings SET label = 'Service' WHERE page = 'operations' AND column_key = 'Service'");
    await db.run("UPDATE column_settings SET label = 'Service Complément' WHERE page = 'operations' AND column_key = 'Service Complément'");
    await db.run("UPDATE column_settings SET label = 'Nom' WHERE page = 'operations' AND column_key = 'Nom'");
    await db.run("UPDATE column_settings SET label = 'MCO' WHERE page = 'operations' AND column_key = 'MCO'");
    await db.run("UPDATE column_settings SET label = 'Chapitre Fonc.' WHERE page = 'operations' AND column_key = 'C. Fonc.'");
    await db.run("UPDATE column_settings SET label = 'Nature' WHERE page = 'operations' AND column_key = 'C. Nature'");
    await db.run("UPDATE column_settings SET label = 'Montant Prévu' WHERE page = 'operations' AND column_key = 'Montant prévu'");
    await db.run("UPDATE column_settings SET label = 'Terminé' WHERE page = 'operations' AND column_key = 'Terminé'");
    await db.run("UPDATE column_settings SET label = 'Solde' WHERE page = 'operations' AND column_key = 'Solde'");
    await db.run("UPDATE column_settings SET label = 'Commentaire' WHERE page = 'operations' AND column_key = 'Commentaire'");

    // Mail Settings
    await db.exec(`
        CREATE TABLE IF NOT EXISTS mail_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
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
            template_html TEXT
        );
    `);

    const existingSettings = await db.get('SELECT * FROM mail_settings WHERE id = 1');
    if (!existingSettings) {
        const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 30px; background: #ffffff; min-height: 200px; }
        .footer { background: #f9fafb; color: #6b7280; padding: 20px; text-align: center; font-size: 12px; border-top: 1px solid #e5e7eb; }
        .brand { font-weight: bold; color: #1e3a8a; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>DSI HUB IVRY</h1>
        </div>
        <div class="content">
            {{content}}
        </div>
        <div class="footer">
            <p>Cet email a été envoyé automatiquement par le <span class="brand">DSI Hub Ivry</span>.</p>
            <p>&copy; ${new Date().getFullYear()} - Ville d'Ivry-sur-Seine</p>
        </div>
    </div>
</body>
</html>`.trim();

        await db.run(`
            INSERT INTO mail_settings (
                id, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, 
                sender_email, sender_name, api_key, template_html
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            1, 
            'smtp-relay.brevo.com', 
            587, 
            'DSIhub@fbc.fr', 
            'VOTRE_CLE_API_BREVO', 
            'tls', 
            'DSIhub@fbc.fr', 
            'DSI Hub Ivry', 
            'VOTRE_CLE_API_BREVO',
            defaultTemplate
        ]);
    }

    // Create default admin
    const adminUser = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!adminUser) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', hashedPassword, 'admin']);
    }

    return db;
}

module.exports = setupDb;
