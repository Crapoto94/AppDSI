const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const setupDb = require('./db');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const ntlm = require('express-ntlm');

// Configuration Multer dynamique
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.body.target_type; // 'order' ou 'invoice'
        const folder = type === 'order' ? 'file_commandes' : 'file_factures';
        cb(null, path.join(__dirname, folder));
    },
    filename: (req, file, cb) => {
        const targetId = req.body.target_id.replace(/[^a-z0-9]/gi, '_');
        const ext = path.extname(file.originalname);
        // Ajout d'un timestamp court pour éviter les collisions si plusieurs fichiers pour le même ID
        cb(null, `${targetId}_${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

const app = express();
const PORT = 3001;
const SECRET_KEY = 'votre_cle_secrete_ici'; // À changer en production

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/file_commandes', express.static(path.join(__dirname, 'file_commandes')));
app.use('/file_factures', express.static(path.join(__dirname, 'file_factures')));

// Configuration NTLM pour Ivry
const ntlmMiddleware = ntlm({
    domain: 'IVRY'
});

// Route NTLM spécifique pour la détection du login Windows
app.get('/api/auth/ntlm', ntlmMiddleware, (req, res) => {
    res.json({
        login: req.ntlm.UserName,
        domain: req.ntlm.Domain,
        workstation: req.ntlm.Workstation
    });
});

// Route d'auto-login via NTLM
app.get('/api/auth/auto-login', ntlmMiddleware, async (req, res) => {
    try {
        const winLogin = req.ntlm.UserName;
        if (!winLogin) return res.status(401).json({ message: 'Login Windows non détecté' });

        // Chercher l'utilisateur de façon insensible à la casse
        const user = await db.get('SELECT id, username, role, service_code, service_complement FROM users WHERE LOWER(username) = LOWER(?)', [winLogin]);

        if (user) {
            const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role, service_code: user.service_code, service_complement: user.service_complement }, SECRET_KEY);
            res.json({ accessToken, user: { id: user.id, username: user.username, role: user.role, service_code: user.service_code, service_complement: user.service_complement } });
        } else {
            res.status(404).json({ message: 'Utilisateur Windows non reconnu dans la base' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erreur auto-login', error: error.message });
    }
});

// Logger global : enregistre TOUTES les requêtes dans mouchard.log
app.use((req, res, next) => {
    // Ne pas logger les accès au mouchard lui-même pour éviter de polluer
    if (req.url.startsWith('/mouchard') || req.url === '/favicon.ico') return next();
    
    const msg = `${req.method} ${req.url} - par ${req.headers['authorization'] ? 'Utilisateur authentifié' : 'Anonyme'}`;
    const time = new Date().toISOString();
    const line = `[${time}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), line);
    next();
});

// Route pour voir les logs dans le navigateur
app.get('/mouchard', (req, res) => {
    try {
        const logs = fs.readFileSync(path.join(__dirname, 'mouchard.log'), 'utf8');
        const lines = logs.split('\n').filter(l => l.trim().length > 0).reverse().slice(0, 100);
        
        const formatLine = (l) => {
            let color = '#d4d4d4';
            if (l.includes('DELETE')) color = '#f44336';
            if (l.includes('POST')) color = '#4caf50';
            if (l.includes('PUT')) color = '#ff9800';
            if (l.includes('SUCCÈS')) color = '#00ff00';
            if (l.includes('ERREUR') || l.includes('ÉCHEC')) color = '#ff0000';
            return `<div class="line" style="color: ${color}">${l}</div>`;
        };

        res.send(`
            <html>
                <head>
                    <title>Mouchard Serveur</title>
                    <style>
                        body { background: #0f172a; color: #f1f5f9; font-family: 'Consolas', monospace; padding: 30px; line-height: 1.6; }
                        h1 { color: #38bdf8; border-bottom: 2px solid #1e293b; padding-bottom: 10px; }
                        .container { background: #1e293b; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                        .line { padding: 4px 10px; border-radius: 4px; border-bottom: 1px solid #334155; }
                        .line:hover { background: #334155; }
                        .status { font-size: 0.8rem; color: #94a3b8; margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    <h1>Mouchard Système - Flux Temps Réel</h1>
                    <div class="status">Dernière mise à jour : ${new Date().toLocaleTimeString()} (Rafraîchissement 5s)</div>
                    <div class="container">
                        ${lines.map(l => formatLine(l)).join('')}
                    </div>
                    <script>setTimeout(() => location.reload(), 5000);</script>
                </body>
            </html>
        `);
    } catch (err) {
        res.send("Aucun log disponible.");
    }
});

