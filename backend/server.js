const express = require('express');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Bypass SSL certificate verification globally

const cors = require('cors');
const bcrypt = require('bcryptjs');
const { setupDb, pgDb, pool, setupPgDb } = require('./shared/database');
const { logMouchard, flattenLDAPEntry, decodeLDAPString, excelDateToISO } = require('./shared/utils');
const { SECRET_KEY, PORT, FOLDERS } = require('./shared/config');
const { authenticateJWT, authenticateAdmin, authenticateInternalOrAdmin, authenticateAdminOrFinances, authenticateMagappControl } = require('./shared/middleware');
const magappRouter = require('./modules/magapp/magapp.routes');
const rhRouter = require('./modules/rh/rh.routes');
const financeRouter = require('./modules/finance/finance.routes');
const glpiRouter = require('./modules/glpi/glpi.routes');
const glpiController = require('./modules/glpi/glpi.controller');

const tiersRouter = require('./modules/finance/tiers.routes');
const contactsRouter = require('./modules/finance/contacts.routes');
const certificatesRouter = require('./modules/certificates/certificates.routes');
const { recalculateAllOperations } = require('./modules/finance/finance.controller');
const updateTierStats = require('./update_tier_stats');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const nodemailer = require('nodemailer');
const brevoTransport = require('nodemailer-brevo-transport');
const ldap = require('ldapjs');
const { exec } = require('child_process');
const axios = require('axios');
const oracledb = require('oracledb');
const mariadb = require('mariadb');
try {
    // Tentative de passage en mode thin par défaut (si supporté par la version installée)
    // node-oracledb 6+ est thin par défaut
} catch (e) {
    console.warn('Oracle initialization warning:', e.message);
}

/**
 * Helper to flatten a SearchEntry (pojo) into a simple object for ldapjs 3.x compatibility
 */
// flattenLDAPEntry moved to shared/utils.js

/**
 * Tente d'authentifier un utilisateur via Active Directory
 * @returns {Promise<Object|null>} L'utilisateur AD ou null si échec
 */
async function authenticateAD(username, password, config) {
    return new Promise((resolve, reject) => {
        if (!config.is_enabled) {
            console.log('AD Auth disabled');
            return resolve(null);
        }

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 10000,
            timeout: 10000
        });

        const log = (msg) => {
            console.log(`[AD Auth Debug] ${msg} (Host: ${config.host})`);
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] AD Auth Debug: ${msg}\n`);
        };

        client.on('error', (err) => {
            log(`LDAP Client Error: ${err.message}`);
            resolve(null);
        });

        // 1. Liaison avec le compte technique (Bind DN)
        log(`Attempting technical bind with DN: ${config.bind_dn}`);
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                log(`AD Technical Bind Error: ${err.message}`);
                client.destroy();
                return reject(new Error('Erreur de liaison AD : ' + err.message));
            }

            log(`Technical bind success. Searching for user: ${username}`);
            // 2. Recherche de l'utilisateur par son sAMAccountName
            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['dn', 'cn', 'memberOf', 'mail', 'displayName'],
                referrals: false,
                paged: false
            };

            client.search(config.base_dn, searchOptions, (err, res) => {
                if (err) {
                    log(`AD Search error: ${err.message}`);
                    client.destroy();
                    return reject(new Error('Erreur de recherche AD : ' + err.message));
                }

                let userEntry = null;

                res.on('searchEntry', (entry) => {
                    userEntry = flattenLDAPEntry(entry);
                    if (userEntry) {
                        log(`User found: ${userEntry.dn}`);
                    }
                });

                res.on('error', (err) => {
                    log(`Search results error: ${err.message}`);
                    client.destroy();
                    reject(new Error('Erreur lors de la recherche AD : ' + err.message));
                });

                res.on('end', (result) => {
                    if (!userEntry) {
                        log(`User NOT found in AD for username: ${username}`);
                        client.destroy();
                        return resolve(null); // Utilisateur non trouvé
                    }

                    // 3. Vérification du mot de passe de l'utilisateur (Re-bind avec son DN)
                    log(`Attempting user bind for DN: ${userEntry.dn}`);
                    const userClient = ldap.createClient({
                        url: `ldap://${config.host}:${config.port}`,
                        connectTimeout: 10000,
                        timeout: 10000
                    });

                    userClient.bind(userEntry.dn, password, (err) => {
                        userClient.destroy();
                        client.destroy();

                        if (err) {
                            log(`User bind FAILED for ${username}: ${err.message}`);
                            return resolve(null); // Mot de passe incorrect
                        }

                        // 4. Vérification de l'appartenance au groupe si requis
                        if (config.required_group) {
                            const configGroup = config.required_group.toLowerCase().trim().normalize('NFC');
                            const groups = Array.isArray(userEntry.memberOf) 
                                ? userEntry.memberOf 
                                : (userEntry.memberOf ? [userEntry.memberOf] : []);
                            
                            log(`User Groups Found: ${JSON.stringify(groups)}`);
                                
                            const hasGroup = groups.some(g => {
                                if (!g) return false;
                                const normalizedG = g.toLowerCase().normalize('NFC');
                                return normalizedG.includes(configGroup);
                            });

                            if (!hasGroup) {
                                log(`Group check FAILED: ${username} not in ${config.required_group}`);
                                return reject(new Error(`L'utilisateur n'appartient pas au groupe requis : ${config.required_group}`));
                            }
                        }

                        resolve({
                            username: username,
                            displayName: userEntry.displayName || userEntry.cn,
                            email: userEntry.mail,
                            dn: userEntry.dn
                        });
                    });
                });
            });
        });
    });
}

/**
 * Récupère les informations d'un utilisateur AD (sans mot de passe)
 */
async function getADUserInfo(username, config) {
    return new Promise((resolve, reject) => {
        if (!config.is_enabled) return resolve(null);

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 10000,
            timeout: 10000
        });

        client.on('error', (err) => {
            console.error('LDAP Client Error (getADUserInfo):', err.message);
            resolve(null);
        });

        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                client.destroy();
                return resolve(null);
            }

            // Stratégie de recherche : Priorité à l'identifiant exact
            const searchOptions = {
                filter: `(|(sAMAccountName=${username})(cn=${username}))`,
                scope: 'sub',
                attributes: ['dn', 'cn', 'mail', 'displayName', 'department', 'sAMAccountName']
            };

            client.search(config.base_dn, searchOptions, (err, res) => {
                if (err) {
                    client.destroy();
                    return resolve(null);
                }

                let userEntry = null;
                res.on('searchEntry', (entry) => {
                    const obj = flattenLDAPEntry(entry);
                    if (!obj) return;

                    // Si on trouve plusieurs résultats, on prend celui qui match EXACTEMENT le login (insensible à la casse)
                    const foundSam = obj.sAMAccountName;
                    if (foundSam && foundSam.toLowerCase() === username.toLowerCase()) {
                        userEntry = {
                            displayName: obj.displayName || obj.cn || foundSam,
                            mail: obj.mail || ''
                        };
                    } else if (!userEntry) {
                        // Premier résultat par défaut si pas encore de match exact
                        userEntry = {
                            displayName: obj.displayName || obj.cn || obj.sAMAccountName,
                            mail: obj.mail || ''
                        };
                    }
                });

                res.on('error', (err) => { client.destroy(); resolve(null); });
                res.on('end', () => {
                    client.destroy();
                    resolve(userEntry);
                });
            });
        });
    });
}

// Configuration Multer dynamique
const folders = ['uploads', 'file_commandes', 'file_factures', 'file_certif', 'magapp_img', 'file_telecom', 'file_reunions', 'logs'];
folders.forEach(f => {
    const dir = path.join(__dirname, f);
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        } catch (err) {
            console.error(`Error creating directory ${dir}:`, err.message);
        }
    }
    
    // Diagnostic de permission pour Docker
    if (f === 'magapp_img') {
        const testFile = path.join(dir, '.write_test');
        try {
            fs.writeFileSync(testFile, `Test write at ${new Date().toISOString()}`);
            console.log(`[DIAGNOSTIC] Write test SUCCESS in ${dir}`);
            fs.unlinkSync(testFile);
        } catch (err) {
            console.error(`[DIAGNOSTIC] Write test FAILED in ${dir}:`, err.message);
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] CRITICAL: Permission denied in ${dir}\n`);
        }
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.body.target_type; // 'order', 'invoice', 'certif' ou 'telecom_invoice'
        let folder = 'uploads';
        if (type === 'order') folder = 'file_commandes';
        else if (type === 'invoice') folder = 'file_factures';
        else if (type === 'certif') folder = 'file_certif';
        else if (type === 'telecom_invoice') folder = 'file_telecom';
        else if (type === 'magapp_icon') folder = 'magapp_img';
        else if (type === 'reunion') folder = 'file_reunions';
        const dest = path.join(__dirname, folder);

        const logMsg = `Multer Destination: type=${type}, folder=${folder}, dest=${dest}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

        cb(null, dest);
    },
    filename: (req, file, cb) => {
        if (req.body.target_type === 'magapp_icon') {
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const baseName = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_');
            const fname = `${baseName}_${timestamp}${ext}`;
            cb(null, fname);
        } else {
            const targetId = (req.body.target_id || 'unknown').replace(/[^a-z0-9]/gi, '_');
            const fname = `${targetId}_${Date.now()}${path.extname(file.originalname)}`;
            cb(null, fname);
        }
    }
});
const upload = multer({ storage });
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Dedicated uploader for reunion attachments with hardcoded destination
const reunionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'file_reunions'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_\-]/gi, '_');
        cb(null, `${req.params.id || 'r'}_${Date.now()}_${base}${ext}`);
    }
});
const uploadReunion = multer({ storage: reunionStorage, limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
// PORT and SECRET_KEY moved to shared/config.js

// Logger global : enregistre TOUTES les requêtes dans mouchard.log
app.use((req, res, next) => {
    const originalStatus = res.status;
    const originalSend = res.send;
    const originalJson = res.json;

    res.status = function (code) {
        this.statusCode = code;
        return originalStatus.apply(this, arguments);
    };

    res.send = function (body) {
        if (this.statusCode === 500) {
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] BODY 500 (${req.url}): ${body}
`);
        }
        return originalSend.apply(this, arguments);
    };

    res.json = function (body) {
        if (this.statusCode === 500) {
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] JSON 500 (${req.url}): ${JSON.stringify(body)}
`);
        }
        return originalJson.apply(this, arguments);
    };

    // Ne pas logger les accès au mouchard lui-même pour éviter de polluer
    if (req.url.startsWith('/mouchard') || req.url === '/favicon.ico') return next();

    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const msg = `${req.method} ${req.url} - ${res.statusCode} - par ${req.headers['authorization'] ? 'Utilisateur authentifié' : 'Anonyme'} (${duration}ms)`;
        const time = new Date().toISOString();
        const line = `[${time}] ${msg}
`;
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), line);
    });
    next();
});

app.use(cors({
    origin: true, // Autorise l'origine de la requête (dynamique)
    credentials: true
}));
app.use(express.json());
// Désactiver le cache pour toutes les routes API
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});
app.use('/img', express.static(path.join(__dirname, 'magapp_img')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/img', express.static(path.join(__dirname, 'magapp_img')));
app.use('/file_telecom', express.static(path.join(__dirname, 'file_telecom')));
app.use('/api/file_telecom', express.static(path.join(__dirname, 'file_telecom')));
app.use('/file_commandes', express.static(path.join(__dirname, 'file_commandes')));
app.use('/api/file_commandes', express.static(path.join(__dirname, 'file_commandes')));
app.use('/file_factures', express.static(path.join(__dirname, 'file_factures')));
app.use('/api/file_factures', express.static(path.join(__dirname, 'file_factures')));
app.use('/file_certif', express.static(path.join(__dirname, 'file_certif')));
app.use('/api/file_certif', express.static(path.join(__dirname, 'file_certif')));
app.use('/file_reunions', express.static(path.join(__dirname, 'file_reunions')));
app.use('/api/file_reunions', express.static(path.join(__dirname, 'file_reunions')));

app.use('/api', magappRouter);
app.use('/api/admin/rh', rhRouter);

// Récupérer le profil utilisateur actuel (depuis la DB pour avoir le statut à jour)
app.get('/api/auth/me', authenticateJWT, async (req, res) => {
    try {
        let user = null;
        let source = '';
        
        const origin = req.headers.origin || req.headers.referer || '';
        const isMagApp = origin.includes(':5174') || origin.includes('magapp');

        if (isMagApp) {
            // Priority 1 for MagApp: PostgreSQL
            user = await pgDb.get('SELECT username, role, is_approved FROM users WHERE username = ?', [req.user.username]);
            if (user) {
                source = 'postgres';
            } else {
                user = await db.get('SELECT id, username, role, is_approved, service_code, service_complement FROM users WHERE username = ?', [req.user.username]);
                if (user) source = 'sqlite';
            }
        } else {
            // Priority 1 for Hub: SQLite
            user = await db.get('SELECT id, username, role, is_approved, service_code, service_complement FROM users WHERE username = ?', [req.user.username]);
            if (user) {
                source = 'sqlite';
            } else {
                user = await pgDb.get('SELECT username, role, is_approved FROM users WHERE username = ?', [req.user.username]);
                if (user) source = 'postgres';
            }
        }

        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

        // Force l'approbation pour les admins
        if (user.role === 'admin' || user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === 'adminhub') {
            user.is_approved = 1;
            user.authorized_urls = ['*'];
        } else if (source === 'sqlite') {
            // Get URLs from the tiles the user is authorized for (Hub only)
            const authorizedTiles = await db.all(`
                SELECT tl.url as link_url
                FROM user_tiles ut
                JOIN tiles t ON ut.tile_id = t.id
                LEFT JOIN tile_links tl ON t.id = tl.tile_id
                WHERE ut.user_id = ?
            `, [user.id]);

            const urls = new Set(['/', '/request-access', '/profile']); // Default allowed routes
            authorizedTiles.forEach(row => {
                if (row.link_url) urls.add(row.link_url);
            });
            user.authorized_urls = Array.from(urls);
        } else {
            // Utilisateur MagApp (PG) sans compte Hub SQLite
            user.authorized_urls = ['/', '/profile']; // Accès minimal par défaut
        }

        res.json({ ...user, auth_source: source });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération du profil', error: error.message });
    }
});


// Active Directory Settings API
app.get('/api/ad-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (settings && settings.bind_password) {
            settings.bind_password = '********';
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres AD' });
    }
});

