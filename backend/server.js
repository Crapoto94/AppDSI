const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const setupDb = require('./db');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = 3001;
const SECRET_KEY = 'votre_cle_secrete_ici'; // À changer en production

app.use(cors());
app.use(express.json());

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
setupDb().then(database => {
    db = database;
    app.listen(PORT, () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to setup database:', err);
    process.exit(1);
});

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
        const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
        res.json({ accessToken, user: { id: user.id, username: user.username, role: user.role } });
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
    const operations = await db.all('SELECT * FROM operations');
    res.json(operations);
});

// Import Budget Lines from Excel
app.post('/api/budget/import-lines', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let imported = 0;
        let updated = 0;

        // Ensure table has all necessary columns from Excel
        if (data.length > 0) {
            const excelCols = Object.keys(data[0]);
            for (const col of excelCols) {
                try {
                    await db.run(`ALTER TABLE budget_lines ADD COLUMN "${col}" TEXT`);
                } catch (e) {}
                try {
                    await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['lines', col, col, 1]);
                } catch (e) {}
            }
        }

        for (const row of data) {
            const code = row.Code || row.code;
            if (!code) continue; // Skip lines without code
            
            const year = row.Annee || row.year || row.Exercice || 2026;
            row.year = year;

            // Map standard fields for backwards compatibility/internal logic
            const label = row['Libellé'] || row.Libelle || row.label || row['Désignation'] || '';
            const section = row['Section'] || row.section || '';
            let amount = row['Budget voté'] || row['Mt. prévision'] || row.Montant || row.allocated_amount || 0;
            if (typeof amount === 'string') amount = parseFloat(amount.replace(/[^0-9,-]+/g, '').replace(',', '.'));
            
            row.code = code;
            row.label = label;
            row.section = section;
            row.allocated_amount = amount;

            // Check if exists
            const exists = await db.get('SELECT id FROM budget_lines WHERE "Code" = ? AND year = ?', [code, year]);
            
            const cols = Object.keys(row);
            const vals = Object.values(row);
            const placeholders = cols.map(() => '?').join(',');

            if (!exists) {
                await db.run(
                    `INSERT INTO budget_lines (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`,
                    vals
                );
                imported++;
            } else {
                const updateStr = cols.map(c => `"${c}" = ?`).join(',');
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
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

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
        const getDbKey = (excelKey: string) => {
            const trimmed = excelKey.trim();
            return tableCols.find(c => c.trim().toLowerCase() === trimmed.toLowerCase());
        };

        for (const row of data) {
            const mappedRow: any = {};
            Object.keys(row).forEach(excelKey => {
                const dbKey = getDbKey(excelKey);
                if (dbKey) {
                    mappedRow[dbKey] = row[excelKey];
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
    
    const orders = await db.all('SELECT * FROM orders ORDER BY "N° Commande", "N° ligne"');
    
    // Clean each order object to only include valid keys + internal helper fields
    const cleanedOrders = orders.map(order => {
        const cleaned = { id: order.id };
        validKeys.forEach(key => {
            cleaned[key] = order[key];
        });
        // Keep section for row coloring even if column is hidden
        cleaned.section = order.section || order.Section || order['Section'];
        return cleaned;
    });
    
    res.json(cleanedOrders);
});

// Users Management API
// Middleware to update last activity
const updateLastActivity = async (req, res, next) => {
    if (req.user && req.user.username) {
        try {
            await db.run('UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE username = ?', [req.user.username]);
        } catch (e) {
            console.error('Error updating last activity:', e);
        }
    }
    next();
};

app.use(updateLastActivity);

app.get('/api/users', authenticateAdmin, async (req, res) => {
    const users = await db.all('SELECT id, username, role, last_activity FROM users');
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
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, role || 'user']);
        res.json({ id: result.lastID, username, role: role || 'user' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

app.put('/api/users/:id', authenticateAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.run('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?', [username, hashedPassword, role, req.params.id]);
        } else {
            await db.run('UPDATE users SET username = ?, role = ? WHERE id = ?', [username, role, req.params.id]);
        }
        res.json({ message: 'User updated' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
});

app.delete('/api/users/:id', authenticateAdmin, async (req, res) => {
    // Prevent deleting the last admin or yourself if possible, but for now simple delete
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
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