app.get('/api/changelog', (req, res) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'changelog.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ message: 'Error reading changelog' });
    }
});

let db;

// Initialize Database
setupDb().then(async database => {
    db = database;
    
    // Vérification structure table users
    const userCols = await db.all("PRAGMA table_info(users)");
    console.log('Colonnes table users:', userCols.map(c => c.name).join(', '));

    // Ajout physique du champ montant utilisé
    try {
        await db.run('ALTER TABLE operations ADD COLUMN used_amount REAL DEFAULT 0');
        console.log('Colonne used_amount OK');
    } catch (e) {}

    // Ajout physique des champs service à users si manquant
    try {
        await db.run('ALTER TABLE users ADD COLUMN service_code TEXT');
    } catch (e) {}
    try {
        await db.run('ALTER TABLE users ADD COLUMN service_complement TEXT');
    } catch (e) {}

    // Recalcul au démarrage
    await recalculateAllOperations();

    app.listen(PORT, () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to setup database:', err);
    process.exit(1);
});

async function recalculateAllOperations() {
    try {
        const operations = await db.all('SELECT * FROM operations');
        const orders = await db.all('SELECT operation_id, "Montant TTC", "Article par nature" FROM orders WHERE operation_id IS NOT NULL');
        
        // Fonction helper pour déterminer la section
        const getSection = (nature) => {
            if (!nature) return '';
            const n = nature.toString();
            if (n.startsWith('2')) return 'I';
            if (n.startsWith('6') || n.startsWith('7') || n.startsWith('0')) return 'F';
            return '';
        };

        for (const op of operations) {
            const linkedOrders = orders.filter(o => String(o.operation_id) === String(op.id));
            const used = linkedOrders.reduce((acc, o) => {
                let val = o["Montant TTC"];
                if (!val) return acc;
                const num = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
                return acc + num;
            }, 0);
            
            // Déterminer la section à partir de la première commande liée, ou du champ C. Nature
            let section = op.Section;
            if (linkedOrders.length > 0) {
                section = getSection(linkedOrders[0]["Article par nature"]);
            } else if (op["C. Nature"]) {
                section = getSection(op["C. Nature"]);
            }

            await db.run('UPDATE operations SET used_amount = ?, Section = ? WHERE id = ?', [used, section, op.id]);
        }
        console.log('Synchronisation montants et sections terminée.');
    } catch (error) {
        console.error('Erreur synchronisation:', error);
    }
}

// Default Error Handler (must be after all routes)
app.use((err, req, res, next) => {
    console.error('Unhandled Express Error:', err);
    res.status(500).json({ message: 'Erreur interne du serveur', error: err.message });
});

// Capture les erreurs non gérées au niveau global pour éviter que le processus Node ne plante silencieusement
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

// Middleware to verify JWT
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.status(403).json({ message: 'Session expirée ou invalide' });
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: 'Authentification requise' });
    }
};

// Middleware for Admin only
const authenticateAdmin = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur uniquement' });
        }
    });
};

// Middleware for Admin or Finances or Compta
const authenticateAdminOrFinances = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (req.user && (req.user.role === 'admin' || req.user.role === 'finances' || req.user.role === 'compta')) {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur ou finances/compta uniquement' });
        }
    });
};

