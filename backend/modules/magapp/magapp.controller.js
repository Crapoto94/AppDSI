const { getSqlite, pgDb, pool } = require('../../shared/database');
const { flattenLDAPEntry, decodeLDAPString } = require('../../shared/utils');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const mariadb = require('mariadb');
const ldap = require('ldapjs');

function formatLocal(d) {
    const y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${M}-${D}T${h}:${m}:${s}`;
}

/**
 * MagApp Controller
 */
const MagAppController = {
    // Categories
    getCategories: async (req, res) => {
        try {
            const categories = await pgDb.all('SELECT * FROM magapp_categories ORDER BY display_order ASC, name ASC');
            res.json(categories);
        } catch (err) {
            console.error('[MAGAPP] Error fetching categories:', err.message);
            res.status(500).json({ message: 'Error fetching categories' });
        }
    },

    createCategory: async (req, res) => {
        try {
            const { name, icon, display_order } = req.body;
            if (!name) return res.status(400).json({ message: 'Le nom est requis' });
            const result = await pgDb.run(
                'INSERT INTO magapp_categories (name, icon, display_order) VALUES (?, ?, ?)',
                [name, icon || '', display_order || 0]
            );
            res.json({ id: result.lastID, message: 'Catégorie créée' });
        } catch (err) {
            console.error('[MAGAPP] Error creating category:', err.message);
            res.status(500).json({ message: 'Error creating category', error: err.message });
        }
    },

    updateCategory: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, icon, display_order } = req.body;
            await pgDb.run(
                'UPDATE magapp_categories SET name = ?, icon = ?, display_order = ? WHERE id = ?',
                [name, icon || '', display_order || 0, id]
            );
            res.json({ message: 'Catégorie mise à jour' });
        } catch (err) {
            console.error('[MAGAPP] Error updating category:', err.message);
            res.status(500).json({ message: 'Error updating category', error: err.message });
        }
    },

    deleteCategory: async (req, res) => {
        try {
            const { id } = req.params;
            await pgDb.run('DELETE FROM magapp_categories WHERE id = ?', [id]);
            res.json({ message: 'Catégorie supprimée' });
        } catch (err) {
            console.error('[MAGAPP] Error deleting category:', err.message);
            res.status(500).json({ message: 'Error deleting category', error: err.message });
        }
    },

    // Apps
    getApps: async (req, res) => {
        try {
            let apps = await pgDb.all(`
                SELECT a.*,
                CASE WHEN (SELECT COUNT(*) FROM magapp.maintenances WHERE app_id = a.id AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP) > 0 THEN 1 ELSE a.is_maintenance END as is_maintenance,
                (SELECT COUNT(*) FROM magapp.app_users WHERE app_id = a.id) as user_count,
                (SELECT COUNT(*) FROM magapp.app_docs WHERE app_id = a.id AND is_obsolete = FALSE AND is_technical = FALSE) as normal_doc_count,
                (SELECT COUNT(*) FROM magapp.app_docs WHERE app_id = a.id AND is_obsolete = FALSE AND is_technical = TRUE) as technical_doc_count,
                (SELECT COUNT(*) FROM magapp.maintenances WHERE app_id = a.id AND start_date > CURRENT_TIMESTAMP) as future_maintenance_count,
                (SELECT COUNT(*) FROM magapp.maintenances WHERE app_id = a.id AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP) as ongoing_maintenance_count
                FROM magapp_apps a
                ORDER BY a.name ASC
            `);
            // Hide DSI-only apps for non-admin users (admin = global admin OR user with magapp tile)
            let isMagappAdmin = req.user && (req.user.role === 'admin' || req.user.username?.toLowerCase() === 'admin');
            if (!isMagappAdmin && req.user && req.user.id) {
                try {
                    const db = getSqlite();
                    const authorized = await db.get(`
                        SELECT 1 FROM user_tiles ut
                        JOIN tile_links tl ON ut.tile_id = tl.tile_id
                        WHERE ut.user_id = ? AND tl.url = '/admin/magapp'
                    `, [req.user.id]);
                    isMagappAdmin = !!authorized;
                } catch (e) {
                    console.error('[MAGAPP] Error checking tile for DSI-only filter:', e.message);
                }
            }
            if (!isMagappAdmin) {
                apps = apps.filter(a => !a.dsi_only);
            }
            res.json(apps);
        } catch (err) {
            console.error('[MAGAPP] Error fetching apps:', err.message);
            res.status(500).json({ message: 'Error fetching apps' });
        }
    },

    createApp: async (req, res) => {
        try {
            const { name, category_id, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, mercator_id, mercator_name, project_manager_username, project_manager_name, dsi_only } = req.body;

            const result = await pgDb.run(`
                INSERT INTO magapp_apps (name, category_id, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, mercator_id, mercator_name, project_manager_username, project_manager_name, dsi_only)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [name, category_id, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, mercator_id, mercator_name, project_manager_username || '', project_manager_name || '', dsi_only ? 1 : 0]);

            res.json({ id: result.lastID, message: 'Application créée' });
        } catch (err) {
            console.error('[MAGAPP] Error creating app:', err.message);
            res.status(500).json({ message: 'Error creating app', error: err.message });
        }
    },

    updateApp: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, category_id, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, mercator_id, mercator_name, project_manager_username, project_manager_name, dsi_only } = req.body;

            await pgDb.run(`
                UPDATE magapp_apps
                SET name = ?, category_id = ?, description = ?, url = ?, icon = ?, display_order = ?, is_maintenance = ?, maintenance_start = ?, maintenance_end = ?, app_type = ?, present_magapp = ?, present_onboard = ?, email_createur = ?, mercator_id = ?, mercator_name = ?, project_manager_username = ?, project_manager_name = ?, dsi_only = ?
                WHERE id = ?
            `, [name, category_id, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, mercator_id, mercator_name, project_manager_username || '', project_manager_name || '', dsi_only ? 1 : 0, id]);

            res.json({ message: 'Application mise à jour' });
        } catch (err) {
            console.error('[MAGAPP] Error updating app:', err.message);
            res.status(500).json({ message: 'Error updating app', error: err.message });
        }
    },

    deleteApp: async (req, res) => {
        try {
            const { id } = req.params;

            await pgDb.run('DELETE FROM magapp_apps WHERE id = ?', [id]);

            res.json({ message: 'Application supprimée' });
        } catch (err) {
            console.error('[MAGAPP] Error deleting app:', err.message);
            res.status(500).json({ message: 'Error deleting app', error: err.message });
        }
    },

    // Mercator Apps (MariaDB)
    getMercatorApps: async (req, res) => {
        try {
            const db = getSqlite();
            const mariadbSettings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', ['MAIN']);
            if (!mariadbSettings || !mariadbSettings.is_enabled) {
                return res.json([]);
            }
            const conn = await mariadb.createConnection({
                host: mariadbSettings.host, 
                port: mariadbSettings.port, 
                user: mariadbSettings.user,
                password: mariadbSettings.password, 
                database: mariadbSettings.database, 
                connectTimeout: 5000
            });
            const rows = await conn.query('SELECT id, name, description FROM m_applications ORDER BY name');
            await conn.end();
            res.json(rows);
        } catch (err) {
            console.error('[MAGAPP] Error fetching mercator apps:', err.message);
            res.json([]);
        }
    },

    // Health Check
    healthCheck: async (req, res) => {
        try {
            const apps = await pgDb.all('SELECT id, url FROM magapp_apps WHERE is_maintenance = 0');
            const results = {};

            const checkApp = async (app) => {
                if (!app.url || !app.url.startsWith('http')) {
                    results[app.id] = 'fail';
                    return;
                }
                try {
                    const config = {
                        timeout: 5000,
                        validateStatus: (status) => (status >= 200 && status < 400) || status === 401 || status === 403
                    };

                    try {
                        await axios.head(app.url.trim(), config);
                        results[app.id] = 'ok';
                    } catch (error) {
                        await axios.get(app.url.trim(), config);
                        results[app.id] = 'ok';
                    }
                } catch (error) {
                    results[app.id] = 'fail';
                }
            };

            const BATCH_SIZE = 10;
            for (let i = 0; i < apps.length; i += BATCH_SIZE) {
                const batch = apps.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(checkApp));
            }

            res.json({ results });
        } catch (err) {
            console.error('[MAGAPP] Health Check Error:', err);
            res.status(500).json({ message: 'Erreur lors du test des applications' });
        }
    },

    // Favorites
    getFavorites: async (req, res) => {
        const { username } = req.query;
        if (!username) return res.status(400).json({ message: 'Username requis' });
        try {
            const favorites = await pgDb.all('SELECT app_id FROM magapp_favorites WHERE username = ?', [username]);
            res.json(favorites.map(f => f.app_id));
        } catch (err) {
            console.error('[MAGAPP] Error reading favorites:', err.message);
            res.status(500).json({ message: 'Erreur lecture favoris' });
        }
    },

    addFavorite: async (req, res) => {
        const { username, app_id } = req.body;
        if (!username || !app_id) return res.status(400).json({ message: 'Données manquantes' });
        try {
            await pgDb.run('INSERT INTO magapp_favorites (username, app_id) VALUES (?, ?)', [username, app_id]);
            res.json({ message: 'Ajouté aux favoris' });
        } catch (err) {
            console.error('[MAGAPP] Error adding favorite:', err.message);
            res.status(500).json({ message: 'Erreur ajout favoris' });
        }
    },

    removeFavorite: async (req, res) => {
        const { username, app_id } = req.query;
        if (!username || !app_id) return res.status(400).json({ message: 'Données manquantes' });
        try {
            await pgDb.run('DELETE FROM magapp_favorites WHERE username = ? AND app_id = ?', [username, app_id]);
            res.json({ message: 'Retiré des favoris' });
        } catch (err) {
            console.error('[MAGAPP] Error removing favorite:', err.message);
            res.status(500).json({ message: 'Erreur suppression favoris' });
        }
    },

    // Tracking
    recordClick: async (req, res) => {
        const { app_id, username } = req.body;
        const ip_address = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];

        try {
            await pgDb.run(
                'INSERT INTO magapp_clicks (app_id, username, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [app_id, username || 'Anonyme', ip_address, user_agent]
            );

            if (username && username !== 'Anonyme') {
                try {
                    let displayName = username;
                    const db = getSqlite();
                    const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
                    if (adSettings && adSettings.is_enabled) {
                        const ldapResult = await new Promise((resolve, reject) => {
                            const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                                if (err) { client.destroy(); return reject(err); }

                                const filter = `(sAMAccountName=${username})`;
                                const entries = [];
                                client.search(adSettings.base_dn, {
                                    filter,
                                    scope: 'sub',
                                    attributes: ['displayName', 'cn'],
                                    sizeLimit: 1
                                }, (err, searchRes) => {
                                    if (err) { client.destroy(); return reject(err); }
                                    searchRes.on('searchEntry', (entry) => {
                                        const obj = flattenLDAPEntry(entry);
                                        if (obj) entries.push(obj);
                                    });
                                    searchRes.on('end', () => { client.destroy(); resolve(entries.length > 0 ? entries[0] : null); });
                                    searchRes.on('error', (err) => { client.destroy(); reject(err); });
                                });
                            });
                        });
                        if (ldapResult && ldapResult.displayName) {
                            displayName = ldapResult.displayName;
                        }
                    }

                    await pgDb.run(`
                        INSERT INTO magapp.app_users (app_id, username, display_name, last_connection, source)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'magapp')
                        ON CONFLICT (app_id, username)
                        DO UPDATE SET last_connection = EXCLUDED.last_connection, display_name = EXCLUDED.display_name
                    `, [app_id, username.toLowerCase(), displayName]);
                } catch (trackErr) {
                    console.warn('[MAGAPP TRACK] Error auto-tracking user:', trackErr.message);
                }
            }

            res.json({ message: 'Click recorded' });
        } catch (error) {
            console.error('[MAGAPP TRACK] Error recording click:', error.message);
            res.status(500).json({ message: 'Error recording click', error: error.message });
        }
    },

    // Subscriptions
    subscribe: async (req, res) => {
        const { app_id, email } = req.body;
        if (!app_id || !email) return res.status(400).json({ message: 'Données manquantes' });

        try {
            await pgDb.run(
                'INSERT INTO magapp_subscriptions (app_id, email) VALUES (?, ?)',
                [app_id, email]
            );
            res.json({ message: 'Vous recevrez désormais les notifications de maintenance pour cette application.' });
        } catch (error) {
            console.error('[MAGAPP] Error subscribing:', error.message);
            res.status(500).json({ message: "Erreur lors de l'abonnement", error: error.message });
        }
    },

    getUserSubscriptions: async (req, res) => {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: 'Email requis' });
        try {
            const subs = await pgDb.all('SELECT app_id FROM magapp_subscriptions WHERE email = ?', [email]);
            res.json(subs.map(s => s.app_id));
        } catch (err) {
            console.error('[MAGAPP] Error fetching user subscriptions:', err.message);
            res.status(500).json({ message: 'Erreur lecture abonnements' });
        }
    },

    unsubscribe: async (req, res) => {
        const { email, app_id } = req.query;
        if (!email || !app_id) return res.status(400).json({ message: 'Données manquantes' });
        try {
            await pgDb.run('DELETE FROM magapp_subscriptions WHERE email = ? AND app_id = ?', [email, app_id]);
            res.json({ message: 'Désabonné avec succès' });
        } catch (err) {
            console.error('[MAGAPP] Error unsubscribing:', err.message);
            res.status(500).json({ message: 'Erreur désabonnement' });
        }
    },

    // Admin Subscriptions
    getAllSubscriptions: async (req, res) => {
        try {
            const subs = await pgDb.all(`
                SELECT s.*, a.name as app_name 
                FROM magapp_subscriptions s
                JOIN magapp_apps a ON s.app_id = a.id
                ORDER BY a.name, s.email
            `);
            res.json(subs);
        } catch (error) {
            console.error('[MAGAPP] Error fetching all subscriptions:', error.message);
            res.status(500).json({ message: 'Erreur lecture abonnements', error: error.message });
        }
    },

    deleteSubscription: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM magapp_subscriptions WHERE id = ?', [req.params.id]);
            res.json({ message: 'Abonnement supprimé' });
        } catch (error) {
            console.error('[MAGAPP] Error deleting subscription:', error.message);
            res.status(500).json({ message: 'Erreur suppression abonnement', error: error.message });
        }
    },

    // GLPI Tickets for MagApp
    getUserTickets: async (req, res) => {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: 'Email requis' });
        try {
            const username = email.split('@')[0].toLowerCase();
            console.log(`[MAGAPP TICKETS] Searching for ${email} / ${username}`);
            const tickets = await pgDb.all(`
                SELECT t.glpi_id, t.title, t.content, s.label as status_label, t.date_creation, t.type, t.status, t.solution
                FROM glpi.tickets t
                LEFT JOIN glpi.ticket_status s ON t.status = s.id
                WHERE LOWER(COALESCE(t.email_alt, '')) = $1
                   OR LOWER(COALESCE(t.requester_email_22, '')) = $1
                   OR LOWER(COALESCE(REPLACE(t.email_alt, '@ivry94.fr', ''), '')) = $2
                   OR LOWER(COALESCE(REPLACE(t.requester_email_22, '@ivry94.fr', ''), '')) = $2
                ORDER BY t.glpi_id DESC
            `, [email.toLowerCase(), username]);
            console.log(`[MAGAPP TICKETS] Found ${tickets.length} tickets for ${email}`);
            res.json(tickets);
        } catch (err) {
            console.error('[MAGAPP] Erreur tickets list:', err);
            res.status(500).json({ message: 'Erreur lecture tickets' });
        }
    },

    getTicketsCount: async (req, res) => {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: 'Email requis' });
        try {
            const username = email.split('@')[0].toLowerCase();
            const result = await pgDb.get(`
                SELECT COUNT(*) as count 
                FROM glpi.tickets t
                WHERE (LOWER(COALESCE(t.email_alt, '')) = $1 
                   OR LOWER(COALESCE(t.requester_email_22, '')) = $1
                   OR LOWER(COALESCE(REPLACE(t.email_alt, '@ivry94.fr', ''), '')) = $2
                   OR LOWER(COALESCE(REPLACE(t.requester_email_22, '@ivry94.fr', ''), '')) = $2) AND t.status != 6
            `, [email.toLowerCase(), username]);
            res.json({ count: result?.count || 0 });
        } catch (err) {
            console.error('[MAGAPP] Erreur tickets-count:', err);
            res.status(500).json({ message: 'Erreur lecture tickets' });
        }
    },

    getHighPriorityIncidents: async (req, res) => {
        try {
            const tickets = await pgDb.all(`
                SELECT t.glpi_id, t.title, s.label as status_label, t.date_creation
                FROM glpi.tickets t
                LEFT JOIN glpi.ticket_status s ON t.status = s.id
                WHERE t.type = '1' AND (t.urgency >= 5 OR t.priority >= 5) AND t.status NOT IN (5, 6)
                ORDER BY t.date_creation DESC
                LIMIT 5
            `);
            res.json(tickets);
        } catch (err) {
            console.error('[MAGAPP] Erreur high priority incidents:', err);
            res.status(500).json({ message: 'Erreur lecture incidents haute priorité' });
        }
    },

    getObservedTickets: async (req, res) => {
        const { email, showClosed } = req.query;
        if (!email) return res.status(400).json({ message: 'Email requis' });
        try {
            const includeClosed = showClosed === 'true';
            const whereClause = includeClosed 
                ? `(LOWER(COALESCE(o.email, '')) = $1 OR LOWER(COALESCE(REPLACE(o.email, '@ivry94.fr', ''), '')) = $2)`
                : `(LOWER(COALESCE(o.email, '')) = $1 OR LOWER(COALESCE(REPLACE(o.email, '@ivry94.fr', ''), '')) = $2) AND t.status NOT IN (5, 6)`;
            
            const tickets = await pool.query(`
                SELECT t.glpi_id, t.title, t.content, s.label as status_label, t.date_creation, t.type, t.status, t.solution,
                       COALESCE(NULLIF(t.requester_email_22, ''), LOWER(o.email)) as requester_email,
                       COALESCE(NULLIF(t.requester_name, ''), t.requester_email_22, REPLACE(o.email, '@ivry94.fr', '')) as requester_name
                FROM glpi.tickets t
                INNER JOIN glpi.observers o ON t.glpi_id = o.ticket_id
                LEFT JOIN glpi.ticket_status s ON t.status = s.id
                WHERE ${whereClause}
                ORDER BY t.glpi_id DESC
            `, [email.toLowerCase(), email.toLowerCase().split('@')[0]]);

            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (adSettings && adSettings.is_enabled) {
                const uniqueIdentifiers = [...new Set(tickets.rows.map(t => t.requester_name).filter(n => n))];
                const nameCache = {};
                for (const identifier of uniqueIdentifiers) {
                    try {
                        const sam = identifier.includes('@') ? identifier.split('@')[0] : identifier;
                        const resolved = await new Promise((resolve) => {
                            const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                            const timeout = setTimeout(() => { client.destroy(); resolve(null); }, 3000);
                            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                                if (err) { clearTimeout(timeout); client.destroy(); resolve(null); return; }
                                client.search(adSettings.base_dn, { 
                                    filter: `(|(sAMAccountName=${sam})(employeeID=${sam})(description=*${sam}*))`, 
                                    scope: 'sub', 
                                    attributes: ['displayName', 'cn'] 
                                }, (err, searchRes) => {
                                    if (err) { clearTimeout(timeout); client.destroy(); resolve(null); return; }
                                    let found = null;
                                    searchRes.on('searchEntry', (entry) => { if (!found) found = flattenLDAPEntry(entry); });
                                    searchRes.on('end', () => { clearTimeout(timeout); client.destroy(); resolve(found); });
                                    searchRes.on('error', () => { clearTimeout(timeout); client.destroy(); resolve(null); });
                                });
                            });
                        });
                        if (resolved) {
                            nameCache[identifier] = decodeLDAPString(resolved.displayName || resolved.cn) || null;
                        }
                    } catch (e) { /* ignore lookup failures */ }
                }
                tickets.rows.forEach(t => {
                    const resolved = nameCache[t.requester_name];
                    if (resolved) {
                        t.requester_name = resolved;
                    } else if (/^\d+$/.test(t.requester_name) && t.requester_email) {
                        t.requester_name = t.requester_email.split('@')[0];
                    }
                });
            }

            res.json(tickets.rows);
        } catch (err) {
            console.error('[MAGAPP] Erreur observed tickets list:', err);
            res.status(500).json({ message: 'Erreur lecture tickets observés' });
        }
    },

    // Icons
    getIcons: (req, res) => {
        const dir = path.join(__dirname, '..', '..', 'magapp_img');
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const files = fs.readdirSync(dir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f));
            res.json(imageFiles.map(f => `/img/${f}`));
        } catch (err) {
            console.error('[MAGAPP] Error reading icons:', err.message);
            res.status(500).json({ message: 'Error reading icons', error: err.message });
        }
    },

    // Settings
    getSettings: async (req, res) => {
        try {
            const result = await pgDb.get('SELECT * FROM magapp.settings WHERE id = 1');
            if (!result) return res.status(404).json({ message: 'Settings not found' });

            const isRealRequest = req.query.real === 'true';
            let isSpecialUser = false;
            
            console.log(`[MAGAPP SETTINGS] Fetching for user: ${req.user ? req.user.username : 'NULL'} (Role: ${req.user ? req.user.role : 'N/A'})`);
            console.log(`[MAGAPP SETTINGS] Auth Header present: ${!!req.headers.authorization}`);

            if (!isRealRequest) {
                try {
                    const db = getSqlite();
                    if (req.user) {
                        if (req.user.role === 'admin' || req.user.username?.toLowerCase() === 'admin' || req.user.username?.toLowerCase() === 'adminhub') {
                            isSpecialUser = true;
                            console.log(`[MAGAPP SETTINGS] User ${req.user.username} is ADMIN (bypass)`);
                        } else {
                            const tileLink = await db.get(`
                                SELECT 1 FROM user_tiles ut 
                                JOIN tile_links tl ON ut.tile_id = tl.tile_id 
                                WHERE ut.user_id = ? AND tl.url = '/admin/magapp'
                            `, [req.user.id]);
                            if (tileLink) {
                                isSpecialUser = true;
                                console.log(`[MAGAPP SETTINGS] User ${req.user.username} has admin tile access`);
                            } else {
                                console.log(`[MAGAPP SETTINGS] User ${req.user.username} (ID: ${req.user.id}) NO admin tile access`);
                            }
                        }
                    } else {
                        // Fallback for anonymous or token-less (legacy)
                        const { username, email } = req.query;
                        const identifier = (username || (email && email.split('@')[0]) || '').toLowerCase().trim();
                        if (identifier) {
                            const user = await db.get('SELECT id, role, username FROM users WHERE LOWER(username) = ?', [identifier]);
                            if (user) {
                                if (user.role === 'admin' || user.username?.toLowerCase() === 'admin' || user.username?.toLowerCase() === 'adminhub') {
                                    isSpecialUser = true;
                                } else {
                                    const tileLink = await db.get(`SELECT 1 FROM user_tiles ut JOIN tile_links tl ON ut.tile_id = tl.tile_id WHERE ut.user_id = ? AND tl.url = '/admin/magapp'`, [user.id]);
                                    if (tileLink) isSpecialUser = true;
                                }
                            }
                        }
                    }
                } catch (e) { console.error('[MAGAPP SETTINGS] Beta check error:', e.message); }
            }
            
            if (isSpecialUser) {
                result.is_beta_user = true;
                // Save originals before forcing them to true
                result.show_tickets_original = result.show_tickets;
                result.show_subscriptions_original = result.show_subscriptions;
                result.show_health_check_original = result.show_health_check;
                result.show_create_buttons_original = result.show_create_buttons;
                result.show_ideas_original = result.show_ideas;
                result.show_rencontres_original = result.show_rencontres;
                result.show_library_original = result.show_library;

                result.show_tickets = true;
                result.show_subscriptions = true;
                result.show_health_check = true;
                result.show_create_buttons = true;
                result.show_ideas = true;
                result.show_rencontres = true;
                result.show_library = true;
            } else {
                result.show_tickets_original = result.show_tickets;
                result.show_subscriptions_original = result.show_subscriptions;
                result.show_health_check_original = result.show_health_check;
                result.show_create_buttons_original = result.show_create_buttons;
                result.show_ideas_original = result.show_ideas;
                result.show_rencontres_original = result.show_rencontres;
                result.show_library_original = result.show_library;
            }

            let hasRencontresAccess = false;
            try {
                const { username, email } = req.query;
                const identifier = (username || (email && email.split('@')[0]) || '').toLowerCase().trim();
                if (identifier) {
                    const directionEmail = await pgDb.get('SELECT 1 FROM direction_emails WHERE email LIKE ? OR email LIKE ?', [`${identifier}@%`, `${identifier}%`]);
                    hasRencontresAccess = !!directionEmail;
                    if (!hasRencontresAccess) {
                        const participantCheck = await pgDb.get(
                            'SELECT 1 FROM reunion_participants WHERE LOWER(email) = ? OR LOWER(email) = ?',
                            [`${identifier}@ivry94.fr`, identifier]
                        );
                        hasRencontresAccess = !!participantCheck;
                    }
                }
            } catch (e) { console.error('[MAGAPP SETTINGS] Rencontres access check error:', e.message); }
            
            result.has_rencontres_access = hasRencontresAccess;
            res.json(result);
        } catch (error) {
            console.error('[MAGAPP] Error fetching settings:', error.message);
            res.status(500).json({ message: 'Error fetching MagApp settings' });
        }
    },

    updateSettings: async (req, res) => {
        const { show_tickets, show_subscriptions, show_health_check, show_create_buttons, show_ideas, show_rencontres, show_library } = req.body;
        try {
            await pgDb.run('UPDATE magapp.settings SET show_tickets = $1, show_subscriptions = $2, show_health_check = $3, show_create_buttons = $4, show_ideas = $5, show_rencontres = $6, show_library = $7 WHERE id = 1',
                [!!show_tickets, !!show_subscriptions, !!show_health_check, !!show_create_buttons, !!show_ideas, !!show_rencontres, !!show_library]);
            res.json({ message: 'Settings updated' });
        } catch (error) {
            console.error('[MAGAPP] Error updating settings:', error.message);
            res.status(500).json({ message: 'Error updating MagApp settings', error: error.message });
        }
    },

    // App Users
    getAppUsers: async (req, res) => {
        try {
            const users = await pgDb.all(
                `SELECT id, app_id, username, display_name, source,
                        (last_connection AT TIME ZONE 'UTC') as last_connection
                 FROM magapp.app_users
                 WHERE app_id = ?
                 ORDER BY last_connection DESC NULLS LAST`,
                [req.params.id]
            );

            const formattedUsers = users.map(user => {
                let formattedDate = null;
                if (user.last_connection) {
                    try {
                        let date = user.last_connection instanceof Date ? user.last_connection : new Date(user.last_connection + (String(user.last_connection).includes('Z') ? '' : 'Z'));
                        const parisDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
                        const day = String(parisDate.getUTCDate()).padStart(2, '0');
                        const month = String(parisDate.getUTCMonth() + 1).padStart(2, '0');
                        const year = parisDate.getUTCFullYear();
                        const hours = String(parisDate.getUTCHours()).padStart(2, '0');
                        const minutes = String(parisDate.getUTCMinutes()).padStart(2, '0');
                        formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
                    } catch (e) {
                        formattedDate = user.last_connection;
                    }
                }
                return { ...user, last_connection: formattedDate };
            });

            res.json(formattedUsers);
        } catch (error) {
            console.error('[MAGAPP] Error fetching app users:', error.message);
            res.status(500).json({ message: 'Erreur lors de la recuperation des utilisateurs', error: error.message });
        }
    },

    addAppUser: async (req, res) => {
        const { username, display_name } = req.body;
        if (!username) return res.status(400).json({ message: 'Username requis' });
        try {
            await pgDb.run(`
                INSERT INTO magapp.app_users (app_id, username, display_name, last_connection, source)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'admin')
                ON CONFLICT (app_id, username)
                DO UPDATE SET last_connection = EXCLUDED.last_connection, display_name = EXCLUDED.display_name, source = EXCLUDED.source
            `, [req.params.id, username.toLowerCase(), display_name || username]);
            res.json({ message: 'Utilisateur ajoute/mis a jour' });
        } catch (error) {
            console.error('[MAGAPP] Error adding app user:', error.message);
            res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'utilisateur', error: error.message });
        }
    },

    removeAppUser: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM magapp.app_users WHERE app_id = ? AND username = ?', [req.params.id, req.params.username.toLowerCase()]);
            res.json({ message: 'Utilisateur retire' });
        } catch (error) {
            console.error('[MAGAPP] Error removing app user:', error.message);
            res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
        }
    },

    // Versions
    getVersions: async (req, res) => {
        try {
            const versions = await pgDb.all('SELECT * FROM magapp.versions ORDER BY release_date DESC');
            res.json(versions);
        } catch (error) {
            console.error('[MAGAPP] Error fetching versions:', error.message);
            res.status(500).json({ message: 'Error fetching MagApp versions', error: error.message });
        }
    },

    createVersion: async (req, res) => {
        const { version_number, release_notes_html } = req.body;
        try {
            const result = await pgDb.run(
                'INSERT INTO magapp.versions (version_number, release_notes_html) VALUES (?, ?)',
                [version_number, release_notes_html || '']
            );
            res.json({ id: result.lastID, message: 'Version créée' });
        } catch (error) {
            console.error('[MAGAPP] Error creating version:', error.message);
            res.status(500).json({ message: 'Erreur création de version', error: error.message });
        }
    },

    updateVersion: async (req, res) => {
        const { version_number, release_notes_html } = req.body;
        try {
            await pgDb.run(
                'UPDATE magapp.versions SET version_number = ?, release_notes_html = ? WHERE id = ?',
                [version_number, release_notes_html, req.params.id]
            );
            res.json({ message: 'Version mise à jour' });
        } catch (error) {
            console.error('[MAGAPP] Error updating version:', error.message);
            res.status(500).json({ message: 'Erreur mise à jour de version', error: error.message });
        }
    },

    deleteVersion: async (req, res) => {
        try {
            const result = await pgDb.run('DELETE FROM magapp.versions WHERE id = ?', [parseInt(req.params.id)]);
            if (result.changes === 0) return res.status(404).json({ message: 'Version non trouvée' });
            res.json({ message: 'Version supprimée' });
        } catch (error) {
            console.error('[MAGAPP] Error deleting version:', error.message);
            res.status(500).json({ message: 'Erreur suppression de version', error: error.message });
        }
    },

    activateVersion: async (req, res) => {
        try {
            await pgDb.run('UPDATE magapp.versions SET is_active = FALSE');
            await pgDb.run('UPDATE magapp.versions SET is_active = TRUE WHERE id = ?', [req.params.id]);
            res.json({ message: 'Version définie comme principale (active)' });
        } catch (error) {
            console.error('[MAGAPP] Error activating version:', error.message);
            res.status(500).json({ message: 'Erreur bascule de version', error: error.message });
        }
    },

    getUserVersion: async (req, res) => {
        try {
            const username = req.user.username;
            let pref = await pgDb.get('SELECT * FROM magapp.user_versions WHERE username = ?', [username]);
            if (!pref) pref = { username, last_seen_version_id: null };
            res.json(pref);
        } catch (error) {
            console.error('[MAGAPP] Error fetching user version prefs:', error.message);
            res.status(500).json({ message: 'Error fetching user version prefs', error: error.message });
        }
    },

    recordUserVersionSeen: async (req, res) => {
        const { version_id } = req.body;
        const username = req.user.username;
        try {
            const existing = await pgDb.get('SELECT username FROM magapp.user_versions WHERE username = ?', [username]);
            if (existing) {
                await pgDb.run('UPDATE magapp.user_versions SET last_seen_version_id = ?, seen_at = CURRENT_TIMESTAMP WHERE username = ?', [version_id, username]);
            } else {
                await pgDb.all(`INSERT INTO magapp.user_versions (username, last_seen_version_id, seen_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [username, version_id]);
            }
            res.json({ message: 'Version vue enregistrée' });
        } catch (error) {
            console.error('[MAGAPP] Error updating user version pref:', error.message);
            res.status(500).json({ message: 'Error updating user version pref', error: error.message });
        }
    },

    // AD User Search
    searchADUsers: async (req, res) => {
        const { query } = req.body;
        if (!query || query.length < 2) return res.json([]);
        try {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) return res.status(503).json({ message: 'AD Desactive' });

            const results = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }
                    const filter = `(&(objectClass=user)(|(sAMAccountName=*${query}*)(displayName=*${query}*)(cn=*${query}*)))`;
                    const entries = [];
                    client.search(adSettings.base_dn, { filter, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn', 'mail'], sizeLimit: 20 }, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => {
                            const obj = flattenLDAPEntry(entry);
                            if (obj && obj.sAMAccountName) entries.push(obj);
                        });
                        searchRes.on('end', () => { client.destroy(); resolve(entries); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            });

            res.json(results.map(r => ({
                username: r.sAMAccountName,
                displayName: r.displayName || r.cn || r.sAMAccountName,
                email: r.mail || ''
            })));
        } catch (error) {
            console.error('[MAGAPP] Error searching AD users:', error.message);
            res.status(500).json({ message: 'Erreur lors de la recherche AD', error: error.message });
        }
    },

    // Statistics
    getStats: async (req, res) => {
        try {
            const stats = await pgDb.all(`
                SELECT 
                    a.id, 
                    a.name, 
                    COUNT(c.id) as total_clicks,
                    COUNT(DISTINCT c.username) as total_users,
                    COUNT(CASE WHEN c.clicked_at >= CURRENT_DATE THEN 1 END) as today_clicks,
                    COALESCE(COUNT(c.id)::float / NULLIF(COUNT(DISTINCT c.clicked_at::date), 0), 0) as avg_clicks_per_day,
                    COALESCE(COUNT(DISTINCT c.username)::float / NULLIF(COUNT(DISTINCT c.clicked_at::date), 0), 0) as avg_unique_users_per_day
                FROM magapp_apps a
                LEFT JOIN magapp_clicks c ON a.id = c.app_id
                GROUP BY a.id, a.name
                ORDER BY total_clicks DESC
            `);
            res.json(stats);
        } catch (error) {
            console.error('[MAGAPP] Error fetching stats:', error.message);
            res.status(500).json({ message: 'Error fetching MagApp stats' });
        }
    },

    // Library
    getAppDocs: async (req, res) => {
        try {
            const { id } = req.params;
            
            let isAdmin = false;
            console.log(`[MAGAPP DOCS] Fetching docs for app ${id}. User: ${req.user ? req.user.username : 'NULL'}`);
            if (req.user) {
                if (req.user.role === 'admin' || req.user.username?.toLowerCase() === 'admin' || req.user.username?.toLowerCase() === 'adminhub') {
                    isAdmin = true;
                } else {
                    try {
                        const db = getSqlite();
                        const authorized = await db.get(`
                            SELECT 1 FROM user_tiles ut 
                            JOIN tile_links tl ON ut.tile_id = tl.tile_id 
                            WHERE ut.user_id = ? AND tl.url = '/admin/magapp'
                        `, [req.user.id]);
                        if (authorized) isAdmin = true;
                    } catch (e) { console.error('[MAGAPP] Error checking admin status for docs:', e.message); }
                }
            }

            const docs = await pgDb.all(`
                SELECT * FROM magapp.app_docs 
                WHERE app_id = ? AND is_obsolete = FALSE 
                ${!isAdmin ? 'AND is_technical = FALSE' : ''}
                ORDER BY is_favorite DESC, created_at DESC
            `, [id]);
            res.json(docs);
        } catch (error) {
            console.error('[MAGAPP] Error fetching app docs:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des documents' });
        }
    },

    recordDocInteraction: async (req, res) => {
        try {
            const { id } = req.params;
            const { type, rating } = req.body;
            const username = req.user?.username || 'Anonyme';

            await pool.query(`
                INSERT INTO magapp.doc_interactions (doc_id, username, interaction_type, rating)
                VALUES ($1, $2, $3, $4)
            `, [id, username, type, rating]);

            res.json({ message: 'Interaction enregistrée' });
        } catch (error) {
            console.error('[MAGAPP] Error recording doc interaction:', error.message);
            res.status(500).json({ message: 'Erreur lors de l\'enregistrement de l\'interaction' });
        }
    },

    getAllDocs: async (req, res) => {
        try {
            const docs = await pgDb.all(`
                SELECT d.*, a.name as app_name 
                FROM magapp.app_docs d
                JOIN magapp_apps a ON d.app_id = a.id
                ORDER BY d.created_at DESC
            `);
            res.json(docs);
        } catch (error) {
            console.error('[MAGAPP] Error fetching all docs:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des documents' });
        }
    },

    createDoc: async (req, res) => {
        try {
            const { app_id, title, description, doc_type, url, is_favorite, is_technical } = req.body;
            const result = await pool.query(`
                INSERT INTO magapp.app_docs (app_id, title, description, doc_type, url, is_favorite, is_technical)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `, [app_id, title, description || '', doc_type, url, is_favorite || false, is_technical || false]);
            res.json({ message: 'Document créé', id: result.rows[0].id });
        } catch (error) {
            console.error('[MAGAPP] Error creating doc:', error.message);
            res.status(500).json({ message: 'Erreur lors de la création du document' });
        }
    },

    updateDoc: async (req, res) => {
        try {
            const { id } = req.params;
            const { title, description, app_id, doc_type, url, is_obsolete, is_favorite, is_technical } = req.body;
            await pool.query(`
                UPDATE magapp.app_docs 
                SET title = $1, description = $2, app_id = $3, doc_type = $4, url = $5, is_obsolete = $6, is_favorite = $7, is_technical = $8
                WHERE id = $9
            `, [title, description || '', app_id, doc_type, url, is_obsolete || false, is_favorite || false, is_technical || false, id]);
            res.json({ message: 'Document mis à jour' });
        } catch (error) {
            console.error('[MAGAPP] Error updating doc:', error.message);
            res.status(500).json({ message: 'Erreur lors de la mise à jour du document' });
        }
    },

    deleteDoc: async (req, res) => {
        try {
            const { id } = req.params;
            if (!id || isNaN(Number(id))) {
                return res.status(400).json({ message: 'ID de document invalide' });
            }
            await pool.query('DELETE FROM magapp.doc_interactions WHERE doc_id = $1', [id]);
            await pool.query('DELETE FROM magapp.app_docs WHERE id = $1', [id]);
            res.json({ message: 'Document supprimé' });
        } catch (error) {
            console.error('[MAGAPP] Error deleting doc:', error.message, error.stack);
            res.status(500).json({ message: 'Erreur lors de la suppression du document' });
        }
    },

    getDocStats: async (req, res) => {
        try {
            const stats = await pgDb.all(`
                SELECT 
                    d.id, d.title, a.name as app_name,
                    COUNT(CASE WHEN i.interaction_type = 'view' THEN 1 END) as total_views,
                    AVG(i.rating) as avg_rating,
                    COUNT(CASE WHEN i.interaction_type = 'rating' THEN 1 END) as total_ratings
                FROM magapp.app_docs d
                JOIN magapp_apps a ON d.app_id = a.id
                LEFT JOIN magapp.doc_interactions i ON d.id = i.doc_id
                GROUP BY d.id, d.title, a.name
                ORDER BY total_views DESC
            `);
            res.json(stats);
        } catch (error) {
            console.error('[MAGAPP] Error fetching doc stats:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des statistiques' });
        }
    },

    // Maintenances
    getMaintenances: async (req, res) => {
        try {
            const maintenances = await pgDb.all(`
                SELECT m.id, m.app_id, m.name, m.description, m.severity, m.has_interruption,
                       to_char(m.start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_date,
                       to_char(m.end_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date,
                       m.created_by,
                       to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                       to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at,
                       a.name as app_name, a.icon as app_icon
                FROM magapp.maintenances m
                JOIN magapp_apps a ON m.app_id = a.id
                ORDER BY m.start_date DESC
            `);
            res.json(maintenances);
        } catch (error) {
            console.error('[MAGAPP] Error fetching maintenances:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des maintenances' });
        }
    },

    getAppMaintenances: async (req, res) => {
        try {
            const { appId } = req.params;
            const maintenances = await pgDb.all(
                `SELECT m.id, m.app_id, m.name, m.description, m.severity, m.has_interruption,
                        to_char(m.start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_date,
                        to_char(m.end_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date,
                        m.created_by,
                        to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                        to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at,
                        a.name as app_name, a.icon as app_icon
                 FROM magapp.maintenances m
                 JOIN magapp_apps a ON m.app_id = a.id
                 WHERE m.app_id = $1
                 ORDER BY m.start_date DESC`,
                [appId]
            );
            res.json(maintenances);
        } catch (error) {
            console.error('[MAGAPP] Error fetching app maintenances:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des maintenances' });
        }
    },

    createMaintenance: async (req, res) => {
        try {
            const { app_id, name, description, severity, has_interruption, start_date, end_date } = req.body;
            if (!app_id || !name || !start_date || !end_date) {
                return res.status(400).json({ message: 'Champs obligatoires manquants' });
            }
            const username = req.user?.username || 'admin';
            // Convert local dates to UTC for storage
            const startUTC = new Date(start_date).toISOString();
            const endUTC = new Date(end_date).toISOString();
            const result = await pool.query(
                `INSERT INTO magapp.maintenances (app_id, name, description, severity, has_interruption, start_date, end_date, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [app_id, name, description, severity, has_interruption, startUTC, endUTC, username]
            );
            res.json(result.rows[0]);
        } catch (error) {
            console.error('[MAGAPP] Error creating maintenance:', error.message);
            res.status(500).json({ message: 'Erreur lors de la création de la maintenance' });
        }
    },

    updateMaintenance: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, severity, has_interruption, start_date, end_date } = req.body;
            const startUTC = new Date(start_date).toISOString();
            const endUTC = new Date(end_date).toISOString();
            await pool.query(
                `UPDATE magapp.maintenances
                 SET name = $1, description = $2, severity = $3, has_interruption = $4,
                     start_date = $5, end_date = $6, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $7`,
                [name, description, severity, has_interruption, startUTC, endUTC, id]
            );
            res.json({ message: 'Maintenance mise à jour' });
        } catch (error) {
            console.error('[MAGAPP] Error updating maintenance:', error.message);
            res.status(500).json({ message: 'Erreur lors de la mise à jour de la maintenance' });
        }
    },

    deleteMaintenance: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM magapp.maintenance_attachments WHERE maintenance_id = $1', [id]);
            await pool.query('DELETE FROM magapp.maintenances WHERE id = $1', [id]);
            res.json({ message: 'Maintenance supprimée' });
        } catch (error) {
            console.error('[MAGAPP] Error deleting maintenance:', error.message);
            res.status(500).json({ message: 'Erreur lors de la suppression de la maintenance' });
        }
    },

    getMaintenanceAttachments: async (req, res) => {
        try {
            const { maintenanceId } = req.params;
            const attachments = await pgDb.all(
                'SELECT * FROM magapp.maintenance_attachments WHERE maintenance_id = $1 ORDER BY created_at DESC',
                [maintenanceId]
            );
            res.json(attachments);
        } catch (error) {
            console.error('[MAGAPP] Error fetching attachments:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des pièces jointes' });
        }
    }
};

module.exports = MagAppController;