app.post('/api/ad-settings', authenticateAdmin, async (req, res) => {
    const { is_enabled, host, port, base_dn, required_group, bind_dn, bind_password } = req.body;
    try {
        if (!bind_password || bind_password === '********' || bind_password === '••••••••') {
            // Le mot de passe n'a pas été changé - on conserve l'existant
            await db.run(
                'UPDATE ad_settings SET is_enabled = ?, host = ?, port = ?, base_dn = ?, required_group = ?, bind_dn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
                [is_enabled ? 1 : 0, host, port, base_dn, required_group, bind_dn]
            );
        } else {
            await db.run(
                'UPDATE ad_settings SET is_enabled = ?, host = ?, port = ?, base_dn = ?, required_group = ?, bind_dn = ?, bind_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
                [is_enabled ? 1 : 0, host, port, base_dn, required_group, bind_dn, bind_password]
            );
        }
        res.json({ message: 'Paramètres AD enregistrés' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur enregistrement paramètres AD' });
    }
});

// GET: Rechercher des utilisateurs dans Active Directory
app.get('/api/ad/search', authenticateJWT, async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(400).json({ error: 'Active Directory non configuré' });
        }

        const results = await searchADUsersByQuery(query, adSettings);
        res.json(results);
    } catch (error) {
        console.error('Erreur recherche AD:', error);
        res.status(500).json({ error: error.message });
    }
});

async function searchADUsersByQuery(query, config) {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}` });
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { client.destroy(); return reject(err); }

            const escaped = query.replace(/[*()\\\x00]/g, '\\$&');
            const filter = `(&(objectClass=user)(|(displayName=*${escaped}*)(sAMAccountName=*${escaped}*)(cn=*${escaped}*)))`;
            const opts = {
                filter,
                scope: 'sub',
                attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'department', 'company'],
                sizeLimit: 20
            };

            const results = [];
            const foundUsernames = new Set();

            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) { client.destroy(); return reject(err); }

                searchRes.on('searchEntry', (entry) => {
                    const user = flattenLDAPEntry(entry);
                    if (user && user.sAMAccountName && !foundUsernames.has(user.sAMAccountName)) {
                        foundUsernames.add(user.sAMAccountName);
                        results.push({
                            username: user.sAMAccountName,
                            displayName: decodeLDAPString(user.displayName || user.cn || user.sAMAccountName),
                            email: user.mail || '',
                            service: user.department || '',
                            direction: user.company || ''
                        });
                    }
                });
                searchRes.on('end', () => { client.destroy(); resolve(results); });
                searchRes.on('error', (err) => { client.destroy(); reject(err); });
            });
        });
    });
}

// Azure AD (Entra ID) Settings API
// Route publique : retourne uniquement is_enabled (pour Login.tsx)
app.get('/api/azure-ad-settings/status', async (req, res) => {
    try {
        const settings = await db.get('SELECT is_enabled FROM azure_ad_settings WHERE id = 1');
        res.json({ is_enabled: !!(settings && settings.is_enabled) });
    } catch (error) {
        res.json({ is_enabled: false });
    }
});

// Route admin : retourne la config complète (mot de passe masqué)
app.get('/api/azure-ad-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
        if (settings && settings.client_secret) {
            settings.client_secret = '••••••••';
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres Azure AD' });
    }
});

app.post('/api/azure-ad-settings', authenticateAdmin, async (req, res) => {
    const { is_enabled, tenant_id, client_id, client_secret, redirect_uri } = req.body;
    try {
        if (!client_secret || client_secret === '********' || client_secret === '••••••••') {
            await db.run(
                'UPDATE azure_ad_settings SET is_enabled = ?, tenant_id = ?, client_id = ?, redirect_uri = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
                [is_enabled ? 1 : 0, tenant_id, client_id, redirect_uri]
            );
        } else {
            await db.run(
                'UPDATE azure_ad_settings SET is_enabled = ?, tenant_id = ?, client_id = ?, client_secret = ?, redirect_uri = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
                [is_enabled ? 1 : 0, tenant_id, client_id, client_secret, redirect_uri]
            );
        }
        res.json({ message: 'Paramètres Azure AD enregistrés' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur enregistrement paramètres Azure AD' });
    }
});

// --- Azure AD (Entra ID) OAuth Routes ---

app.get('/api/auth/azure/login', async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
        if (!settings || !settings.is_enabled) {
            console.warn('[AZURE] Tentative de connexion alors que Azure AD est désactivé');
            return res.status(503).json({ message: 'L\'authentification Azure AD est désactivée' });
        }

        const params = new URLSearchParams({
            client_id: settings.client_id,
            response_type: 'code',
            redirect_uri: settings.redirect_uri,
            response_mode: 'query',
            scope: 'openid profile email User.Read',
            state: '12345'
        });

        const authUrl = `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/authorize?${params.toString()}`;
        console.log(`[AZURE] Redirection vers Microsoft: ${authUrl}`);
        res.redirect(authUrl);
    } catch (error) {
        console.error('[AZURE] Erreur initialisation login:', error);
        res.status(500).json({ message: 'Erreur lors de l\'initialisation Azure AD' });
    }
});

app.get('/api/auth/azure/callback', async (req, res) => {
    const { code, error, error_description } = req.query;

    if (error) {
        console.error('[AZURE] Callback Error Query Params:', error, error_description);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=${encodeURIComponent(error_description)}`);
    }

    try {
        const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
        console.log('[AZURE] Échange du code contre un token...');

        // 1. Échanger le code contre un token
        const tokenResponse = await axios.post(
            `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: settings.client_id,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: settings.redirect_uri,
                client_secret: settings.client_secret
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token } = tokenResponse.data;
        console.log('[AZURE] Token obtenu. Récupération des infos utilisateur /me...');

        // 2. Récupérer les infos utilisateur via Microsoft Graph
        const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const azureUser = userResponse.data;
        console.log(`[AZURE] Utilisateur identifié: ${azureUser.displayName} (${azureUser.mail || azureUser.userPrincipalName})`);
        const email = azureUser.mail || azureUser.userPrincipalName;
        const username = email.split('@')[0].toLowerCase();

        // 3. Authentifier ou créer l'utilisateur localement (SQLite pour Hub)
        let user = await db.get('SELECT id, username, role, service_code, service_complement FROM users WHERE LOWER(username) = LOWER(?)', [username]);

        if (!user) {
            console.log(`[AZURE] Utilisateur ${username} non trouvé en SQLite. Création automatique...`);
            const isAdminAccount = username === 'admin' || username === 'adminhub';
            const role = isAdminAccount ? 'admin' : 'magapp';
            const isApproved = 1; // AD Verified

            const result = await db.run(
                'INSERT INTO users (username, role, is_approved) VALUES (?, ?, ?)',
                [username, role, isApproved]
            );
            user = await db.get('SELECT id, username, role, service_code, service_complement FROM users WHERE id = ?', [result.lastID]);
        }

        // 4. Également s'assurer qu'il existe dans PostgreSQL (MagApp base)
        let pgUser = await pgDb.get('SELECT username, role, is_approved FROM users WHERE username = ?', [username]);
        if (!pgUser) {
            console.log(`[AZURE PG] Création automatique dans PostgreSQL pour ${username}`);
            const isAdminAccount = username === 'admin' || username === 'adminhub';
            const role = isAdminAccount ? 'admin' : 'magapp';
            await pgDb.run(
                'INSERT INTO users (username, role, is_approved, displayName, email) VALUES (?, ?, ?, ?, ?)',
                [username, role, 1, azureUser.displayName, email]
            );
        }


        const accessToken = jwt.sign({
            id: user.id,
            username: user.username,
            role: user.role,
            service_code: user.service_code,
            service_complement: user.service_complement
        }, SECRET_KEY);

        console.log(`[AZURE] Login réussi pour ${username}. Redirection vers frontend.`);
        // 4. Rediriger vers le frontend avec le token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/login?token=${accessToken}`);

    } catch (error) {
        console.error('[AZURE] Erreur critique lors du process callback:', error.response?.data || error.message);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/login?error=azure_failed`);
    }
});

// Route de Lookup Azure AD
app.post('/api/admin/azure/lookup', authenticateAdmin, async (req, res) => {
    const { username } = req.body;
    try {
        const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
        if (!settings || !settings.is_enabled) {
            return res.status(400).json({ success: false, message: 'Azure AD non configuré ou désactivé' });
        }

        // 1. Get Token via Client Credentials
        const tokenResponse = await axios.post(
            `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: settings.client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: settings.client_secret
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token } = tokenResponse.data;

        // 2. Search User in Graph
        const searchResponse = await axios.get('https://graph.microsoft.com/v1.0/users', {
            headers: { Authorization: `Bearer ${access_token}` },
            params: {
                '$filter': `startsWith(userPrincipalName, '${username}') or startsWith(displayName, '${username}') or mail eq '${username}'`,
                '$select': 'displayName,userPrincipalName,mail,jobTitle,department,id',
                '$top': 1
            }
        });

        if (searchResponse.data.value && searchResponse.data.value.length > 0) {
            const user = searchResponse.data.value[0];
            res.json({
                success: true,
                message: 'Utilisateur trouvé dans Azure AD',
                data: {
                    displayName: user.displayName,
                    mail: user.mail || user.userPrincipalName,
                    department: user.department || user.jobTitle || 'N/A',
                    dn: user.userPrincipalName // Pour garder une structure proche de l'AD
                }
            });
        } else {
            res.json({ success: false, message: 'Aucun utilisateur trouvé dans Azure AD' });
        }
    } catch (error) {
        console.error('Azure Lookup Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: `Erreur Microsoft Graph : ${error.response?.data?.error?.message || error.message}` });
    }
});

// --- Oracle Connection Helper ---
async function getOracleConnection(settings) {
    if (!settings || !settings.is_enabled) {
        throw new Error('La connexion Oracle est désactivée dans les paramètres.');
    }

    const config = {
        user: settings.username,
        password: settings.password,
        connectString: `${settings.host}:${settings.port}/${settings.service_name}`
    };

    try {
        return await oracledb.getConnection(config);
    } catch (err) {
        console.error('Oracle Connection Error:', err.message);
        throw new Error(`Erreur de connexion Oracle (${settings.type}) : ${err.message}`);
    }
}


// --- Système de Correspondance AD Automatisée ---

let adSyncProgress = { current: 0, total: 0, status: 'idle', currentName: '', associations: 0 };

function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

function calculateMatchScore(rhNom, rhPrenom, adDisplay) {
    // Normalise l'affichage LDAP pour gérer les encodages type \c3\a9 (UTF-8)
    const normalizedAD = adDisplay.replace(/\\([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    const s1 = `${rhNom} ${rhPrenom}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const s2 = normalizedAD.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const dist = getLevenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);
    return maxLen === 0 ? 100 : Math.round((1 - dist / maxLen) * 100);
}

// Fonction pour parser les dates LDAP (filetime)
function parseLDAPDate(val) {
    if (!val) return null;
    try {
        const timestamp = parseInt(val);
        if (timestamp <= 0 || isNaN(timestamp)) return null;
        // LDAP filetime est en 100-nanosecondes depuis le 1er Janvier 1601
        return new Date((timestamp / 10000) - 11644473600000);
    } catch (e) {
        return null;
    }
}



function formatDateToFrench(dateString) {
    if (!dateString) return null;
    try {
        // Remove 'Z' if it already exists, then add it to ensure UTC interpretation
        let isoString = typeof dateString === 'string' ? dateString.replace('Z', '') : dateString.toString();
        const date = new Date(isoString + 'Z');

        // Format in French timezone
        const formatter = new Intl.DateTimeFormat('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris'
        });

        const formatted = formatter.format(date);
        // formatter.format returns something like "15/04/2026 10:34"
        return formatted;
    } catch (e) {
        console.error('Error formatting date:', e.message);
        return dateString;
    }
}

app.get('/api/admin/rh/sync-ad/progress', authenticateAdmin, (req, res) => {
    res.json(adSyncProgress);
});

app.post('/api/admin/rh/sync-ad', authenticateAdmin, async (req, res) => {
    const username = req.user?.username || 'system';
    if (adSyncProgress.status === 'running') return res.status(400).json({ message: "Synchro déjà en cours" });

    adSyncProgress = { current: 0, total: 0, status: 'running', associations: 0, currentName: 'Synchronisation en cours...' };
    res.json({ message: "Synchronisation AD lancée" });

    (async () => {
        try {
            const today = new Date().toISOString().substring(0, 10);

            // On calcule le total tout de suite pour la barre de progression
            const countRes = await db.get(`
                SELECT COUNT(*) as total FROM rh.referentiel_agents 
                WHERE date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            `, [today]);
            adSyncProgress.total = countRes.total;

            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) {
                adSyncProgress.status = 'error';
                return;
            }

            // 1. Charger tous les utilisateurs AD avec pagination
            const allADUsers = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }
                    const users = [];
                    const searchOptions = {
                        filter: '(objectClass=user)',
                        scope: 'sub',
                        attributes: ['*', 'lastLogonTimestamp', 'lastLogon'],
                        paged: true,
                        sizeLimit: 10000
                    };

                    client.search(adSettings.base_dn, searchOptions, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => { users.push(flattenLDAPEntry(entry)); });
                        searchRes.on('end', () => { client.destroy(); resolve(users); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            });

            // 2. Indexer les utilisateurs AD pour une recherche rapide
            const adMatriculeMap = new Map();
            const adNameMap = new Map();

            allADUsers.forEach(u => {
                if (!u.sAMAccountName) return;

                // Index par matricule (sAMAccountName ou employeeID ou description)
                const sam = u.sAMAccountName.toString().toLowerCase();
                adMatriculeMap.set(sam, u);

                if (u.employeeID) {
                    adMatriculeMap.set(u.employeeID.toString().toLowerCase(), u);
                }

                // Si le matricule est caché dans la description (cas fréquent)
                if (u.description && typeof u.description === 'string') {
                    const match = u.description.match(/\d{5,8}/); // Recherche un nombre de 5 à 8 chiffres
                    if (match) adMatriculeMap.set(match[0], u);
                }

                // Index par nom normalisé
                const displayName = decodeLDAPString(u.displayName);
                const cn = decodeLDAPString(u.cn);
                
                if (displayName) {
                    const norm = displayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                    if (norm.length > 5) adNameMap.set(norm, u);
                } else if (cn) {
                    const norm = cn.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                    if (norm.length > 5) adNameMap.set(norm, u);
                }
            });

            // 3. Charger TOUS les agents actifs (pour pouvoir mettre à jour le statut des déjà liés aussi)
            const agentsToSync = await db.all(`
                SELECT MATRICULE, NOM, PRENOM, ad_username FROM rh.referentiel_agents 
                WHERE date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            `, [today]);
            // adSyncProgress.total = agentsToSync.length; // Déjà mis à jour à l'init

            for (let i = 0; i < agentsToSync.length; i++) {
                const agent = agentsToSync[i];
                adSyncProgress.current = i + 1;
                adSyncProgress.currentName = `Traitement: ${i+1}/${agentsToSync.length}`; 
                
                // Petit délai pour la visibilité de la barre de progression si c'est trop rapide
                if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 30));

                const agentMatricule = agent.MATRICULE || agent.matricule || '';
                const matricule = String(agentMatricule).toLowerCase().trim();
                const nom = (agent.NOM || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                const prenom = (agent.PRENOM || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                const fullNameNorm = nom + prenom;
                const fullNameNormReverse = prenom + nom;

                let match = null;

                // Si l'agent a déjà un lien AD (manuel ou auto), on NE re-matche PAS par nom/matricule
                // pour ne pas écraser un lien donné manuellement
                if (agent.ad_username) {
                    // Cherche directement par le username connu (peut être domain\user ou juste user)
                    const samLookup = agent.ad_username.includes('\\') 
                        ? agent.ad_username.split('\\').pop().toLowerCase()
                        : agent.ad_username.toLowerCase();
                    const existingAD = adMatriculeMap.get(samLookup);
                    if (existingAD) {
                        const uac = parseInt(existingAD.userAccountControl);
                        const enabled = isNaN(uac) ? 1 : (!(uac & 2) ? 1 : 0);
                        
                        // Fusion de lastLogon et lastLogonTimestamp
                        const d1 = parseLDAPDate(existingAD.lastLogonTimestamp);
                        const d2 = parseLDAPDate(existingAD.lastLogon);
                        let bestLogon = null;
                        if (d1 && d2) bestLogon = d1 > d2 ? d1 : d2;
                        else bestLogon = d1 || d2 || null;

                        const lastLogonIso = bestLogon ? bestLogon.toISOString() : null;
                        
                        await db.run('UPDATE rh.referentiel_agents SET ad_account_enabled = ?, ad_last_logon = ? WHERE MATRICULE = ?', [enabled, lastLogonIso, agentMatricule]);
                        adSyncProgress.associations++;
                    } else {
                        // Le compte AD connu a disparu ou n'est pas indexé (mauvais format?)
                        console.log(`[AD Sync] Compte AD '${agent.ad_username}' non trouvé dans l'index pour ${agent.NOM}`);
                        await db.run('UPDATE rh.referentiel_agents SET ad_account_enabled = 0 WHERE MATRICULE = ?', [agentMatricule]);
                    }
                    continue; // Passe à l'agent suivant sans re-matcher
                }

                // 1. Agent sans lien AD: Recherche par matricule (Haute priorité)
                if (matricule) {
                    match = adMatriculeMap.get(matricule);
                }

                // 2. Si non trouvé, recherche par nom/prénom (ne s'applique qu'aux agents sans lien)
                if (!match && fullNameNorm.length > 3) {
                    match = adNameMap.get(fullNameNorm) || adNameMap.get(fullNameNormReverse);
                }

                // 3. Traitement du match (nouveau lien)
                if (match) {
                    const uac = parseInt(match.userAccountControl);
                    const enabled = isNaN(uac) ? 1 : (!(uac & 2) ? 1 : 0);

                    // Fusion de lastLogon et lastLogonTimestamp
                    const d1 = parseLDAPDate(match.lastLogonTimestamp);
                    const d2 = parseLDAPDate(match.lastLogon);
                    let bestLogon = null;
                    if (d1 && d2) bestLogon = d1 > d2 ? d1 : d2;
                    else bestLogon = d1 || d2 || null;

                    const lastLogonIso = bestLogon ? bestLogon.toISOString() : null;

                    const email = Array.isArray(match.mail) ? match.mail[0] : (match.mail || null);
                    await db.run(
                        `UPDATE rh.referentiel_agents 
                         SET ad_username = ?, ad_account_enabled = ?, ad_last_logon = ?, mail = ?, date_fin_association_ad = NULL 
                         WHERE MATRICULE = ?`,
                        [match.sAMAccountName, enabled, lastLogonIso, email, agentMatricule]
                    );
                    adSyncProgress.associations++;
                }
            }

            adSyncProgress.status = 'done';

            await db.run(
                'INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)',
                ['Active Directory', 'success', `Sync AD terminée: ${adSyncProgress.associations} associations`, JSON.stringify(adSyncProgress), username]
            );
            console.log(`[SYNC LOG] Succès pour Active Directory`);
        } catch (err) {
            console.error("Erreur Synchro AD:", err);
            adSyncProgress.status = 'error';
            await db.run(
                'INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)',
                ['Active Directory', 'error', `Erreur: ${err.message}`, JSON.stringify(adSyncProgress), username]
            );
            console.log(`[SYNC LOG] Erreur pour Active Directory: ${err.message}`);
        }
    })();
});