// SQL Query execution (Admin / Compta only)
app.post('/api/sql-query', authenticateAdminOrFinances, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ message: 'Requête SQL requise' });
    try {
        let result;
        if (query.trim().toUpperCase().startsWith('SELECT') || query.trim().toUpperCase().startsWith('PRAGMA')) {
            result = await db.all(query);
        } else {
            const runResult = await db.run(query);
            result = [{ changes: runResult.changes, lastID: runResult.lastID }];
        }
        res.json({ data: result || [] });
    } catch (error) {
        res.status(500).json({ message: 'Erreur d\'exécution de la requête', error: error.message });
    }
});

// Auth Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (user && await bcrypt.compare(password, user.password)) {
        const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role, service_code: user.service_code, service_complement: user.service_complement }, SECRET_KEY);
        res.json({ accessToken, user: { id: user.id, username: user.username, role: user.role, service_code: user.service_code, service_complement: user.service_complement } });
    } else {
        res.status(401).json({ message: 'Identifiants invalides' });
    }
});

app.post('/api/change-password', authenticateJWT, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Mot de passe actuel incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ message: 'Mot de passe mis à jour avec succès' });
});

// Tiles Routes
app.get('/api/tiles', authenticateJWT, async (req, res) => {
    const tiles = await db.all('SELECT * FROM tiles ORDER BY sort_order');
    for (const tile of tiles) {
        tile.links = await db.all('SELECT * FROM tile_links WHERE tile_id = ?', [tile.id]);
    }
    res.json(tiles);
});

app.post('/api/tiles', authenticateAdmin, async (req, res) => {
    const { title, icon, description, sort_order, status } = req.body;
    const result = await db.run('INSERT INTO tiles (title, icon, description, sort_order, status) VALUES (?, ?, ?, ?, ?)', [title, icon, description, sort_order || 0, status || 'active']);
    res.json({ id: result.lastID });
});

app.put('/api/tiles/:id', authenticateAdmin, async (req, res) => {
    const { title, icon, description, sort_order, status } = req.body;
    await db.run('UPDATE tiles SET title = ?, icon = ?, description = ?, sort_order = ?, status = ? WHERE id = ?', [title, icon, description, sort_order, status, req.params.id]);
    res.json({ message: 'Tile updated' });
});

app.delete('/api/tiles/:id', authenticateAdmin, async (req, res) => {
    await db.run('DELETE FROM tiles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Tile deleted' });
});

// Links Routes
app.post('/api/tiles/:tileId/links', authenticateAdmin, async (req, res) => {
    const { label, url, is_internal } = req.body;
    const result = await db.run('INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, ?, ?, ?)', [req.params.tileId, label, url, is_internal ? 1 : 0]);
    res.json({ id: result.lastID });
});

app.delete('/api/links/:id', authenticateAdmin, async (req, res) => {
    await db.run('DELETE FROM tile_links WHERE id = ?', [req.params.id]);
    res.json({ message: 'Link deleted' });
});

// Budget & Invoices & Operations API
app.get('/api/budget/lines', authenticateJWT, async (req, res) => {
    const lines = await db.all('SELECT * FROM budget_lines');
    res.json(lines);
});

app.get('/api/budget/invoices', authenticateJWT, async (req, res) => {
    const invoices = await db.all('SELECT * FROM invoices');
    res.json(invoices);
});

app.get('/api/budget/operations', authenticateJWT, async (req, res) => {
    try {
        const operations = await db.all('SELECT * FROM operations');
        res.json(operations);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la lecture des opérations', error: error.message });
    }
});

app.post('/api/budget/operations', authenticateAdminOrFinances, async (req, res) => {
    const data = req.body;
    console.log('POST /api/budget/operations', data);
    try {
        const tableCols = (await db.all('PRAGMA table_info(operations)')).map(c => c.name).filter(c => c !== 'id');
        const placeholders = tableCols.map(() => '?').join(',');
        const values = tableCols.map(c => data[c]);
        
        const result = await db.run(`INSERT INTO operations (${tableCols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`, values);
        console.log('Created op with ID:', result.lastID);
        res.json({ id: result.lastID, message: 'Opération créée' });
    } catch (error) {
        console.error('POST /api/budget/operations error:', error);
        res.status(500).json({ message: 'Erreur creation', error: error.message });
    }
});

app.put('/api/budget/operations/:id', authenticateAdminOrFinances, async (req, res) => {
    const id = req.params.id;
    const data = req.body;
    console.log(`PUT /api/budget/operations/${id}`, data);
    try {
        const tableCols = (await db.all('PRAGMA table_info(operations)')).map(c => c.name).filter(c => c !== 'id');
        const sets = tableCols.map(c => `"${c}" = ?`).join(',');
        const values = [...tableCols.map(c => data[c]), id];
        
        await db.run(`UPDATE operations SET ${sets} WHERE id = ?`, values);
        console.log(`Updated op ${id}`);
        res.json({ message: 'Opération mise à jour' });
    } catch (error) {
        console.error(`PUT /api/budget/operations/${id} error:`, error);
        res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
    }
});

// Ajout d'un log système
const logMouchard = (msg) => {
    const time = new Date().toISOString();
    const line = `[${time}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), line);
    console.log(line);
};

// ... existing code ...

app.delete('/api/budget/operations/:id', (req, res, next) => {
    logMouchard(`RECEPTION DELETE sur ID: ${req.params.id}`);
    next();
}, authenticateAdminOrFinances, async (req, res) => {
    const id = req.params.id;
    logMouchard(`EXECUTION SQL: DELETE FROM operations WHERE id = ${id}`);
    try {
        const result = await db.run('DELETE FROM operations WHERE id = ?', [id]);
        if (result.changes > 0) {
            logMouchard(`SUCCÈS: ${result.changes} ligne supprimée.`);
            res.json({ message: 'Opération supprimée' });
        } else {
            logMouchard(`ÉCHEC: Aucun enregistrement trouvé pour l'ID ${id}`);
            res.status(404).json({ message: 'Opération non trouvée' });
        }
    } catch (error) {
        logMouchard(`ERREUR SQL: ${error.message}`);
        res.status(500).json({ message: 'Erreur suppression', error: error.message });
    }
});

// Import Budget Lines from Excel
app.post('/api/budget/import-lines', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { cellDates: true });

        if (data.length === 0) return res.json({ message: 'Le fichier est vide' });

        // Ensure table has all necessary columns from Excel
        const excelCols = Object.keys(data[0]);
        for (const col of excelCols) {
            try {
                await db.run(`ALTER TABLE budget_lines ADD COLUMN "${col}" TEXT`);
            } catch (e) {}
            try {
                await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['lines', col, col, 1]);
            } catch (e) {}
        }

        // Get actual table columns after potential alterations
        const tableColsInfo = await db.all("PRAGMA table_info(budget_lines)");
        const tableCols = tableColsInfo.map(c => c.name);

        let imported = 0;
        let updated = 0;

        for (const row of data) {
            // Identify identifying fields
            const code = row.Code || row.code || row['Code'];
            if (!code) continue; 
            
            const year = row.Annee || row.year || row.Exercice || 2026;

            // Prepare mapped row using only columns that exist in DB
            const mappedRow = {};
            
            // 1. Copy original Excel columns
            Object.keys(row).forEach(excelKey => {
                const dbKey = tableCols.find(c => c.toLowerCase() === excelKey.toLowerCase());
                if (dbKey) {
                    mappedRow[dbKey] = row[excelKey];
                }
            });

            // 2. Add/Override special normalized fields if they exist in DB
            if (tableCols.includes('year')) mappedRow['year'] = year;
            
            if (tableCols.includes('allocated_amount')) {
                let amount = row['Budget voté'] || row['Mt. prévision'] || row.Montant || row.allocated_amount || 0;
                if (typeof amount === 'string') amount = parseFloat(amount.replace(/[^0-9,-]+/g, '').replace(',', '.'));
                mappedRow['allocated_amount'] = amount;
            }

            // Check if exists
            const exists = await db.get('SELECT id FROM budget_lines WHERE ("Code" = ? OR code = ?) AND year = ?', [code, code, year]);
            
            const keys = Object.keys(mappedRow);
            const vals = Object.values(mappedRow);
            const placeholders = keys.map(() => '?').join(',');

            if (!exists) {
                await db.run(
                    `INSERT INTO budget_lines (${keys.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`,
                    vals
                );
                imported++;
            } else {
                const updateStr = keys.map(c => `"${c}" = ?`).join(',');
                await db.run(
                    `UPDATE budget_lines SET ${updateStr} WHERE id = ?`,
                    [...vals, exists.id]
                );
                updated++;
            }
        }
        await db.run('INSERT INTO import_logs (type, username) VALUES (?, ?)', ['lines', req.user.username]);
        res.json({ message: `${imported} lignes budgétaires importées, ${updated} mises à jour` });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Erreur lors de l\'import', error: error.message });
    }
});