// --- Système de Correspondance Azure AD (Entra ID) ---

let azureSyncProgress = { current: 0, total: 0, status: 'idle' };

app.get('/api/admin/rh/sync-azure/progress', authenticateAdmin, (req, res) => {
    res.json(azureSyncProgress);
});

app.post('/api/admin/rh/sync-azure', authenticateAdmin, async (req, res) => {
    const username = req.user?.username || 'system';
    if (azureSyncProgress.status === 'running') return res.status(400).json({ message: "Synchro Azure déjà en cours" });

    azureSyncProgress = { current: 0, total: 0, status: 'running' };
    res.json({ message: "Synchronisation Azure AD lancée" });

    (async () => {
        try {
            const today = new Date().toISOString().substring(0, 10);
            const countRes = await db.get(`
                SELECT COUNT(*) as total FROM rh.referentiel_agents 
                WHERE date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            `, [today]);
            azureSyncProgress.total = countRes.total;

            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (!settings || !settings.is_enabled) {
                azureSyncProgress.status = 'error';
                return;
            }

            // 1. Obtenir Token Graph
            const tokenRes = await axios.post(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
                new URLSearchParams({
                    client_id: settings.client_id,
                    client_secret: settings.client_secret,
                    grant_type: 'client_credentials',
                    scope: 'https://graph.microsoft.com/.default'
                }).toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const accessToken = tokenRes.data.access_token;

            // 2. Récupérer les correspondances SKU (ID -> Nom de licence)
            const skuMap = new Map();
            try {
                const skuRes = await axios.get('https://graph.microsoft.com/v1.0/subscribedSkus', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                skuRes.data.value.forEach(sku => {
                    skuMap.set(sku.skuId, sku.skuPartNumber);
                });
                console.log(`[Azure Sync] ${skuMap.size} SKUs récupérés: ${[...skuMap.values()].join(', ')}`);
            } catch (e) { console.error("[Azure Sync] ERREUR lors de la récupération des SKUs:", e.message); }

            // 3. Récupérer tous les utilisateurs Azure avec licences
            let allAzureUsers = [];
            let nextLink = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,assignedLicenses,accountEnabled';
            while (nextLink) {
                const graphRes = await axios.get(nextLink, { headers: { Authorization: `Bearer ${accessToken}` } });
                allAzureUsers = allAzureUsers.concat(graphRes.data.value);
                nextLink = graphRes.data['@odata.nextLink'];
            }
            console.log(`[Azure Sync] ${allAzureUsers.length} utilisateurs récupérés dans Azure`);

            // 3. Charger les agents actifs sans Azure ID
            const agents = await db.all(`
                SELECT MATRICULE, NOM, PRENOM, mail, azure_id FROM rh.referentiel_agents 
                WHERE date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            `, [today]);
            console.log(`[Azure Sync] ${agents.length} agents RH actifs trouvés`);

            azureSyncProgress.total = agents.length;

            const azNameMap = new Map();
            const azEmailMap = new Map();
            allAzureUsers.forEach(u => {
                if (u.displayName) {
                    // Normalisation avec suppression des accents pour meilleur matching
                    const normalized = u.displayName.toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z]/g, "");
                    azNameMap.set(normalized, u);
                    // Aussi indexer par prénom+nom
                    const parts = u.displayName.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        const reversed = (parts.slice(1).join('') + parts[0]).toLowerCase()
                            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                            .replace(/[^a-z]/g, "");
                        if (!azNameMap.has(reversed)) azNameMap.set(reversed, u);
                    }
                }
                if (u.mail) azEmailMap.set(u.mail.toLowerCase(), u);
                if (u.userPrincipalName) azEmailMap.set(u.userPrincipalName.toLowerCase(), u);
            });

            // Afficher les SKUs disponibles pour diagnostic
            console.log(`[Azure Sync] SKUs disponibles: ${[...skuMap.values()].join(', ')}`);

            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                azureSyncProgress.current = i + 1;

                // Délai pour la visibilité de la barre
                if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 30));

                const agentNom = agent.NOM || agent.nom || '';
                const agentPrenom = agent.PRENOM || agent.prenom || '';
                const agentMail = agent.MAIL || agent.mail || agent.EMAIL || agent.email || '';

                const normalizedRH = (agentNom + agentPrenom).toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z]/g, "");
                const normalizedRHReverse = (agentPrenom + agentNom).toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z]/g, "");

                let match = null;
                if (agentMail) match = azEmailMap.get(agentMail.toLowerCase());
                if (!match) match = azNameMap.get(normalizedRH) || azNameMap.get(normalizedRHReverse);
                // Essai aussi par mail si le sAMAccountName@domaine est connu
                if (!match && agent.ad_username) {
                    const possibleUpn = agent.ad_username.toLowerCase();
                    match = azEmailMap.get(possibleUpn) || [...azEmailMap.keys()].reduce((best, key) => {
                        if (key.startsWith(possibleUpn + '@')) return azEmailMap.get(key);
                        return best;
                    }, null);
                }
                if (match) {
                    let mainLicense = null;
                    if (match.assignedLicenses && match.assignedLicenses.length > 0) {
                        // Récupère le nom de la SKU ou le skuId brut comme fallback
                        const userSkus = match.assignedLicenses.map(l => skuMap.get(l.skuId) || l.skuId);
                        console.log(`[Azure Sync] ${agentNom}: SKUs = [${userSkus.join(', ')}]`);

                        const priorities = [
                            'SPE_E5', 'SPE_E3', 'SPE_E1',
                            'ENTERPRISEPREMIUM', 'ENTERPRISEPACK', 'ENTERPRISE_THREAT_DETECTION',
                            'M365_BUSINESS_PREMIUM', 'O365_BUSINESS_PREMIUM',
                            'M365_BUSINESS_STANDARD', 'O365_BUSINESS_STANDARD',
                            'M365_BUSINESS_BASIC', 'O365_BUSINESS_ESSENTIALS',
                            'DEVELOPER_PACK', 'DEVELOPERPACK_E5',
                            'MICROSOFT_365_COPILOT', 'TEAMS_EXPLORATORY', 'FLOW_FREE',
                            'ET1', 'E1', 'E3', 'E5'
                        ];

                        for (const p of priorities) {
                            if (userSkus.includes(p)) { mainLicense = p; break; }
                        }
                        // Si aucune prioritaire, prendre la première disponible (même si c'est un skuId brut)
                        if (!mainLicense) mainLicense = userSkus[0] || null;
                    }

                    await db.run(
                        'UPDATE rh.referentiel_agents SET azure_id = ?, azure_license = ?, azure_account_enabled = ? WHERE MATRICULE = ?',
                        [match.id, mainLicense, match.accountEnabled ? 1 : 0, agent.MATRICULE]
                    );
                    if (mainLicense) {
                        console.log(`[Azure Sync] MATCH trouvé pour ${agentNom}: ${match.userPrincipalName} (Licence: ${mainLicense})`);
                    } else {
                        // Log plus précis si pas de licence
                        const skus = match.assignedLicenses?.map(l => skuMap.get(l.skuId) || l.skuId) || [];
                        console.log(`[Azure Sync] MATCH trouvé pour ${agentNom}: ${match.userPrincipalName} (Pas de licence connue. SKUs bruts: ${skus.join(', ')})`);
                    }
                } else {
                    // console.log(`[Azure Sync] Aucun match pour ${agentNom} (${agentMail || 'pas de mail'})`);
                }
            }
            console.log(`[Azure Sync] Synchronisation terminée`);

            azureSyncProgress.status = 'done';
            await db.run(
                'INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)',
                ['Azure AD', 'success', `Sync Azure terminée.`, JSON.stringify(azureSyncProgress), username]
            );
            console.log(`[SYNC LOG] Succès pour Azure AD`);
        } catch (err) {
            console.error("Erreur Synchro Azure:", err);
            azureSyncProgress.status = 'error';
            await db.run(
                'INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)',
                ['Azure AD', 'error', `Erreur: ${err.message}`, JSON.stringify(azureSyncProgress), username]
            );
            console.log(`[SYNC LOG] Erreur pour Azure AD: ${err.message}`);
        }
    })();
});

console.log('[DEBUG] Registering Frizbi and RH Log routes...');

app.get('/api/admin/rh/logs', authenticateAdmin, async (req, res) => {
    try {
        const logs = await db.all('SELECT * FROM rh_sync_logs ORDER BY created_at DESC LIMIT 100');
        res.json(logs);
    } catch (err) {
        console.error("Erreur lecture logs:", err);
        res.status(500).json({ message: 'Erreur lecture logs', error: err.message });
    }
});

// --- Paramètres Frizbi SMS ---

app.get('/api/frizbi-test-public', (req, res) => {
    res.json({ message: 'Public Frizbi Route Reachable' });
});

app.get('/api/admin/frizbi-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur récupération paramètres Frizbi', error: error.message });
    }
});

console.log('[DEBUG] Registering POST /api/admin/frizbi-settings');
app.post('/api/admin/frizbi-settings', authenticateAdmin, async (req, res) => {
    const { is_enabled, api_url, client_id, client_secret, sender_id } = req.body;
    try {
        await db.run(`
            UPDATE frizbi_settings 
            SET is_enabled = ?, api_url = ?, client_id = ?, client_secret = ?, sender_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [is_enabled ? 1 : 0, api_url, client_id, client_secret, sender_id]);
        res.json({ message: 'Paramètres Frizbi mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour paramètres Frizbi', error: error.message });
    }
});

app.post('/api/admin/frizbi/test-connection', authenticateAdmin, async (req, res) => {
    const { api_url, client_id, client_secret } = req.body;
    try {
        const response = await axios.post(`${api_url}/api/auth/login`, {
            login: client_id,
            password: client_secret
        });
        if (response.data && response.data.token) {
            res.json({ success: true, message: 'Connexion réussie !' });
        } else {
            res.status(400).json({ success: false, message: 'Réponse API inattendue' });
        }
    } catch (error) {
        console.error('Test Frizbi Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            success: false, 
            message: error.response?.data?.message || error.message 
        });
    }
});

app.post('/api/admin/frizbi/send-test', authenticateAdmin, async (req, res) => {
    const { mobile, message } = req.body;
    const username = req.user?.username || 'admin';
    try {
        const settings = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
        if (!settings) throw new Error('Paramètres Frizbi non configurés');

        // 1. Login
        const authRes = await axios.post(`${settings.api_url}/api/auth/login`, {
            login: settings.client_id,
            password: settings.client_secret
        });
        const token = authRes.data.token;

        // 2. Envoi
        const sendRes = await axios.post(`${settings.api_url}/api/sms/send`, {
            customerSmsId: `test_${Date.now()}`,
            message: message || "Ceci est un test de l'API HubDSI Ivry.",
            customerSenderId: settings.sender_id,
            smsContacts: [
                {
                    customerSmsContactId: `contact_${Date.now()}`,
                    mobile: mobile,
                    firstName: "Test",
                    lastName: "HubDSI"
                }
            ]
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        res.json({ success: true, data: sendRes.data });
    } catch (error) {
        console.error('Test SMS Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            success: false, 
            message: error.response?.data?.message || error.message 
        });
    }
});

// API Ville settings (stored in app_settings)
app.get('/api/admin/api-ville-settings', authenticateAdmin, async (req, res) => {
    try {
        const keys = ['api_ville_url', 'api_ville_swagger_url', 'api_ville_token'];
        const rows = await db.all(`SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`, keys);
        const result = {};
        for (const k of keys) result[k] = '';
        for (const r of rows) result[r.setting_key] = r.setting_value || '';
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/api-ville-settings', authenticateAdmin, async (req, res) => {
    try {
        const { api_ville_url, api_ville_swagger_url, api_ville_token } = req.body;
        const entries = [
            ['api_ville_url', api_ville_url || '', 'URL de base de l\'API Ville'],
            ['api_ville_swagger_url', api_ville_swagger_url || '', 'URL Swagger de l\'API Ville'],
            ['api_ville_token', api_ville_token || '', 'Token d\'authentification API Ville'],
        ];
        for (const [key, value, desc] of entries) {
            await db.run(`INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)`, [key, value, desc]);
        }
        res.json({ message: 'Paramètres API Ville enregistrés' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/api-ville-settings/test', authenticateAdmin, async (req, res) => {
    try {
        const { api_ville_url, api_ville_token } = req.body;
        if (!api_ville_url) return res.status(400).json({ success: false, message: 'URL non configurée' });
        const headers = { 'Accept': 'application/json' };
        if (api_ville_token) headers['Authorization'] = `Bearer ${api_ville_token}`;
        const testUrl = api_ville_url.replace(/\/$/, '');
        const response = await axios.get(testUrl, { headers, timeout: 8000, validateStatus: () => true });
        const ok = response.status < 500;
        res.json({ success: ok, message: ok ? `Réponse HTTP ${response.status} — API accessible` : `Erreur HTTP ${response.status}`, status: response.status });
    } catch (e) {
        res.json({ success: false, message: `Impossible de joindre l'API : ${e.message}` });
    }
});