// Import Invoices from Excel
app.post('/api/budget/import-invoices', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    let currentStep = 'Reading file';
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { cellDates: true });

        if (data.length === 0) return res.json({ message: 'Le fichier est vide' });

        currentStep = 'Clearing existing data';
        // Clear existing data instead of dropping table
        await db.run('DELETE FROM invoices');
        
        currentStep = 'Preparing columns';
        const excelCols = Object.keys(data[0]);
        const tableColsInfo = await db.all("PRAGMA table_info(invoices)");
        const tableCols = tableColsInfo.map(c => c.name);
        
        // Ensure column settings exist for these columns
        for (const col of excelCols) {
            await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['invoices', col, col, 1]);
        }

        currentStep = 'Inserting rows';
        let imported = 0;
        
        // Map excel keys to DB columns (case-insensitive and trimmed)
        const getDbKey = (excelKey) => {
            const trimmed = excelKey.trim();
            // Try to match trimmed key directly or find in tableCols
            if (tableCols.includes(trimmed)) return trimmed;
            return tableCols.find(c => c.trim().toLowerCase() === trimmed.toLowerCase());
        };

        for (const row of data) {
            const mappedRow = {};
            Object.keys(row).forEach(excelKey => {
                const dbKey = getDbKey(excelKey);
                if (dbKey) {
                    let val = row[excelKey];
                    
                    const dateFields = ['Emission', 'Arrivée', 'Début DGP', 'Fin DGP', 'Date Réception Pièce', 'Date Suspension'];
                    if (dateFields.includes(dbKey)) {
                        if (val === undefined || val === null || val === '') {
                            val = null;
                        } else if (typeof val === 'number') {
                            // Robust Excel Serial to ISO conversion
                            // Note: Excel thinks 1900 was a leap year, so we use 25569 as base for 1970-01-01
                            const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                            val = date.toISOString().split('T')[0];
                        } else if (val instanceof Date) {
                            val = val.toISOString().split('T')[0];
                        } else if (typeof val === 'string') {
                            const trimmedVal = val.trim();
                            if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmedVal)) {
                                const [d, m, y] = trimmedVal.split('/');
                                val = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                            } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmedVal)) {
                                val = trimmedVal.split('T')[0];
                            } else {
                                val = null;
                            }
                        } else {
                            val = null;
                        }
                    }

                    mappedRow[dbKey] = val;
                }
            });

            const keys = Object.keys(mappedRow);
            if (keys.length === 0) continue;

            const values = Object.values(mappedRow);
            const placeholders = keys.map(() => '?').join(',');
            const sql = `INSERT INTO invoices (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders})`;
            
            try {
                await db.run(sql, values);
                imported++;
            } catch (err) {
                console.error(`Row insertion error at row ${imported + 1}:`, err.message);
                throw new Error(`Erreur SQL à la ligne ${imported + 1} : ${err.message}`);
            }
        }

        currentStep = 'Logging import';
        await db.run('INSERT INTO import_logs (type, username) VALUES (?, ?)', ['invoices', req.user.username]);
        res.json({ message: `${imported} factures importées avec succès` });
    } catch (error) {
        console.error(`Import error during ${currentStep}:`, error);
        res.status(500).json({ message: `Erreur lors de l'import (${currentStep})`, error: error.message });
    }
});

// Orders API
app.get('/api/orders', authenticateJWT, async (req, res) => {
    // Get visible columns from settings first
    const settings = await db.all("SELECT column_key FROM column_settings WHERE page = 'orders'");
    const validKeys = settings.map(s => s.column_key);
    
    const orders = await db.all(`
        SELECT o.*, op.LIBELLE as operation_label 
        FROM orders o 
        LEFT JOIN operations op ON o.operation_id = op.id
        ORDER BY "N° Commande", "N° ligne"
    `);
    
    // Clean each order object to only include valid keys + internal helper fields
    const cleanedOrders = orders.map(order => {
        const cleaned = { 
            id: order.id, 
            operation_id: order.operation_id, 
            operation_label: order.operation_label,
            "N° Commande": order["N° Commande"],
            "N° ligne": order["N° ligne"],
            section: order.section || order.Section || order['Section']
        };
        validKeys.forEach(key => {
            if (!cleaned.hasOwnProperty(key)) {
                cleaned[key] = order[key];
            }
        });
        return cleaned;
    });
    
    res.json(cleanedOrders);
});

// Unitary assignment
app.post('/api/orders/:id/assign-operation', authenticateJWT, async (req, res) => {
    const { operation_id } = req.body;
    const order_id = req.params.id;
    try {
        const order = await db.get('SELECT "N° Commande" FROM orders WHERE id = ?', [order_id]);
        if (!order) return res.status(404).json({ message: 'Commande non trouvée' });
        await db.run('UPDATE orders SET operation_id = ? WHERE "N° Commande" = ?', [operation_id || null, order['N° Commande']]);
        
        // Recalculate physical column
        await recalculateAllOperations();
        
        res.json({ message: 'Affectation réussie' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur affectation', error: error.message });
    }
});

// Bulk assignment
app.post('/api/orders/bulk-assign', authenticateJWT, async (req, res) => {
    const { order_numbers, operation_id } = req.body;
    if (!Array.isArray(order_numbers)) return res.status(400).json({ message: 'Données invalides' });
    try {
        const placeholders = order_numbers.map(() => '?').join(',');
        await db.run(`UPDATE orders SET operation_id = ? WHERE "N° Commande" IN (${placeholders})`, [operation_id || null, ...order_numbers]);
        
        // Recalculate physical column
        await recalculateAllOperations();
        
        res.json({ message: `${order_numbers.length} commandes traitées` });
    } catch (error) {
        res.status(500).json({ message: 'Erreur affectation en masse', error: error.message });
    }
});

// Users Management API
// Middleware to update last activity
const updateLastActivity = async (req, res, next) => {
    if (req.user && req.user.username) {
        try {
            // Utiliser le format ISO compatible JavaScript
            await db.run("UPDATE users SET last_activity = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE username = ?", [req.user.username]);
        } catch (e) {
            console.error('Error updating last activity:', e);
        }
    }
    next();
};

app.use(updateLastActivity);

app.get('/api/users', authenticateAdmin, async (req, res) => {
    const users = await db.all('SELECT id, username, role, last_activity, service_code, service_complement FROM users');
    res.json(users);
});

app.get('/api/import-logs', authenticateJWT, async (req, res) => {
    const logs = await db.all('SELECT * FROM import_logs ORDER BY imported_at DESC');
    res.json(logs);
});

// M57 Plan API
app.get('/api/m57-plan', authenticateJWT, async (req, res) => {
    const plan = await db.all('SELECT * FROM m57_plan ORDER BY code');
    res.json(plan);
});

app.post('/api/m57-plan', authenticateAdminOrFinances, async (req, res) => {
    const { code, label, section, type } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO m57_plan (code, label, section, type) VALUES (?, ?, ?, ?)',
            [code, label, section, type]
        );
        res.json({ id: result.lastID, message: 'Code ajouté au référentiel' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de l\'ajout', error: error.message });
    }
});