// --- Oracle Settings Routes ---
app.get('/api/oracle-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.all('SELECT * FROM oracle_settings ORDER BY id');
        // Masquer les mots de passe
        if (settings) {
            settings.forEach(s => { if (s.password) s.password = '********'; });
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres Oracle', error: error.message });
    }
});

app.post('/api/oracle-settings', authenticateAdmin, async (req, res) => {
    const { type, host, port, service_name, username, password, is_enabled } = req.body;
    try {
        if (!password || password === '********') {
            await db.run(
                'UPDATE oracle_settings SET host = ?, port = ?, service_name = ?, username = ?, is_enabled = ? WHERE type = ?',
                [host, port, service_name, username, is_enabled ? 1 : 0, type]
            );
        } else {
            await db.run(
                'UPDATE oracle_settings SET host = ?, port = ?, service_name = ?, username = ?, password = ?, is_enabled = ? WHERE type = ?',
                [host, port, service_name, username, password, is_enabled ? 1 : 0, type]
            );
        }
        res.json({ success: true, message: 'Paramètres Oracle enregistrés' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur sauvegarde Oracle', error: error.message });
    }
});

app.post('/api/oracle/test-connection', authenticateAdmin, async (req, res) => {
    const { type } = req.body;
    let connection;
    try {
        const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
        if (!settings) return res.status(404).json({ success: false, message: "Paramètres non trouvés" });

        connection = await getOracleConnection(settings);

        // Test query
        const result = await connection.execute('SELECT 1 FROM DUAL');

        res.json({
            success: true,
            message: `Connexion à Oracle ${type} (${settings.host}) réussie !`,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
});

app.post('/api/oracle/check-tables', authenticateAdmin, async (req, res) => {
    const { type } = req.body;
    let connection;
    try {
        const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
        if (!settings) return res.status(404).json({ success: false, message: "Paramètres non trouvés" });

        connection = await getOracleConnection(settings);

        // List active tables and views using SELECT TNAME FROM TAB
        const result = await connection.execute('SELECT TNAME FROM TAB WHERE TABTYPE IN (\'TABLE\', \'VIEW\')');

        // Extract names as simple strings for the frontend
        const tableNames = result.rows.map(row => row[0]);

        res.json({
            success: true,
            message: `Vérification des tables et vues Oracle ${type} terminée.`,
            details: tableNames
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
});

app.post('/api/oracle/table-columns', authenticateAdmin, async (req, res) => {
    const { type, tableName } = req.body;
    let connection;
    try {
        const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
        if (!settings) return res.status(404).json({ success: false, message: "Paramètres non trouvés" });

        connection = await getOracleConnection(settings);

        // Describe table to get column names
        const result = await connection.execute(`SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`, [tableName.toUpperCase()]);

        const columns = result.rows.map(row => row[0]);

        res.json({
            success: true,
            columns
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
});

app.post('/api/oracle/table-preview', authenticateAdmin, async (req, res) => {
    const { type, tableName } = req.body;
    let connection;
    try {
        const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
        connection = await getOracleConnection(settings);

        // On récupère juste la première ligne pour l'aperçu
        const result = await connection.execute(
            `SELECT * FROM ${tableName.toUpperCase()} WHERE ROWNUM <= 1`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            preview: result.rows.length > 0 ? result.rows[0] : {}
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
});

// --- Oracle Sync Config Routes ---
app.get('/api/oracle/sync-config/:type', authenticateAdmin, async (req, res) => {
    const { type } = req.params;
    try {
        const config = await db.all('SELECT * FROM oracle_sync_config WHERE type = ?', [type]);
        res.json(config);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture config sync Oracle' });
    }
});

app.post('/api/oracle/sync-config', authenticateAdmin, async (req, res) => {
    const { type, tables, filters, advancedConfigs } = req.body;
    try {
        await db.run('BEGIN TRANSACTION');
        await db.run('DELETE FROM oracle_sync_config WHERE type = ?', [type]);
        for (const tableName of tables) {
            const filter = filters && filters[tableName] ? filters[tableName] : '';
            const configJson = advancedConfigs && advancedConfigs[tableName] ? JSON.stringify(advancedConfigs[tableName]) : null;
            await db.run(
                'INSERT INTO oracle_sync_config (type, table_name, where_clause, config_json) VALUES (?, ?, ?, ?)',
                [type, tableName, filter, configJson]
            );
        }
        await db.run('COMMIT');
        res.json({ success: true, message: 'Configuration de synchronisation enregistrée' });
    } catch (error) {
        await db.run('ROLLBACK');
        res.status(500).json({ message: 'Erreur sauvegarde config sync Oracle', error: error.message });
    }
});

// --- MariaDB Settings Routes ---
app.get('/api/mariadb-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.all('SELECT * FROM mariadb_settings ORDER BY id');
        // Masquer les mots de passe
        if (settings) {
            settings.forEach(s => { if (s.password) s.password = '********'; });
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres MariaDB', error: error.message });
    }
});

app.post('/api/mariadb-settings', authenticateAdmin, async (req, res) => {
    const { type, host, port, user, password, database, is_enabled } = req.body;
    try {
        if (!password || password === '********') {
            await db.run(
                'UPDATE mariadb_settings SET host = ?, port = ?, user = ?, database = ?, is_enabled = ? WHERE type = ?',
                [host, port, user, database, is_enabled ? 1 : 0, type]
            );
        } else {
            await db.run(
                'UPDATE mariadb_settings SET host = ?, port = ?, user = ?, password = ?, database = ?, is_enabled = ? WHERE type = ?',
                [host, port, user, password, database, is_enabled ? 1 : 0, type]
            );
        }
        res.json({ success: true, message: 'Paramètres MariaDB enregistrés' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur sauvegarde MariaDB', error: error.message });
    }
});

app.post('/api/mariadb/test-connection', authenticateAdmin, async (req, res) => {
    const { type } = req.body;
    let conn;
    try {
        const settings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', [type]);
        if (!settings) return res.status(404).json({ success: false, message: "Paramètres non trouvés" });

        conn = await mariadb.createConnection({
            host: settings.host,
            port: settings.port,
            user: settings.user,
            password: settings.password,
            database: settings.database,
            connectTimeout: 5000
        });

        const rows = await conn.query("SELECT 1 as val");
        res.json({
            success: true,
            message: `Connexion à MariaDB ${type} (${settings.host}) réussie !`,
            data: rows
        });
    } catch (error) {
        res.status(500).json({ success: false, message: `Erreur de connexion : ${error.message}` });
    } finally {
        if (conn) {
            try { await conn.end(); } catch(e) {}
        }
    }
});

app.post('/api/mariadb/check-tables', authenticateAdmin, async (req, res) => {
    const { type } = req.body;
    let conn;
    try {
        const settings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', [type]);
        if (!settings) return res.status(404).json({ success: false, message: "Paramètres non trouvés" });

        conn = await mariadb.createConnection({
            host: settings.host,
            port: settings.port,
            user: settings.user,
            password: settings.password,
            database: settings.database,
            connectTimeout: 5000
        });

        // Récupérer la liste des tables
        const rows = await conn.query("SHOW TABLES");
        const tables = rows.map(r => Object.values(r)[0]);

        res.json({
            success: true,
            message: `Tables de la base MariaDB ${type} (${settings.host})`,
            details: tables
        });
    } catch (error) {
        res.status(500).json({ success: false, message: `Erreur : ${error.message}` });
    } finally {
        if (conn) {
            try { await conn.end(); } catch(e) {}
        }
    }
});

// Helper pour extraire une date propre d'une chaîne Oracle
function parseOracleDate(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    if (!s) return null;

    // Si c'est déjà un format ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

    // Format Français DD/MM/YYYY
    const frMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (frMatch) {
        const d = frMatch[1].padStart(2, '0');
        const m = frMatch[2].padStart(2, '0');
        const y = frMatch[3];
        return `${y}-${m}-${d}`;
    }

    // Tentative via JS Date native (nettoyage des parenthèses de timezone)
    try {
        const cleanS = s.replace(/\s*\(.*\)$/, '');
        const d = new Date(cleanS);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    } catch (e) { }

    return s;
}

app.post('/api/oracle/test-join', authenticateAdmin, async (req, res) => {
    const { type, secondaryTable, joinField, labelFields, searchValue } = req.body;
    let connection;
    try {
        const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
        connection = await getOracleConnection(settings);

        // On concatène les champs demandés pour le test
        const concatLabel = labelFields.map(f => `"${f}"`).join(" || ' ' || ");
        const query = `SELECT ${concatLabel} as RESULT FROM ${secondaryTable} WHERE ${joinField} = :val AND ROWNUM <= 1`;
        const result = await connection.execute(query, [searchValue], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        res.json({
            success: true,
            result: result.rows.length > 0 ? result.rows[0].RESULT : null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) { try { await connection.close(); } catch (e) { } }
    }
});

app.post('/api/oracle/import-tables', authenticateAdmin, async (req, res) => {
    const { type, tables: providedTables, filters: providedFilters, substitutions, tableConfig, primaryKeys } = req.body;
    // Défense contre dateFields manquant ou non défini
    const dateFields = req.body.dateFields || {};

    let tablesToSync = [];
    let connection;

    try {
        if (providedTables && Array.isArray(providedTables) && providedTables.length > 0) {
            tablesToSync = providedTables.map(t => ({
                table_name: t,
                where_clause: providedFilters && providedFilters[t] ? providedFilters[t] : ''
            }));
        } else {
            const savedConfig = await db.all('SELECT table_name, where_clause, config_json FROM oracle_sync_config WHERE type = ?', [type]);
            tablesToSync = savedConfig.map(c => ({
                table_name: c.table_name,
                where_clause: c.where_clause,
                config_json: c.config_json ? JSON.parse(c.config_json) : null
            }));
        }

        if (tablesToSync.length === 0) return res.status(400).json({ success: false, message: "Aucun objet à synchroniser" });
        const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
        connection = await getOracleConnection(settings);
        const report = [];

        for (const config of tablesToSync) {
            const tableName = config.table_name;
            const mainPrefix = type.toUpperCase() === 'RH' ? '' : tableName.toUpperCase() + "_";

            try {
                // Use stored config if available, otherwise fallback to request body
                const tableSettings = config.config_json || {};
                const selectedCols = providedTables ? (tableConfig && tableConfig[tableName]) : tableSettings.selectedFields;
                const pkField = providedTables ? (primaryKeys && primaryKeys[tableName]) : tableSettings.primaryKey;
                const tableSubst = providedTables ? (substitutions && substitutions[tableName] || {}) : (tableSettings.substitutions || {});
                const tableDateFields = providedTables ? (dateFields && dateFields[`${type}:${tableName}`] || []) : (tableSettings.dateFields || []);

                const metaRes = await connection.execute(`SELECT * FROM ${tableName} WHERE 1=0`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                const allTableColumns = metaRes.metaData.map(m => m.name);
                const columnsToImport = (selectedCols && Array.isArray(selectedCols)) ? allTableColumns.filter(c => selectedCols.includes(c)) : allTableColumns;

                let selectParts = [];
                let joinParts = [];
                let aliasIdx = 1;

                // Mappage des colonnes finales vers leur origine pour le parsing de date
                // key: localColName, value: originalMainFieldName
                const colSourceMap = {};

                for (const col of columnsToImport) {
                    if (tableSubst[col]) {
                        const { secondaryTable, joinField, labelFields } = tableSubst[col];
                        const alias = `S${aliasIdx++}`;
                        const secPrefix = secondaryTable.toUpperCase() + "_";

                        if (labelFields && labelFields.length > 0) {
                            labelFields.forEach(f => {
                                const localJoinCol = `${secPrefix}${f}`;
                                selectParts.push(`NVL(CAST(${alias}."${f}" AS VARCHAR2(4000)), 'XXXXX') AS "${localJoinCol}"`);
                            });
                        } else {
                            // Fallback
                            let localColName = `${mainPrefix}${col}`;
                            if (type.toUpperCase() === 'RH') {
                                if (localColName.toUpperCase().startsWith('V_EXTRACT_DSI_')) {
                                    localColName = localColName.substring(14);
                                } else if (localColName.toUpperCase().startsWith(tableName.toUpperCase() + '_')) {
                                    localColName = localColName.substring(tableName.length + 1);
                                }
                            }
                            selectParts.push(`T1."${col}" AS "${localColName}"`);
                            colSourceMap[localColName] = col;
                        }
                        joinParts.push(`LEFT JOIN ${secondaryTable} ${alias} ON T1."${col}" = ${alias}."${joinField}"`);
                    } else {
                        let localColName = `${mainPrefix}${col}`;
                        if (type.toUpperCase() === 'RH') {
                            if (localColName.toUpperCase().startsWith('V_EXTRACT_DSI_')) {
                                localColName = localColName.substring(14);
                            } else if (localColName.toUpperCase().startsWith(tableName.toUpperCase() + '_')) {
                                localColName = localColName.substring(tableName.length + 1);
                            }
                        }
                        selectParts.push(`T1."${col}" AS "${localColName}"`);
                        colSourceMap[localColName] = col;
                    }
                }

                let query = `SELECT ${selectParts.join(', ')} FROM ${tableName} T1 ${joinParts.join(' ')}`;

                const rawWhere = config.where_clause ? config.where_clause.trim() : "";
                const whereClause = rawWhere.replace(/"/g, "'");

                if (whereClause) {
                    const hasWhere = /^where\s/i.test(whereClause);
                    let formattedWhere = hasWhere ? whereClause : `WHERE ${whereClause}`;
                    const reserved = ['WHERE', 'AND', 'OR', 'LIKE', 'IN', 'NULL', 'IS', 'NOT', 'BETWEEN', 'ORDER', 'BY', 'DESC', 'ASC', 'DATE', 'TO_DATE', 'TO_CHAR', 'NVL', 'COALESCE', 'TRIM', 'UPPER', 'LOWER', 'SUBSTR', 'INSTR', 'COUNT', 'SUM', 'ROWNUM'];

                    formattedWhere = formattedWhere.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
                        if (reserved.includes(match.toUpperCase())) return match;
                        return `T1."${match}"`;
                    });
                    query += ` ${formattedWhere}`;
                }

                const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                const localTableName = type.toUpperCase() === 'RH' ? tableName : `oracle_${tableName.toLowerCase()}`;
                const finalColumns = result.metaData.map(m => m.name);

                // Identify EXTRACT columns and determine max sub-components
                const extractCols = finalColumns.filter(c => c.endsWith('_EXTRACT'));
                const maxSubCols = {};
                extractCols.forEach(c => maxSubCols[c] = 0);

                if (extractCols.length > 0) {
                    for (const rowObj of result.rows) {
                        for (const col of extractCols) {
                            const val = rowObj[col];
                            if (val && typeof val === 'string') {
                                const components = val.split('\x01');
                                if (components.length > maxSubCols[col]) maxSubCols[col] = components.length;
                            }
                        }
                    }
                }

                // Prepare final columns list for SQLite
                const columnsForSchema = [...finalColumns];
                const extraByOriginal = {};
                for (const col of extractCols) {
                    extraByOriginal[col] = [];
                    for (let i = 1; i <= maxSubCols[col]; i++) {
                        const newCol = `${col}_${i}`;
                        columnsForSchema.push(newCol);
                        extraByOriginal[col].push(newCol);
                    }
                }

                const dbPrefixMap = { 'FINANCES': 'gf', 'RH': 'rh' };
                const targetSchema = dbPrefixMap[type.toUpperCase()];
                const dbPrefix = targetSchema ? `${targetSchema}.` : '';
                const fullLocalTableName = `${dbPrefix}${localTableName}`;

                await db.run(`DROP TABLE IF EXISTS ${fullLocalTableName}`);
                const pkLocalField = pkField ? `${mainPrefix}${pkField}` : null;

                const createCols = columnsForSchema.map(col => `"${col}" TEXT${col === pkLocalField ? ' PRIMARY KEY' : ''}`).join(', ');
                await db.run(`CREATE TABLE ${fullLocalTableName} (${createCols})`);

                if (result.rows.length > 0) {
                    const placeholders = columnsForSchema.map(() => '?').join(',');
                    const insertSql = `INSERT INTO ${fullLocalTableName} (${columnsForSchema.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;

                    await db.run('BEGIN TRANSACTION');
                    try {
                        for (const rowObj of result.rows) {
                            const fullValues = [];

                            // 1. Base columns values (with date parsing)
                            for (const col of finalColumns) {
                                let val = rowObj[col];
                                const originalFieldName = colSourceMap[col];
                                // Auto-detect date fields by name or config
                                if (originalFieldName && (tableDateFields.includes(originalFieldName) || originalFieldName.toUpperCase().includes('DATE'))) {
                                    val = parseOracleDate(val);
                                }
                                fullValues.push(val !== null ? String(val) : null);
                            }

                            // 2. Extra decomposed columns
                            for (const col of extractCols) {
                                const rawVal = rowObj[col];
                                const components = (rawVal && typeof rawVal === 'string') ? rawVal.split('\x01') : [];
                                for (let i = 0; i < maxSubCols[col]; i++) {
                                    const subVal = components[i];
                                    fullValues.push(subVal !== undefined && subVal !== null ? String(subVal).trim() : null);
                                }
                            }

                            await db.run(insertSql, fullValues);
                        }
                        await db.run('COMMIT');
                    } catch (e) { await db.run('ROLLBACK'); throw e; }
                }
                report.push({ table: tableName, status: 'OK', count: result.rows.length, localTable: fullLocalTableName });
            } catch (err) {
                console.error(`[ORACLE ERROR] ${tableName}:`, err.message);
                report.push({ table: tableName, status: 'ERROR', message: err.message });
            }
        }
        res.json({ success: true, message: `Synchronisation Oracle ${type} terminée.`, report });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
});


// GLPI Module
app.use('/api/glpi', glpiRouter);

// Certificates Module
app.use('/api/certificates', certificatesRouter);

// Finance & Tiers Module
app.use('/api/budget', financeRouter);
app.use('/api/tiers', tiersRouter);
app.use('/api/contacts', contactsRouter);

// Route : Créer une idée
app.post('/api/magapp/ideas', async (req, res) => {
    try {
        const { title, description, author_email, author_name } = req.body;
        if (!title) return res.status(400).json({ message: 'Titre requis' });
        
        const result = await pgDb.run(
            `INSERT INTO magapp.ideas (title, description, author_email, author_name, status) VALUES ($1, $2, $3, $4, 'new')`,
            [title, description || '', author_email || '', author_name || '']
        );
        
        res.json({ success: true, id: result.lastID, message: 'Idée créée avec succès' });
    } catch (error) {
        console.error('[Ideas] Erreur création idée:', error.message);
        res.status(500).json({ message: `Erreur création idée: ${error.message}` });
    }
});

// Route : Lister les idées
app.get('/api/magapp/ideas', async (req, res) => {
    try {
        const ideas = await pgDb.all('SELECT * FROM magapp.ideas ORDER BY created_at DESC');
        res.json(ideas);
    } catch (error) {
        console.error('[Ideas] Erreur liste:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Route : Lister les idées d'un utilisateur
app.get('/api/magapp/ideas/user', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ message: 'Email requis' });
        const ideas = await pgDb.all('SELECT * FROM magapp.ideas WHERE author_email = $1 ORDER BY created_at DESC', [email]);
        res.json(ideas);
    } catch (error) {
        console.error('[Ideas] Erreur liste:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Route : Supprimer une idée
app.delete('/api/magapp/ideas/:id', async (req, res) => {
    try {
        await pgDb.run('DELETE FROM magapp.ideas WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[Ideas] Erreur suppression:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Admin: Lister toutes les idées
app.get('/api/admin/magapp/ideas', authenticateMagappControl, async (req, res) => {
    try {
        const ideas = await pgDb.all(`
            SELECT i.*, 
                   (SELECT json_agg(json_build_object('id', a.id, 'filename', a.original_name, 'file_path', a.file_path)) 
                    FROM magapp.idea_attachments a WHERE a.idea_id = i.id) as attachments
            FROM magapp.ideas i 
            ORDER BY i.created_at DESC
        `);
        res.json(ideas);
    } catch (error) {
        console.error('[Ideas Admin] Erreur liste:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Admin: Mettre à jour le statut et réponse d'une idée
app.put('/api/admin/magapp/ideas/:id', authenticateMagappControl, async (req, res) => {
    try {
        const { status, admin_response } = req.body;
        await pgDb.run(
            'UPDATE magapp.ideas SET status = $1, admin_response = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [status, admin_response || '', req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('[Ideas Admin] Erreur mise à jour:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Admin: Supprimer une idée
app.delete('/api/admin/magapp/ideas/:id', authenticateMagappControl, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM magapp.ideas WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[Ideas Admin] Erreur suppression:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Route : Upload de fichiers pour idées
const ideasUploadDir = path.join(__dirname, 'ideas_attachments');
if (!fs.existsSync(ideasUploadDir)) {
    fs.mkdirSync(ideasUploadDir, { recursive: true });
}

const ideasStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, ideasUploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const ideasUpload = multer({ storage: ideasStorage });

app.post('/api/magapp/ideas/upload', ideasUpload.array('files', 5), async (req, res) => {
    try {
        const { idea_id } = req.body;
        const files = req.files;
        
        if (!idea_id || !files || files.length === 0) {
            return res.status(400).json({ message: 'Données invalides' });
        }
        
        for (const file of files) {
            await pgDb.run(
                `INSERT INTO magapp.idea_attachments (idea_id, filename, original_name, file_path, file_size) VALUES ($1, $2, $3, $4, $5)`,
                [idea_id, file.filename, file.originalname, file.path, file.size]
            );
        }
        
        res.json({ success: true, count: files.length });
    } catch (error) {
        console.error('[Ideas] Erreur upload:', error.message);
        res.status(500).json({ message: `Erreur upload: ${error.message}` });
    }
});




// Route de test de liaison Active Directory (Compte technique uniquement)
app.post('/api/auth/ad-ping', authenticateAdmin, async (req, res) => {
    let { host, port, base_dn, bind_dn, bind_password } = req.body;

    // Résolution du mot de passe si sentinel
    if (bind_password === '••••••••' || bind_password === '********') {
        const settings = await db.get('SELECT bind_password FROM ad_settings WHERE id = 1');
        bind_password = settings?.bind_password || '';
    }

    const logMsg = `Ping AD (Route): Tentative pour ${host}:${port} avec ${bind_dn}`;
    console.log(logMsg);
    console.log(`[DEBUG AD PING] Full Params: host=${host}, port=${port}, base=${base_dn}, bind=${bind_dn}`);
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}\n`);

    const client = ldap.createClient({
        url: `ldap://${host}:${port}`,
        connectTimeout: 10000,
        timeout: 10000
    });

    client.on('error', (err) => {
        console.error('LDAP Ping Client Error:', err.message);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Ping AD Erreur: ${err.message}
`);
        res.status(500).json({ success: false, message: `Impossible de contacter le serveur : ${err.message}` });
    });

    client.bind(bind_dn, bind_password, (err) => {
        if (err) {
            client.destroy();
            console.error('AD Ping Bind Error:', err.message);
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Ping AD Echec Bind: ${err.message}\n`);
            return res.status(401).json({ success: false, message: `Liaison échouée : ${err.message}` });
        }
        client.destroy();
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Ping AD Succès\n`);
        res.json({ success: true, message: 'La liaison avec l\'Active Directory a réussi !' });
    });
});

// Route de test Active Directory (Outil de recherche / Lookup)
app.post('/api/auth/ad-test', authenticateAdmin, async (req, res) => {
    let { host, port, base_dn, bind_dn, bind_password, username } = req.body;

    // Résolution du mot de passe si sentinel
    if (bind_password === '••••••••' || bind_password === '********') {
        const settings = await db.get('SELECT bind_password FROM ad_settings WHERE id = 1');
        bind_password = settings?.bind_password || '';
    }

    const logMsg = `Lookup AD: Recherche d'infos pour ${username} via le compte technique ${bind_dn}`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

    const client = ldap.createClient({
        url: `ldap://${host}:${port}`,
        connectTimeout: 10000,
        timeout: 10000
    });

    client.on('error', (err) => {
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD Erreur: ${err.message}
`);
        res.status(500).json({ success: false, message: `Erreur client LDAP : ${err.message}` });
    });

    client.bind(bind_dn, bind_password, (err) => {
        if (err) {
            client.destroy();
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD Echec Bind: ${err.message}
`);
            return res.status(401).json({ success: false, message: `Liaison technique échouée : ${err.message}` });
        }

        const searchOptions = {
            filter: `(|(sAMAccountName=${username}*)(cn=${username}*)(mail=${username}*))`,
            scope: 'sub',
            attributes: ['dn', 'cn', 'mail', 'displayName', 'memberOf', 'title', 'department', 'sAMAccountName'],
            referrals: false,
            paged: false,
            sizeLimit: 20
        };

        client.search(base_dn, searchOptions, (err, searchRes) => {
            if (err) {
                client.destroy();
                return res.status(500).json({ success: false, message: `Erreur recherche : ${err.message}` });
            }

            let entries = [];
            searchRes.on('searchEntry', (entry) => {
                const obj = flattenLDAPEntry(entry);
                if (obj) {
                    entries.push({
                        dn: obj.dn,
                        cn: obj.cn,
                        sAMAccountName: obj.sAMAccountName,
                        displayName: obj.displayName,
                        mail: obj.mail,
                        memberOf: obj.memberOf,
                        title: obj.title,
                        department: obj.department
                    });
                }
            });
            searchRes.on('error', (err) => {
                client.destroy();
                res.status(500).json({ success: false, message: err.message });
            });
            searchRes.on('end', (result) => {
                client.destroy();
                if (entries.length === 0) {
                    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD: Utilisateur non trouvé\n`);
                    return res.status(404).json({ success: false, message: `Utilisateur "${username}" non trouvé dans l'AD.` });
                }

                // Trier pour privilégier l'exact match
                const exactMatch = entries.find(e => e.sAMAccountName && e.sAMAccountName.toLowerCase() === username.toLowerCase());
                const userEntry = exactMatch || entries[0];

                fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD: Succès pour ${username} (Match: ${userEntry.sAMAccountName})\n`);
                res.json({
                    success: true,
                    message: `Informations récupérées pour ${userEntry.displayName || userEntry.cn || username}`,
                    data: userEntry
                });
            });
        });
    });
});

// Route pour voir les logs dans le navigateur
app.get('/mouchard', (req, res) => {
    try {
        const logPath = path.join(__dirname, 'logs', 'mouchard.log');
        if (!fs.existsSync(logPath)) return res.send("Aucun log disponible.");

        // Sécurité : Vérifier que c'est bien un fichier (évite EISDIR si volume Docker mal monté)
        const stats = fs.statSync(logPath);
        if (stats.isDirectory()) {
            return res.send("Erreur : 'logs', 'mouchard.log' est un dossier sur le serveur. Veuillez supprimer le dossier et relancer pour qu'un fichier soit créé.");
        }

        const logs = fs.readFileSync(logPath, 'utf8');
        const lines = logs.split('\n').filter(l => l.trim().length > 0).reverse().slice(0, 100);

        const formatLine = (l) => {
            let color = '#d4d4d4';
            if (l.includes('DELETE')) color = '#f44336';
            if (l.includes('POST')) color = '#4caf50';
            if (l.includes('PUT')) color = '#ff9800';
            if (l.includes('SUCCÈS')) color = '#00ff00';
            if (l.includes('ERREUR') || l.includes('Échec') || l.includes('Error')) color = '#ff0000';
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
        res.send("Erreur lors de la lecture des logs: " + err.message);
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

// Todo List API
app.get('/api/todos', authenticateJWT, async (req, res) => {
    try {
        const todos = await db.all('SELECT * FROM todos ORDER BY priority DESC, created_at DESC');
        res.json(todos);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture todos', error: error.message });
    }
});

app.post('/api/todos', authenticateJWT, async (req, res) => {
    const { task, priority, status } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO todos (task, priority, status) VALUES (?, ?, ?)',
            [task, priority || 0, status || 'à faire']
        );
        res.json({ id: result.lastID, message: 'Todo créé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur création todo', error: error.message });
    }
});

app.put('/api/todos/:id', authenticateJWT, async (req, res) => {
    const { task, priority, status } = req.body;
    try {
        await db.run(
            'UPDATE todos SET task = ?, priority = ?, status = ? WHERE id = ?',
            [task, priority, status, req.params.id]
        );
        res.json({ message: 'Todo mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour todo', error: error.message });
    }
});

app.delete('/api/todos/:id', authenticateJWT, async (req, res) => {
    try {
        await db.run('DELETE FROM todos WHERE id = ?', [req.params.id]);
        res.json({ message: 'Todo supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression todo', error: error.message });
    }
});

// Release API
app.post('/api/release', authenticateAdmin, async (req, res) => {
    try {
        // 1. Charger le changelog actuel
        const changelogPath = path.join(__dirname, 'changelog.json');
        const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));

        // 2. Récupérer les todos terminés (statut 'ok')
        const finishedTodos = await db.all("SELECT task FROM todos WHERE status = 'ok'");
        if (finishedTodos.length === 0) {
            return res.status(400).json({ message: "Aucun todo terminé ('ok') pour documenter la release." });
        }

        // 3. Incrémenter la version (on incrémente le dernier chiffre)
        const parts = changelog.currentVersion.split('.');
        parts[parts.length - 1] = parseInt(parts[parts.length - 1]) + 1;
        const newVersion = parts.join('.');

        // 4. Créer la nouvelle entrée
        const newRelease = {
            version: newVersion,
            date: new Date().toLocaleDateString('fr-FR'),
            changes: finishedTodos.map(t => t.task)
        };

        // 5. Mettre à jour l'objet changelog
        changelog.currentVersion = newVersion;
        changelog.history.unshift(newRelease);

        // 6. Sauvegarder changelog.json
        fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 4));

        // 7. Supprimer les todos terminés
        await db.run("DELETE FROM todos WHERE status = 'ok'");

        // 8. Git commit
        exec(`git add . && git commit -m "Release v${newVersion}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Git Error: ${error.message}`);
                return res.json({
                    message: `Version ${newVersion} créée localement, mais échec du commit git.`,
                    version: newVersion,
                    gitError: error.message
                });
            }
            res.json({
                message: `Version ${newVersion} créée et commitée avec succès !`,
                version: newVersion,
                gitOutput: stdout
            });
        });

    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la release', error: error.message });
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
    } catch (e) { }

    // Initialisation table ad_settings
    try {
        await db.run(`
            CREATE TABLE IF NOT EXISTS ad_settings (
                id INTEGER PRIMARY KEY,
                is_enabled BOOLEAN DEFAULT 0,
                host TEXT,
                port INTEGER DEFAULT 389,
                base_dn TEXT,
                required_group TEXT,
                bind_dn TEXT,
                bind_password TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const adExists = await db.get('SELECT id FROM ad_settings WHERE id = 1');
        if (!adExists) {
            await db.run(`
                INSERT INTO ad_settings (id, is_enabled, host, port, base_dn, required_group, bind_dn, bind_password) 
                VALUES (1, 0, "10.103.130.118", 389, "DC=ivry,DC=local", "", "CN=testo,OU=IRS,OU=IVRY,DC=ivry,DC=local", "")

            `);
        }
    } catch (e) {
        console.error('Erreur init ad_settings:', e);
    }

    // Recalcul au démarrage
    await recalculateAllOperations();

    // Initialize PostgreSQL for MagApp
    await setupPgDb();


    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Backend server running on http://0.0.0.0:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to setup database:', err);
    process.exit(1);
});




// PostgreSQL Connection Settings (in SQLite)
app.get('/api/postgres-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM postgres_settings WHERE id = 1');
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching postgres settings' });
    }
});

app.post('/api/postgres-settings', authenticateAdmin, async (req, res) => {
    const { host, port, database, username, password, is_enabled } = req.body;
    try {
        await db.run(
            'UPDATE postgres_settings SET host = ?, port = ?, database = ?, username = ?, password = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
            [host, port, database, username, password, is_enabled ? 1 : 0]
        );
        res.json({ message: 'PostgreSQL connection settings updated. Restart server to apply.' });
    } catch (error) {
        console.error('Erreur postgres_settings:', error);
        res.status(500).json({ message: 'Error updating postgres settings', error: error.message });
    }
});

// Mail API
app.get('/api/mail-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM mail_settings WHERE id = 1');
        if (settings) {
            // Ensure booleans are converted properly if handled as numbers 0/1 in SQLite
            settings.global_enable = !!settings.global_enable;
            settings.use_api = !!settings.use_api;
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres mail' });
    }
});

app.post('/api/mail-settings', authenticateAdmin, async (req, res) => {
    const s = req.body;
    try {
        const params = [
            s.smtp_host || null, 
            (s.smtp_port && !isNaN(s.smtp_port)) ? parseInt(s.smtp_port) : null, 
            s.smtp_user || null, 
            s.smtp_pass || null,
            s.smtp_secure || null, 
            s.proxy_host || null, 
            (s.proxy_port && !isNaN(s.proxy_port)) ? parseInt(s.proxy_port) : null,
            s.sender_email || null, 
            s.sender_name || 'DSI Hub', 
            s.api_key || null, 
            s.template_html || '',
            s.global_enable ? 1 : 0, 
            s.use_api ? 1 : 0, 
            s.api_url || null
        ];

        await db.run(`
            UPDATE mail_settings SET 
                smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, 
                smtp_secure = ?, proxy_host = ?, proxy_port = ?, 
                sender_email = ?, sender_name = ?, api_key = ?, template_html = ?,
                global_enable = ?, use_api = ?, api_url = ?
            WHERE id = 1
        `, params);
        res.json({ message: 'Paramètres mis à jour' });
    } catch (error) {
        console.error('Erreur mise à jour paramètres mail:', error);
        res.status(500).json({ message: 'Erreur mise à jour paramètres mail', error: error.message });
    }
});

app.post('/api/send-test-mail', authenticateAdmin, async (req, res) => {
    const { to } = req.body;
    try {
        const logMsg = `Tentative d'envoi de mail de test à: ${to}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

        await sendMail(to, "Test d'envoi DSI Hub", "<p>Ceci est un mail de test envoyé depuis le paramétrage du <strong>DSI Hub Ivry</strong>.</p><p>Si vous recevez ce message, la configuration est correcte.</p>");
        res.json({ message: 'Mail de test envoyé avec succès' });
    } catch (error) {
        const errMsg = `ÉCHEC envoi mail de test: ${error.message}`;
        console.error(errMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${errMsg}
`);
        res.status(500).json({ message: "Erreur d'envoi", error: error.message });
    }
});



// Default Error Handler (must be after all routes)
app.use((err, req, res, next) => {
    const time = new Date().toISOString();
    const errMsg = `[${time}] ERREUR CRITIQUE (${req.method} ${req.url}): ${err.message}
Stack: ${err.stack}
`;
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), errMsg);
    console.error(errMsg);

    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({
        message: 'Erreur interne du serveur',
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Capture les erreurs non gérées au niveau global pour éviter que le processus Node ne plante silencieusement
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

// Budgets API
app.get('/api/budgets', authenticateJWT, async (req, res) => {
    try {
        const budgets = await db.all('SELECT * FROM budgets ORDER BY Annee, numero');
        res.json(budgets);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des budgets', error: error.message });
    }
});

app.post('/api/budgets', authenticateAdmin, async (req, res) => {
    const { Annee, numero, Libelle } = req.body;
    try {
        const result = await db.run('INSERT INTO budgets (Annee, numero, Libelle) VALUES (?, ?, ?)', [Annee, numero, Libelle]);
        res.json({ id: result.lastID, message: 'Budget créé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur création budget', error: error.message });
    }
});

app.put('/api/budgets/:id', authenticateAdmin, async (req, res) => {
    const { Annee, numero, Libelle } = req.body;
    try {
        await db.run('UPDATE budgets SET Annee = ?, numero = ?, Libelle = ? WHERE id = ?', [Annee, numero, Libelle, req.params.id]);
        res.json({ message: 'Budget mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour budget', error: error.message });
    }
});

app.delete('/api/budgets/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM budgets WHERE id = ?', [req.params.id]);
        res.json({ message: 'Budget supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression budget', error: error.message });
    }
});

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
        res.status(500).json({ message: "Erreur d'exécution de la requête", error: error.message });
    }
});

// Admin Settings API
app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.all("SELECT * FROM app_settings ORDER BY setting_key");
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres', error: error.message });
    }
});

app.post('/api/admin/settings', authenticateAdmin, async (req, res) => {
    const { setting_key, setting_value, description } = req.body;
    try {
        await db.run(
            `INSERT INTO app_settings (setting_key, setting_value, description) 
             VALUES (?, ?, ?) 
             ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`,
            [setting_key, setting_value, description]
        );
        res.json({ message: 'Paramètre mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour paramètre', error: error.message });
    }
});

app.delete('/api/admin/settings/:key', authenticateAdmin, async (req, res) => {
    try {
        await db.run("DELETE FROM app_settings WHERE setting_key = ?", [req.params.key]);
        res.json({ message: 'Paramètre supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression paramètre', error: error.message });
    }
});

// Settings API (Public / Authenticated users)
app.get('/api/settings/public', authenticateJWT, async (req, res) => {
    try {
        // Return only settings safe for regular users
        const safeKeys = ['url_sedit_fi'];
        const placeholders = safeKeys.map(() => '?').join(',');
        const settings = await db.all(`SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${placeholders})`, safeKeys);

        // Convert array to object { url_sedit_fi: '...' }
        const settingsObj = settings.reduce((acc, curr) => {
            acc[curr.setting_key] = curr.setting_value;
            return acc;
        }, {});

        res.json(settingsObj);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres publics', error: error.message });
    }
});

// SQL Explorer API
app.get('/api/admin/sql/databases', authenticateAdmin, async (req, res) => {
    try {
        const databases = await db.all("PRAGMA database_list");
        
        const mariadbs = await db.all("SELECT type, database as dbName FROM mariadb_settings WHERE is_enabled = 1");
        for (const m of mariadbs) {
            databases.push({ seq: 1000 + databases.length, name: `mariadb_${m.type}`, file: `MariaDB (${m.dbName || m.type})` });
        }
        
        res.json(databases);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture bases de données', error: error.message });
    }
});

app.get('/api/admin/sql/tables', authenticateAdmin, async (req, res) => {
    try {
        const rawDbName = typeof req.query.db === 'string' && req.query.db ? req.query.db : 'main';
        
        if (rawDbName.startsWith('mariadb_')) {
            const type = rawDbName.split('_')[1];
            const settings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', [type]);
            if (!settings) return res.status(404).json({ message: "Paramètres MariaDB non trouvés" });
            
            const conn = await mariadb.createConnection({
                host: settings.host, port: settings.port, user: settings.user,
                password: settings.password, database: settings.database, connectTimeout: 5000
            });
            const rows = await conn.query("SHOW TABLES");
            await conn.end();
            const tables = rows.map(r => ({ name: Object.values(r)[0], type: 'table' }));
            return res.json(tables);
        }

        const dbName = rawDbName.replace(/[^a-zA-Z0-9_]/g, '');
        const tables = await db.all(`SELECT name, type FROM "${dbName}".sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`);
        res.json(tables);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture tables', error: error.message });
    }
});
app.get('/api/admin/sql/table-info/:tableName', authenticateAdmin, async (req, res) => {
    const { tableName } = req.params;
    const rawDbName = typeof req.query.db === 'string' && req.query.db ? req.query.db : 'main';

    try {
        if (rawDbName.startsWith('mariadb_')) {
            const type = rawDbName.split('_')[1];
            const settings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', [type]);
            const conn = await mariadb.createConnection({
                host: settings.host, port: settings.port, user: settings.user,
                password: settings.password, database: settings.database, connectTimeout: 5000
            });
            
            const cols = await conn.query(`DESCRIBE \`${tableName}\``);
            const pks = cols.filter(c => c.Key === 'PRI').map(c => c.Field);
            
            const countRows = await conn.query(`SELECT COUNT(*) as c FROM \`${tableName}\``);
            const count = (countRows && countRows.length > 0) ? Number(countRows[0].c) : 0;
            
            await conn.end();
            return res.json({ pk: pks, indices: [], count });
        }

        const dbName = rawDbName.replace(/[^a-zA-Z0-9_]/g, '');
        const columns = await db.all(`PRAGMA "${dbName}".table_info("${tableName}")`);
        const pks = columns.filter(c => c.pk > 0).map(c => c.name);

        const indices = await db.all(`PRAGMA "${dbName}".index_list("${tableName}")`);
        const indexNames = indices.map(idx => idx.name);

        let rowCount = 0;
        try {
            const countRes = await db.get(`SELECT COUNT(*) as c FROM "${dbName}"."${tableName}"`);
            rowCount = countRes ? countRes.c : 0;
        } catch (e) {
            // Vue ou autre table inaccessible
        }

        res.json({ pk: pks, indices: indexNames, count: rowCount });
    } catch (error) {
        res.status(500).json({ message: `Erreur info table ${tableName}`, error: error.message });
    }
});

app.get('/api/admin/sql/table/:tableName', authenticateAdmin, async (req, res) => {
    const { tableName } = req.params;
    const dbName = typeof req.query.db === 'string' && req.query.db ? req.query.db.replace(/[^a-zA-Z0-9_]/g, '') : 'main';
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    try {
        // Get columns info
        const columns = await db.all(`PRAGMA "${dbName}".table_info("${tableName}")`);

        // Get total count
        const countRes = await db.get(`SELECT COUNT(*) as total FROM "${dbName}"."${tableName}"`);

        // Get records
        const records = await db.all(`SELECT * FROM "${dbName}"."${tableName}" LIMIT ? OFFSET ?`, [limit, offset]);

        res.json({
            records,
            columns,
            total: countRes.total,
            limit,
            offset
        });
    } catch (error) {
        res.status(500).json({ message: `Erreur lecture table ${tableName}`, error: error.message });
    }
});

app.post('/api/admin/sql/query', authenticateAdmin, async (req, res) => {
    const { sql, db: requestDb } = req.body;
    if (!sql) return res.status(400).json({ message: 'Requête SQL requise' });

    const startTime = Date.now();
    try {
        let records;

        if (requestDb && requestDb.startsWith('mariadb_')) {
            const type = requestDb.split('_')[1];
            const settings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', [type]);
            const conn = await mariadb.createConnection({
                host: settings.host, port: settings.port, user: settings.user,
                password: settings.password, database: settings.database, connectTimeout: 5000
            });
            
            const result = await conn.query(sql);
            if (!Array.isArray(result)) {
                // For INSERT, UPDATE, DELETE
                records = [{ affectedRows: result.affectedRows, insertId: result.insertId ? parseInt(result.insertId) : null }];
            } else {
                records = result; // Map or convert if needed, usually row objects are returned directly
                // Filter meta
                if (records.meta) delete records.meta;
            }
            await conn.end();
        } else {
            const isSelect = sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA') || sql.trim().toUpperCase().startsWith('EXPLAIN');
            if (isSelect) {
                records = await db.all(sql);
            } else {
                const result = await db.run(sql);
                records = [{ changes: result.changes, lastID: result.lastID }];
            }
        }

        const executionTime = Date.now() - startTime;
        res.json({
            records,
            count: records.length,
            executionTime
        });
    } catch (error) {
        res.status(500).json({ message: "Erreur d'exécution", error: error.message });
    }
});

// Auth Routes
app.post('/api/login', async (req, res) => {
    let { username, password } = req.body;
    
    if (username) username = username.replace(/@ivry94\.fr$/i, '');

    // 1. Tentative via Active Directory si activé
    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (adSettings && adSettings.is_enabled) {
            const adUser = await authenticateAD(username, password, adSettings);
            if (adUser) {
                // L'utilisateur est authentifié AD. On cherche son profil localement.
                let user = await db.get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);

                if (!user) {
                    // Création automatique de l'utilisateur s'il est OK AD mais absent de la base locale
                    try {
                        // Règle spéciale : admin et adminhub sont toujours approuvés
                        const isAdminAccount = username.toLowerCase() === 'admin' || username.toLowerCase() === 'adminhub';
                        const role = isAdminAccount ? 'admin' : 'user';
                        const isApproved = isAdminAccount ? 1 : 0;

                        const result = await db.run(
                            'INSERT INTO users (username, role, is_approved) VALUES (?, ?, ?)',
                            [adUser.username.toLowerCase(), role, isApproved]
                        );
                        user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
                        console.log(`[AUTH] Nouvel utilisateur AD créé : ${adUser.username} (Role: ${role}, Approved: ${isApproved})`);
                    } catch (insertError) {
                        console.error(`[AUTH] Erreur lors de la création auto de l'utilisateur ${username}:`, insertError);
                        return res.status(500).json({ message: "Erreur lors de la création du compte local." });
                    }
                }

                if (user) {
                    // Les utilisateurs non approuvés reçoivent quand même un token pour le Dashboard restreint
                    const accessToken = jwt.sign({
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        is_approved: user.is_approved,
                        service_code: user.service_code,
                        service_complement: user.service_complement
                    }, SECRET_KEY);

                    return res.json({
                        accessToken,
                        user: {
                            id: user.id,
                            username: user.username,
                            role: user.role,
                            is_approved: user.is_approved,
                            service_code: user.service_code,
                            service_complement: user.service_complement
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error('AD Auth error during login:', error.message);
    }

    // 2. Auth locale (Fallback ou comptes locaux)
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (user && user.password && await bcrypt.compare(password, user.password)) {
        // Règle de sécurité : Les admins sont TOUJOURS approuvés
        const isApproved = (user.role === 'admin' || user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === 'adminhub') ? 1 : user.is_approved;

        const accessToken = jwt.sign({
            id: user.id,
            username: user.username,
            role: user.role,
            is_approved: isApproved,
            service_code: user.service_code,
            service_complement: user.service_complement
        }, SECRET_KEY);

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                is_approved: isApproved,
                service_code: user.service_code,
                service_complement: user.service_complement
            }
        });
    } else {
        res.status(401).json({ message: 'Identifiants invalides' });
    }
});

// Admin Access Requests Management
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
// Public endpoint for magapp to fetch tiles with links
app.get('/api/tiles', async (req, res) => {
    try {
        const tiles = await db.all('SELECT * FROM tiles ORDER BY sort_order');

        // Load links for all tiles
        for (const tile of tiles) {
            tile.links = await db.all('SELECT * FROM tile_links WHERE tile_id = ?', [tile.id]);
        }

        res.json(tiles);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des tuiles', error: error.message });
    }
});

// Authenticated endpoint for admin to get authorized tiles
app.get('/api/tiles-auth', authenticateJWT, async (req, res) => {
    try {
        const tiles = await db.all('SELECT * FROM tiles ORDER BY sort_order');

        let authorizedTileIds = new Set();
        if (req.user.role === 'admin' || req.user.username?.toLowerCase() === 'admin' || req.user.username?.toLowerCase() === 'adminhub') {
            tiles.forEach(t => authorizedTileIds.add(t.id));
        } else {
            const userTiles = await db.all('SELECT tile_id FROM user_tiles WHERE user_id = ?', [req.user.id]);
            userTiles.forEach(ut => authorizedTileIds.add(ut.tile_id));
        }

        for (const tile of tiles) {
            tile.is_authorized = authorizedTileIds.has(tile.id);
            if (tile.is_authorized) {
                tile.links = await db.all('SELECT * FROM tile_links WHERE tile_id = ?', [tile.id]);
            } else {
                tile.links = []; // Hide links if not authorized
            }
        }
        res.json(tiles);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des tuiles', error: error.message });
    }
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




// Import Budget Lines from Excel

// Import Invoices from Excel

// Import Orders from Excel


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
    try {
        const users = await db.all('SELECT id, username, role, is_approved, last_activity, service_code, service_complement FROM users');
        const userTiles = await db.all('SELECT user_id, tile_id FROM user_tiles');

        const tileMap = {};
        userTiles.forEach(ut => {
            const uid = ut.user_id.toString();
            if (!tileMap[uid]) tileMap[uid] = [];
            tileMap[uid].push(Number(ut.tile_id));
        });

        users.forEach(u => {
            const uid = u.id.toString();
            u.authorized_tiles = tileMap[uid] || [];
        });

        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs', error: error.message });
    }
});

app.put('/api/users/:id', authenticateAdmin, async (req, res) => {
    const { role, is_approved, service_code, service_complement } = req.body;
    try {
        await db.run(
            'UPDATE users SET role = ?, is_approved = ?, service_code = ?, service_complement = ? WHERE id = ?',
            [role, is_approved, service_code, service_complement, req.params.id]
        );
        res.json({ message: 'Utilisateur mis à jour avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
});

app.put('/api/users/:id/tiles', authenticateAdmin, async (req, res) => {
    const { tiles } = req.body;
    try {
        await db.run('DELETE FROM user_tiles WHERE user_id = ?', [req.params.id]);

        if (Array.isArray(tiles) && tiles.length > 0) {
            for (const tileId of tiles) {
                await db.run('INSERT INTO user_tiles (user_id, tile_id) VALUES (?, ?)', [req.params.id, tileId]);
            }
        }
        res.json({ message: 'Tuiles autorisées mises à jour avec succès' });
    } catch (error) {
        console.error('Erreur save tiles:', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour des tuiles', error: error.message });
    }
});

app.delete('/api/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        // Empêcher de supprimer son propre compte
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte administrateur." });
        }
        await db.run('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'Utilisateur supprimé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la suppression de l\'utilisateur', error: error.message });
    }
});

// Email Templates API
app.get('/api/email-templates', authenticateAdmin, async (req, res) => {
    try {
        const templates = await db.all('SELECT id, slug as name, subject, body as content FROM email_templates');
        res.json(templates);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des modèles', error: error.message });
    }
});

app.post('/api/email-templates', authenticateAdmin, async (req, res) => {
    const { name, subject, content } = req.body;
    try {
        await db.run('INSERT INTO email_templates (slug, label, subject, body) VALUES (?, ?, ?, ?)', [name, name, subject, content]);
        res.json({ message: 'Modèle créé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la création du modèle', error: error.message });
    }
});

app.put('/api/email-templates/:id', authenticateAdmin, async (req, res) => {
    const { name, subject, content } = req.body;
    try {
        await db.run('UPDATE email_templates SET slug = ?, label = ?, subject = ?, body = ? WHERE id = ?', [name, name, subject, content, req.params.id]);
        res.json({ message: 'Modèle mis à jour avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la mise à jour du modèle', error: error.message });
    }
});

app.delete('/api/email-templates/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
        res.json({ message: 'Modèle supprimé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la suppression du modèle', error: error.message });
    }
});

// Messages API
app.get('/api/messages', authenticateAdmin, async (req, res) => {
    try {
        const messages = await db.all('SELECT * FROM messages ORDER BY code ASC');
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des messages', error: error.message });
    }
});

app.get('/api/messages/code/:code', async (req, res) => {
    try {
        const message = await db.get('SELECT * FROM messages WHERE code = ?', [req.params.code]);
        res.json(message || { content: '' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération du message', error: error.message });
    }
});

app.post('/api/messages', authenticateAdmin, async (req, res) => {
    const { code, libelle, content } = req.body;
    try {
        await db.run('INSERT INTO messages (code, libelle, content) VALUES (?, ?, ?)', [code, libelle, content]);
        res.json({ message: 'Message créé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la création du message', error: error.message });
    }
});

app.put('/api/messages/:id', authenticateAdmin, async (req, res) => {
    const { code, libelle, content } = req.body;
    try {
        await db.run('UPDATE messages SET code = ?, libelle = ?, content = ? WHERE id = ?', [code, libelle, content, req.params.id]);
        res.json({ message: 'Message mis à jour avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la mise à jour du message', error: error.message });
    }
});

app.delete('/api/messages/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM messages WHERE id = ?', [req.params.id]);
        res.json({ message: 'Erreur lors de la suppression du message', error: error.message });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la suppression du message', error: error.message });
    }
});

// Access Requests API
app.get('/api/tiles-all', async (req, res) => {
    try {
        const tiles = await db.all('SELECT * FROM tiles ORDER BY sort_order ASC');

        // Charger les liens pour chaque tuile
        for (const tile of tiles) {
            tile.links = await db.all('SELECT * FROM tile_links WHERE tile_id = ? ORDER BY id', [tile.id]);
        }

        res.json(tiles);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des tuiles', error: error.message });
    }
});

app.post('/api/access-requests', async (req, res) => {
    const { username, requested_tiles } = req.body;
    if (!username) return res.status(400).json({ message: 'Username requis' });
    try {
        const user = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

        await db.run(
            'INSERT INTO access_requests (user_id, requested_tiles, status) VALUES (?, ?, ?)',
            [user.id, Array.isArray(requested_tiles) ? requested_tiles.join(',') : requested_tiles, 'pending']
        );
        res.json({ message: 'Demande d\'accès soumise avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la soumission de la demande', error: error.message });
    }
});

app.get('/api/admin/access-requests', authenticateAdmin, async (req, res) => {
    try {
        const requests = await db.all(`
            SELECT ar.*, u.username 
            FROM access_requests ar
            JOIN users u ON ar.user_id = u.id
            WHERE ar.status = 'pending'
            ORDER BY ar.created_at DESC
        `);
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des demandes', error: error.message });
    }
});

app.post('/api/admin/access-requests/:id/approve', authenticateAdmin, async (req, res) => {
    try {
        const request = await db.get('SELECT * FROM access_requests WHERE id = ?', [req.params.id]);
        if (!request) return res.status(404).json({ message: 'Demande non trouvée' });

        await db.run('UPDATE access_requests SET status = "approved" WHERE id = ?', [req.params.id]);
        await db.run('UPDATE users SET is_approved = 1 WHERE id = ?', [request.user_id]);

        // Grant access to the specifically requested tiles
        if (request.requested_tiles) {
            let parsed;
            try {
                parsed = JSON.parse(request.requested_tiles);
            } catch (e) {
                parsed = request.requested_tiles.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
            }
            const tileIds = Array.isArray(parsed) ? parsed : [parsed];
            for (const tileId of tileIds) {
                await db.run('INSERT OR IGNORE INTO user_tiles (user_id, tile_id) VALUES (?, ?)', [request.user_id, tileId]);
            }
        }

        res.json({ message: 'Demande approuvée et accès accordés' });
    } catch (error) {
        console.error('[ACCESS-REQUESTS] Approve error:', error);
        res.status(500).json({ message: 'Erreur lors de l\'approbation', error: error.message });
    }
});

app.post('/api/admin/access-requests/:id/reject', authenticateAdmin, async (req, res) => {
    try {
        await db.run('UPDATE access_requests SET status = "rejected" WHERE id = ?', [req.params.id]);
        res.json({ message: 'Demande rejetée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors du rejet', error: error.message });
    }
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
        res.status(500).json({ message: "Erreur lors de l'ajout", error: error.message });
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

// Telecom Routes
// Telecom Module
const telecomRouter = require('./modules/telecom/telecom.routes');
app.use('/api/telecom', telecomRouter);

// Column Settings API
app.get('/api/column-settings/:page', authenticateJWT, async (req, res) => {
    try {
        const page = req.params.page;
        let dbPage = page;
        if (page === 'lines') dbPage = 'budget_lines';

        let sourceTable = dbPage;
        let pragmaSql = `PRAGMA table_info(${sourceTable})`;
        if (page === 'orders') pragmaSql = `PRAGMA table_info(v_orders)`; // TEMP view
        if (page === 'invoices') pragmaSql = `PRAGMA table_info(v_invoices)`; // Use the new TEMP view
        if (page === 'tiers') pragmaSql = `PRAGMA gf.table_info(oracle_tiers)`;
        if (page === 'services') pragmaSql = `PRAGMA gf.table_info(oracle_servicefi)`;
        if (page === 'factures') pragmaSql = `PRAGMA gf.table_info(oracle_facture)`;
        if (page === 'rh_extract') pragmaSql = `PRAGMA rh.table_info(oracle_v_extract_dsi)`;
        if (page === 'rh') pragmaSql = `PRAGMA rh.table_info(referentiel_agents)`;

        // 1. Récupérer les colonnes réelles de la source
        let realCols = [];
        try {
            const info = await db.all(pragmaSql);
            realCols = info.map(c => c.name);
        } catch (e) { }

        // 2. NETTOYAGE STRICT : Supprimer tout ce qui n'est plus en base
        if (realCols.length > 0) {
            const placeholders = realCols.map(() => '?').join(',');
            // On garde les colonnes virtuelles vitales
            await db.run(`DELETE FROM column_settings WHERE page = ? AND column_key NOT IN (${placeholders}, 'operation_label', 'actions')`, [page, ...realCols]);

            // 3. Ajouter les nouvelles sans écraser les labels existants
            for (const col of realCols) {
                if (!['id', 'operation_id', 'budgetId', 'order_number', 'amount_ht', 'date'].includes(col)) {
                    await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, 1)', [page, col, col]);
                }
            }
        }

        const settings = await db.all('SELECT * FROM column_settings WHERE page = ? ORDER BY display_order ASC, id ASC', [page]);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching column settings', error: error.message });
    }
});

app.post('/api/column-settings/:page/bulk', authenticateJWT, async (req, res) => {
    const { page } = req.params;
    const settings = req.body;
    try {
        await db.run('BEGIN TRANSACTION');
        for (const col of settings) {
            await db.run(`
                UPDATE column_settings 
                SET label = ?, is_visible = ?, display_order = ?, color = ?, is_bold = ?, is_italic = ? 
                WHERE page = ? AND column_key = ?`,
                [col.label, col.is_visible, col.display_order, col.color, col.is_bold, col.is_italic, page, col.column_key]
            );
        }
        await db.run('COMMIT');
        res.json({ message: 'Settings updated' });
    } catch (error) {
        await db.run('ROLLBACK');
        res.status(500).json({ message: 'Error updating settings' });
    }
}); app.post('/api/column-settings/:page', authenticateAdminOrFinances, async (req, res) => {
    const { column_key, label, is_visible, display_order, color, is_bold, is_italic } = req.body;
    try {
        await db.run(
            `INSERT INTO column_settings (page, column_key, label, is_visible, display_order, color, is_bold, is_italic) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.params.page, column_key, label, is_visible, display_order, color, is_bold, is_italic]
        );
        res.json({ message: 'Setting saved' });
    } catch (error) {
        res.status(500).json({ message: 'Error saving setting' });
    }
});

app.post('/api/column-settings/:page/bulk', authenticateAdminOrFinances, async (req, res) => {
    const settings = req.body;
    const page = req.params.page;
    try {
        await db.run('BEGIN TRANSACTION');
        for (const s of settings) {
            await db.run(
                `UPDATE column_settings SET label = ?, is_visible = ?, display_order = ?, color = ?, is_bold = ?, is_italic = ? 
                 WHERE page = ? AND column_key = ?`,
                [s.label, s.is_visible, s.display_order, s.color, s.is_bold, s.is_italic, page, s.column_key]
            );
        }
        await db.run('COMMIT');
        res.json({ message: 'Settings updated' });
    } catch (error) {
        await db.run('ROLLBACK');
        res.status(500).json({ message: 'Error updating settings' });
    }
});

// Attachments API
app.get('/api/attachments/:type/:id', authenticateJWT, async (req, res) => {
    const { type, id } = req.params;
    try {
        const attachments = await db.all(
            'SELECT * FROM attachments WHERE target_type = ? AND target_id = ? ORDER BY uploaded_at DESC',
            [type, id]
        );
        res.json(attachments);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching attachments' });
    }
});

app.post('/api/attachments/upload', authenticateJWT, upload.single('file'), async (req, res) => {
    const { target_type, target_id } = req.body;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        // Normalisation du chemin pour la base de données (toujours avec des slashes /)
        let relativePath = req.file.path.replace(__dirname, '').replace(/\\/g, '/');
        if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);

        // Supprimer l'ancien fichier s'il existe (remplacement)
        const existing = await db.get('SELECT file_path FROM attachments WHERE target_type = ? AND target_id = ?', [target_type, target_id]);
        if (existing) {
            const oldPath = path.join(__dirname, existing.file_path);
            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (e) {
                    console.error('Failed to delete old attachment file:', e.message);
                }
            }
            await db.run('DELETE FROM attachments WHERE target_type = ? AND target_id = ?', [target_type, target_id]);
        }

        await db.run(
            'INSERT INTO attachments (target_type, target_id, file_path, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?, ?)',
            [target_type, target_id, relativePath, req.file.originalname, req.file.mimetype, req.file.size]
        );
        res.json({ message: 'Upload réussi' });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Error uploading attachment', error: error.message });
    }
});

app.get('/api/attachments/:id/recipients', authenticateJWT, async (req, res) => {
    try {
        const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
        if (!attachment) return res.status(404).json({ message: 'Pièce jointe non trouvée' });

        if (attachment.target_type !== 'order') {
            return res.status(400).json({ message: 'Seules les commandes peuvent être envoyées aux tiers' });
        }

        // Trouver le fournisseur associé à cette commande
        const order = await db.get('SELECT "Fournisseur" FROM v_orders WHERE "N° Commande" = ? LIMIT 1', [attachment.target_id]);
        if (!order || !order.Fournisseur) {
            return res.status(404).json({ message: 'Commande non trouvée ou fournisseur inconnu' });
        }

        const tierNom = order.Fournisseur.trim();

        // Trouver le tiers par son nom
        const tier = await db.get('SELECT id FROM tiers WHERE TRIM(UPPER(nom)) = TRIM(UPPER(?))', [tierNom]);
        if (!tier) {
            return res.status(404).json({ message: `Le tiers "${tierNom}" n'existe pas dans la base des tiers.` });
        }

        // Trouver les contacts destinataires
        const contacts = await db.all('SELECT * FROM contacts WHERE tier_id = ? AND is_order_recipient = 1', [tier.id]);
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching recipients', error: error.message });
    }
});

app.post('/api/attachments/:id/send-order', authenticateJWT, async (req, res) => {
    try {
        const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
        if (!attachment) return res.status(404).json({ message: 'Pièce jointe non trouvée' });

        const filePath = path.join(__dirname, attachment.file_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Fichier physique introuvable sur le serveur' });
        }

        // Trouver le fournisseur associé
        const order = await db.get('SELECT "Fournisseur" FROM v_orders WHERE "N° Commande" = ? LIMIT 1', [attachment.target_id]);
        if (!order || !order.Fournisseur) {
            return res.status(404).json({ message: 'Fournisseur introuvable' });
        }

        const tierNom = order.Fournisseur.trim();
        const tier = await db.get('SELECT id FROM tiers WHERE TRIM(UPPER(nom)) = TRIM(UPPER(?))', [tierNom]);
        if (!tier) return res.status(404).json({ message: 'Tiers introuvable' });

        const contacts = await db.all('SELECT * FROM contacts WHERE tier_id = ? AND is_order_recipient = 1', [tier.id]);
        const validEmails = contacts.map(c => c.email).filter(e => e && e.includes('@'));

        if (validEmails.length === 0) {
            return res.status(400).json({ message: 'Aucun email valide trouvé pour les destinataires' });
        }

        // Préparation du mail
        const s = await db.get('SELECT * FROM mail_settings WHERE id = 1');
        if (!s) throw new Error("Paramètres mail non configurés");

        const transporter = nodemailer.createTransport(
            new brevoTransport({ apiKey: s.smtp_pass })
        );

        const subject = `Bon de Commande Ivry - ${attachment.target_id}`;
        const content = `
            <p>Bonjour,</p>
            <p>Veuillez trouver ci-joint le bon de commande <strong>${attachment.target_id}</strong>.</p>
            <p>Cordialement,<br>${req.user.username}<br>DSI Ville d'Ivry-sur-Seine</p>
        `;
        const html = s.template_html.replace('{{content}}', content);

        await transporter.sendMail({
            from: `"${s.sender_name}" <${s.sender_email}>`,
            to: validEmails.join(', '),
            subject,
            html,
            attachments: [
                {
                    filename: attachment.original_name,
                    path: filePath
                }
            ]
        });

        res.json({ message: `Commande envoyée avec succès à ${validEmails.length} destinataire(s)` });
    } catch (error) {
        console.error('Send Order Error:', error);
        res.status(500).json({ message: "Erreur lors de l'envoi", error: error.message });
    }
});

app.delete('/api/attachments/:id', authenticateJWT, async (req, res) => {
    try {
        const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
        if (!attachment) return res.status(404).json({ message: 'Pièce jointe non trouvée' });

        const filePath = path.join(__dirname, attachment.file_path);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.error('Failed to delete attachment file:', e.message);
            }
        }

        await db.run('DELETE FROM attachments WHERE id = ?', [req.params.id]);
        res.json({ message: 'Pièce jointe supprimée' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting attachment', error: error.message });
    }
});

// Helper Mail
async function sendMail(to, subject, content) {
    const s = await db.get('SELECT * FROM mail_settings WHERE id = 1');
    if (!s) throw new Error("Paramètres mail non configurés");
    
    // Check if emails are globally disabled
    if (s.global_enable === 0 || s.global_enable === false) {
        console.log(`[MAIL SYSTEM] Envoi global désactivé. Mail ignoré pour: ${to}`);
        return { message: 'Envoi désactivé globalement' };
    }

    if (!s.sender_email) {
        throw new Error("L'adresse email de l'expéditeur n'est pas configurée (Paramètres > Mail)");
    }

    let htmlTemplate = (s.template_html || '{{content}}');
    let html = htmlTemplate.replace('{{content}}', content);

    const attachments = [];

    // Localhost replacer for backward compatibility
    if (html.includes('http://localhost:3001/img/logo_dsi.png')) {
        const logoPath = path.join(__dirname, 'magapp_img', 'logo_dsi.png');
        if (fs.existsSync(logoPath)) {
            const cid = 'logo_dsi';
            html = html.split('http://localhost:3001/img/logo_dsi.png').join(`cid:${cid}`);
            attachments.push({
                filename: 'logo_dsi.png',
                content: fs.readFileSync(logoPath).toString('base64'),
                cid: cid
            });
        }
    }

    // Dynamic Base64 extraction to CID - Robust regex for quotes
    const base64Regex = /src=["']data:(image\/[a-zA-Z+]*);base64,([^"']+)["']/g;
    let match;
    let imgCounter = 1;
    const matches = [];
    
    // Scan all base64 images
    while ((match = base64Regex.exec(html)) !== null) {
        matches.push({ full: match[0], mime: match[1], data: match[2] });
    }

    matches.forEach(m => {
        const ext = m.mime.split('/')[1] || 'png';
        const cid = `img_cid_${imgCounter}`;
        
        // Replace the whole src="..." attribute
        const newSrc = `src="cid:${cid}"`;
        html = html.split(m.full).join(newSrc);
        
        attachments.push({
            filename: `image_${imgCounter}.${ext}`,
            content: m.data,
            cid: cid
        });
        imgCounter++;
    });

    console.log(`[MAIL] Préparation envoi pour ${to}. Sujet: ${subject}. Pièces jointes: ${attachments.length}`);

    // Use API if explicitly requested OR fallback if SMTP is chosen but not fully configured
    if (s.use_api === 1 || s.use_api === true || (!s.smtp_host && (s.api_key || s.smtp_pass))) {
        let apiKey = (s.api_key || s.smtp_pass || '').trim();
        if (!apiKey) {
            throw new Error("Clé API Brevo manquante ou vide (Paramètres > Mail)");
        }
        
        const apiUrl = s.api_url || 'https://api.brevo.com/v3/smtp/email';
        
        const payload = {
            sender: { name: s.sender_name || 'DSI Hub', email: s.sender_email },
            to: [{ email: to }],
            subject: subject,
            htmlContent: html,
            attachment: attachments.map(a => ({
                content: a.content,
                name: a.filename,
                contentId: `<${a.cid}>` // Format standard avec chevrons pour Gmail
            }))
        };

        const config = {
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        // Optionnel : Gestion du proxy si configuré
        if (s.proxy_host) {
            config.proxy = {
                host: s.proxy_host,
                port: parseInt(s.proxy_port || 80),
                protocol: 'http'
            };
        }

        try {
            const response = await axios.post(apiUrl, payload, config);
            console.log(`[MAIL] Envoi API réussi pour ${to} (ID: ${response.data.messageId})`);
        } catch (error) {
            console.error('[MAIL] Erreur API Brevo:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.message || (error.response?.data?.code === 'unauthorized' ? 'Clé API invalide ou non reconnue par Brevo (401)' : error.message);
            throw new Error(`Échec de l'envoi API Brevo : ${errorMsg}`);
        }
    } else {
        // Use SMTP
        if (!s.smtp_host) throw new Error("Hôte SMTP non configuré et l'API n'est pas sélectionnée");
        
        console.log(`[MAIL] Envoi via SMTP: ${s.smtp_host}:${s.smtp_port} pour ${to}`);

        const transporterOptions = {
            host: s.smtp_host,
            port: s.smtp_port,
            secure: s.smtp_secure === 'ssl',
            auth: {
                user: s.smtp_user,
                pass: s.smtp_pass,
            },
            tls: { rejectUnauthorized: false }
        };

        // Note: Pour le proxy SMTP, il faudrait socks-proxy-agent. 
        // Ici on se concentre sur la validation standard d'abord.
        
        const transporter = nodemailer.createTransport(transporterOptions);

        const mailOptions = {
            from: `"${s.sender_name}" <${s.sender_email}>`,
            to,
            subject,
            html,
            attachments: attachments.map(a => ({
                filename: a.filename,
                content: Buffer.from(a.content, 'base64'),
                cid: a.cid // Nodemailer gère parfaitement le format MIME pour Gmail
            }))
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`[MAIL] Envoi SMTP réussi pour ${to}`);
        } catch (error) {
            console.error('[MAIL] Échec SMTP:', error.message);
            throw new Error(`Échec de l'envoi SMTP : ${error.message}`);
        }
    }
}


async function sendMaintenanceEmail(appId) {
    try {
        const app = await pgDb.get('SELECT * FROM magapp_apps WHERE id = ?', [appId]);
        if (!app) return;

        const subs = await pgDb.all('SELECT email FROM magapp_subscriptions WHERE app_id = ?', [appId]);
        if (subs.length === 0) return;

        const subject = `[DSI Hub] Maintenance en cours : ${app.name}`;
        const content = `
            <h2>Alerte Maintenance</h2>
            <p>L'application <strong>${app.name}</strong> est actuellement en maintenance.</p>
            <p><strong>Début :</strong> ${app.maintenance_start ? new Date(app.maintenance_start).toLocaleString('fr-FR') : 'Non spécifié'}</p>
            <p><strong>Fin estimée :</strong> ${app.maintenance_end ? new Date(app.maintenance_end).toLocaleString('fr-FR') : 'Non spécifié'}</p>
            <br>
            <p>Vous recevez ce mail car vous êtes abonné aux alertes pour cette application.</p>
        `;

        for (const sub of subs) {
            await sendMail(sub.email, subject, content);
        }
    } catch (error) {
        console.error('Error sending maintenance emails:', error);
    }
}

// =====================
// SCHEDULED SYNCS AUTOMATION
// =====================

const cron = require('node-cron');

pool.on('error', (err) => {
    console.error('[PG POOL] Erreur inattendue:', err.message);
});
pool.on('connect', () => {
    console.log('[PG POOL] Nouvelle connexion établie');
});

console.log('[SCHEDULED SYNC] Initialisation du cron...');
cron.schedule('* * * * *', () => {
    glpiController.processScheduledSyncs();
});
console.log('[SCHEDULED SYNC] Cron job enregistré');



// ============================================
// RENCONTRES BUDGÉTAIRES - Module
// ============================================
const { rencontresRouter, reunionRouter, directionsRouter, dirEmailsRouter } = require('./modules/rencontres/rencontres.routes');
const rencontresCtrl = require('./modules/rencontres/rencontres.controller');
const reunionsCtrl = require('./modules/rencontres/reunions.controller');
// Inject sendMail into reunions controller
reunionsCtrl.setSendMail(sendMail);

app.use('/api/rencontres-budgetaires', rencontresRouter);
app.use('/api/rencontres-reunions', reunionRouter);
app.use('/api/directions-services', directionsRouter);
app.use('/api/direction-emails', dirEmailsRouter);

// Backward-compatible flat routes (frontend uses these paths)
app.delete('/api/rencontres-participants/:id', authenticateJWT, rencontresCtrl.deleteParticipant);
app.put('/api/rencontres-suivi/:id', authenticateJWT, rencontresCtrl.updateSuivi);
app.delete('/api/rencontres-suivi/:id', authenticateJWT, rencontresCtrl.deleteSuivi);
app.delete('/api/reunion-participants/:id', authenticateJWT, reunionsCtrl.deleteParticipant);
app.delete('/api/reunion-attachments/:id', authenticateJWT, reunionsCtrl.deleteAttachment);