app.put('/api/m57-plan/:id', authenticateAdminOrFinances, async (req, res) => {
    const { code, label, section } = req.body;
    try {
        await db.run(
            'UPDATE m57_plan SET code = ?, label = ?, section = ? WHERE id = ?',
            [code, label, section, req.params.id]
        );
        res.json({ message: 'Référentiel mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
});

app.delete('/api/m57-plan/:id', authenticateAdminOrFinances, async (req, res) => {
    try {
        await db.run('DELETE FROM m57_plan WHERE id = ?', [req.params.id]);
        res.json({ message: 'Code supprimé du référentiel' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
});

// Column Settings API
app.get('/api/column-settings/:page', authenticateJWT, async (req, res) => {
    const page = req.params.page;
    // Map page to table name
    let tableName = page;
    if (page === 'lines') tableName = 'budget_lines';
    
    let settings = await db.all('SELECT * FROM column_settings WHERE page = ?', [page]);
    
    // Auto-initialize if empty
    if (settings.length === 0) {
        try {
            const cols = await db.all(`PRAGMA table_info(${tableName})`);
            if (cols.length > 0) {
                for (const col of cols) {
                    if (col.name !== 'id') {
                        await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible, display_order) VALUES (?, ?, ?, 1, 0)', [page, col.name, col.name]);
                    }
                }
                settings = await db.all('SELECT * FROM column_settings WHERE page = ?', [page]);
            }
        } catch(e) {
            console.error("Auto-init columns failed:", e);
        }
    }
    res.json(settings);
});

app.post('/api/column-settings/:page', authenticateAdminOrFinances, async (req, res) => {
    const { column_key, is_visible } = req.body;
    await db.run('UPDATE column_settings SET is_visible = ? WHERE page = ? AND column_key = ?', [is_visible ? 1 : 0, req.params.page, column_key]);
    res.json({ message: 'Settings updated' });
});

app.post('/api/column-settings/:page/bulk', authenticateAdminOrFinances, async (req, res) => {
    const settings = req.body;
    if (Array.isArray(settings)) {
        for (const s of settings) {
            await db.run(
                'UPDATE column_settings SET is_visible = ?, display_order = ?, color = ?, is_bold = ?, is_italic = ? WHERE page = ? AND column_key = ?',
                [s.is_visible ? 1 : 0, s.display_order || 0, s.color || null, s.is_bold ? 1 : 0, s.is_italic ? 1 : 0, req.params.page, s.column_key]
            );
        }
    }
    res.json({ message: 'Settings bulk updated' });
});

// Raw Table API
app.get('/api/raw-data/:table', authenticateAdminOrFinances, async (req, res) => {
    const allowedTables = ['orders', 'budget_lines', 'invoices', 'm57_plan', 'operations'];
    if (!allowedTables.includes(req.params.table)) return res.status(403).json({ message: 'Table non autorisée' });
    
    try {
        const query = `SELECT * FROM ${req.params.table}`;
        const data = await db.all(query);
        res.json({ query, data });
    } catch (error) {
        res.status(500).json({ message: 'Erreur SQL', error: error.message });
    }
});

app.post('/api/users', authenticateAdmin, async (req, res) => {
    const { username, password, role, service_code, service_complement } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run('INSERT INTO users (username, password, role, service_code, service_complement) VALUES (?, ?, ?, ?, ?)', [username, hashedPassword, role || 'user', service_code || null, service_complement || null]);
        res.json({ id: result.lastID, username, role: role || 'user', service_code, service_complement });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

app.put('/api/users/:id', authenticateAdmin, async (req, res) => {
    const { username, role, service_code, service_complement, password } = req.body;
    const { id } = req.params;
    console.log(`Tentative de mise à jour utilisateur ID ${id}:`, { username, role, service_code, service_complement });
    
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.run('UPDATE users SET username = ?, password = ?, role = ?, service_code = ?, service_complement = ? WHERE id = ?', [username, hashedPassword, role, service_code, service_complement, id]);
        } else {
            await db.run('UPDATE users SET username = ?, role = ?, service_code = ?, service_complement = ? WHERE id = ?', [username, role, service_code, service_complement, id]);
        }
        console.log(`Succès mise à jour utilisateur ${username}`);
        res.json({ message: 'User updated' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
});

app.delete('/api/users/:id', authenticateAdmin, async (req, res) => {
    // Prevent deleting the last admin or yourself if possible, but for now simple delete
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
});

// Attachments API
app.post('/api/attachments/upload', authenticateJWT, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const { target_type, target_id } = req.body;
    if (!target_type || !target_id) return res.status(400).send('target_type and target_id are required.');

    try {
        const result = await db.run(
            'INSERT INTO attachments (target_type, target_id, file_path, original_name, username) VALUES (?, ?, ?, ?, ?)',
            [target_type, target_id, `uploads/${req.file.filename}`, req.file.originalname, req.user.username]
        );
        res.json({ id: result.lastID, original_name: req.file.originalname });
    } catch (error) {
        res.status(500).json({ message: 'Error saving attachment info', error: error.message });
    }
});

app.get('/api/attachments/:type/:id', authenticateJWT, async (req, res) => {
    const { type, id } = req.params;
    try {
        const attachments = await db.all(
            'SELECT * FROM attachments WHERE target_type = ? AND target_id = ? ORDER BY uploaded_at DESC',
            [type, id]
        );
        res.json(attachments);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching attachments', error: error.message });
    }
});

app.delete('/api/attachments/:id', authenticateJWT, async (req, res) => {
    try {
        const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
        if (!attachment) return res.status(404).json({ message: 'Attachment not found' });

        // Optionally delete physical file
        if (fs.existsSync(attachment.file_path)) {
            fs.unlinkSync(attachment.file_path);
        }

        await db.run('DELETE FROM attachments WHERE id = ?', [req.params.id]);
        res.json({ message: 'Attachment deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting attachment', error: error.message });
    }
});

// Import Orders from Excel
app.post('/api/orders/import', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { cellDates: true });

        let imported = 0;
        let updated = 0;
        for (const row of data) {
            // Get all possible columns for the table (excluding 'id')
            const tableColumns = await db.all("PRAGMA table_info(orders)");
            const colNames = tableColumns.filter(c => c.name !== 'id').map(c => c.name);

            // Special handling for dates
            if (row['Date de la commande'] && typeof row['Date de la commande'] === 'number') {
                const date = new Date((row['Date de la commande'] - 25569) * 86400 * 1000);
                row['Date de la commande'] = date.toISOString().split('T')[0];
            } else if (row['Date de la commande'] instanceof Date) {
                row['Date de la commande'] = row['Date de la commande'].toISOString().split('T')[0];
            }

            const orderNumber = row['N° Commande']?.toString() || row['order_number'];
            const lineNumber = row['N° ligne']?.toString();

            // Check for existence by Order Number AND Line Number
            const exists = await db.get('SELECT id FROM orders WHERE "N° Commande" = ? AND "N° ligne" = ?', [orderNumber, lineNumber]);
            
            const keys = [];
            const values = [];
            const placeholders = [];

            for (const col of colNames) {
                if (row[col] !== undefined) {
                    keys.push(`"${col}"`);
                    values.push(row[col]?.toString());
                    placeholders.push('?');
                }
            }

            if (keys.length > 0) {
                if (!exists) {
                    const query = `INSERT INTO orders (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`;
                    await db.run(query, values);
                    imported++;
                } else {
                    const updateSets = keys.map(k => `${k} = ?`).join(', ');
                    const query = `UPDATE orders SET ${updateSets} WHERE id = ?`;
                    await db.run(query, [...values, exists.id]);
                    updated++;
                }
            }
        }
        await db.run('INSERT INTO import_logs (type, username) VALUES (?, ?)', ['orders', req.user.username]);
        res.json({ message: `${imported} commandes importées, ${updated} mises à jour` });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Erreur lors de l\'import des commandes', error: error.message });
    }
});
