const express = require('express');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Bypass SSL certificate verification globally

const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const setupDb = require('./db');
const { pgDb, pool, setupPgDb } = require('./pg_db');
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
function flattenLDAPEntry(entry) {
    if (!entry) return null;
    const pojo = entry.pojo;
    if (!pojo) return entry.object || entry;

    let rawDn = pojo.objectName || '';
    try {
        if (rawDn && typeof rawDn === 'string' && rawDn.includes('\\')) {
            rawDn = decodeLDAPString(rawDn);
        }
    } catch(e) {}

    const obj = { dn: rawDn };
    if (pojo.attributes && Array.isArray(pojo.attributes)) {
        pojo.attributes.forEach(attr => {
            let val = attr.values.length === 1 ? attr.values[0] : attr.values;
            // Décodage systématique des attributs texte
            if (['cn', 'displayName', 'memberOf', 'mail', 'title', 'department', 'sAMAccountName'].includes(attr.type)) {
                if (Array.isArray(val)) {
                    val = val.map(v => decodeLDAPString(v));
                } else {
                    val = decodeLDAPString(val);
                }
            }
            obj[attr.type] = val;
        });
    }
    return obj;
}

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
const folders = ['uploads', 'file_commandes', 'file_factures', 'file_certif', 'magapp_img', 'file_telecom', 'logs'];
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

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = 'votre_cle_secrete_ici'; // À changer en production

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

// Middleware to verify JWT
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Token manquant dans le header' });
        }

        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) {
                console.error(`[JWT ERROR] Verification failed for token: ${token.substring(0, 15)}... Error: ${err.message}`);
                return res.status(403).json({ message: 'Session expirée ou invalide' });
            }

            // Sécurité renforcée : Les admins sont TOUJOURS approuvés
            if (user.role === 'admin' || user.username?.toLowerCase() === 'admin' || user.username?.toLowerCase() === 'adminhub') {
                user.is_approved = 1;
            }

            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: 'Authentification requise (Pas de header Authorization)' });
    }
};

// Middleware for Admin only
const authenticateAdmin = (req, res, next) => {
    authenticateJWT(req, res, () => {
        // Sécurité de secours : Si le nom est 'admin', on laisse passer même si le rôle est erroné
        if (req.user && (req.user.role === 'admin' || req.user.username?.toLowerCase() === 'admin')) {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur uniquement' });
        }
    });
};

// Middleware for Internal (scheduled syncs) or Admin
const authenticateInternalOrAdmin = (req, res, next) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Internal ')) {
        const token = Buffer.from('scheduled-sync:internal').toString('base64');
        if (auth === `Internal ${token}`) {
            req.user = { username: 'scheduled-sync', role: 'admin' };
            return next();
        }
    }
    authenticateAdmin(req, res, next);
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

// Middleware for Admin or Magapp Control (users with the specific tile)
const authenticateMagappControl = (req, res, next) => {
    authenticateJWT(req, res, async () => {
        if (req.user && (req.user.role === 'admin' || req.user.username?.toLowerCase() === 'admin')) {
            return next();
        }
        
        try {
            if (req.user && req.user.id) {
                const authorized = await db.get(`
                    SELECT 1 FROM user_tiles ut 
                    JOIN tile_links tl ON ut.tile_id = tl.tile_id 
                    WHERE ut.user_id = ? AND tl.url = '/admin/magapp'
                `, [req.user.id]);
                
                if (authorized) {
                    return next();
                }
            }
        } catch (error) {
            console.error('[AUTH MAGAPP] Error checking tile access:', error);
        }
        
        res.status(403).json({ message: 'Accès refusé : administrateur ou accès Magasin d\'Apps requis' });
    });
};

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

app.post('/api/auth/magapp-login', async (req, res) => {
    let { username, password } = req.body;
    
    if (username) username = username.replace(/@ivry94\.fr$/i, '');

    if (!username || !password) {
        return res.status(400).json({ message: 'Login et mot de passe requis' });
    }

    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(503).json({ message: 'L\'authentification Active Directory est désactivée' });
        }

        // 1. Authentifier via AD
        const adUser = await authenticateAD(username, password, adSettings);

        if (!adUser) {
            return res.status(401).json({ message: 'Identifiants Active Directory incorrects' });
        }

        // 2. Vérifier si l'utilisateur existe dans PostgreSQL (MagApp base)
        let user = await pgDb.get('SELECT username, role, is_approved FROM users WHERE username = ?', [username.toLowerCase()]);

        if (!user) {
            // Création automatique de l'utilisateur s'il est OK AD mais absent de PG
            try {
                const isAdminAccount = username.toLowerCase() === 'admin' || username.toLowerCase() === 'adminhub';
                const role = isAdminAccount ? 'admin' : 'magapp';
                const isApproved = 1; // Tous les comptes AD vérifiés sont autorisés pour MagApp

                await pgDb.run(
                    'INSERT INTO users (username, role, is_approved, displayName, email) VALUES (?, ?, ?, ?, ?)',
                    [adUser.username.toLowerCase(), role, isApproved, adUser.displayName, adUser.email]
                );
                
                user = await pgDb.get('SELECT username, role, is_approved FROM users WHERE username = ?', [username.toLowerCase()]);
                console.log(`[AUTH PG] Nouvel utilisateur AD créé automatiquement dans PG: ${adUser.username} (Role: ${role})`);
            } catch (insertError) {
                console.error(`[AUTH PG] Erreur lors de la création auto de l'utilisateur ${username} dans PG:`, insertError);
            }
        }

        if (user) {
            // Mettre à jour les informations de l'utilisateur à chaque connexion
            try {
                const lastActivityDate = new Date().toISOString();
                await pgDb.run(
                    'UPDATE users SET last_activity = ?, displayname = ?, email = ? WHERE username = ?',
                    [lastActivityDate, adUser.displayName, adUser.email, username.toLowerCase()]
                );
            } catch (updateError) {
                console.error(`[AUTH PG] Erreur lors de la mise à jour de l'utilisateur ${username} dans PG:`, updateError);
            }

            // Pour MagApp, on utilise le username comme identifiant principal (PG uses username as PK)
            const accessToken = jwt.sign({
                username: user.username,
                role: user.role
            }, SECRET_KEY);

            return res.json({
                accessToken,
                user: {
                    username: user.username,
                    role: user.role,
                    displayName: adUser.displayName,
                    email: adUser.email
                }
            });
        }

        // Cas de secours
        res.json({
            user: {
                username: adUser.username,
                displayName: adUser.displayName,
                email: adUser.email,
                role: 'user'
            }
        });

    } catch (error) {
        console.error('Erreur login MagApp (PG):', error.message);
        res.status(500).json({ message: 'Erreur lors de l\'authentification (PG)', error: error.message });
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

// --- Studio RH Admin Routes ---

// Statistiques du référentiel agents
app.get('/api/admin/rh/stats', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().substring(0, 10);

        // Positions actives configurées
        const activePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
        let activePosSql = "";
        let activePosParams = [];
        if (activePosSetting && activePosSetting.setting_value) {
            const positions = JSON.parse(activePosSetting.setting_value);
            if (positions.length > 0) {
                activePosSql = ` AND POSITION_L IN (${positions.map(() => '?').join(',')})`;
                activePosParams = positions;
            }
        }

        const total = (await db.get("SELECT count(*) as c FROM rh.referentiel_agents")).c;
        const actif = (await db.get(`
            SELECT count(*) as c FROM rh.referentiel_agents 
            WHERE date_plusvu IS NULL 
            AND (DATE_DEPART IS NULL OR DATE_DEPART = "" OR DATE_DEPART > ?)
            ${activePosSql}
        `, [today, ...activePosParams])).c;

        const partiQuery = `
            SELECT count(*) as c FROM rh.referentiel_agents 
            WHERE date_plusvu IS NOT NULL 
            OR (DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART <= ?)
        `;
        const parti = (await db.get(partiQuery, [today])).c;

        const arriveeFuture = (await db.get(`
            SELECT count(*) as c FROM rh.referentiel_agents 
            WHERE DATE_ARRIVEE > ?
        `, [today])).c;

        const adLie = (await db.get(`
            SELECT count(*) as c FROM rh.referentiel_agents 
            WHERE ad_username IS NOT NULL AND ad_username != ''
            AND date_plusvu IS NULL 
            AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
        `, [today])).c;

        const adNonLie = Math.max(0, actif - adLie);

        res.json({ total, actif, parti, arriveeFuture, adLie, adNonLie });
    } catch (err) {
        console.error("Stats RH Error:", err);
        res.status(500).json({ message: 'Erreur stats', error: err.message });
    }
});

// Récupérer la hiérarchie des agents
app.get('/api/admin/rh/hierarchy', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().substring(0, 10);
        // On récupère tous les agents actifs avec leur hiérarchie
        const agents = await db.all(`
            SELECT DIRECTION_L, SERVICE_L, SECTEUR_L, MATRICULE, NOM, PRENOM, POSTE_L, date_plusvu, DATE_DEPART, DATE_ARRIVEE
            FROM rh.referentiel_agents 
            WHERE date_plusvu IS NULL 
            AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            ORDER BY DIRECTION_L, SERVICE_L, SECTEUR_L, NOM, PRENOM
        `, [today]);

        // Construction de l'objet hiérarchique (Rupture par DIRECTION_L -> SERVICE_L -> SECTEUR_L)
        const hierarchy = {};
        
        agents.forEach(agent => {
            const direction = agent.DIRECTION_L || 'SANS DIRECTION';
            const service = agent.SERVICE_L;
            const secteur = agent.SECTEUR_L;
            
            if (!hierarchy[direction]) hierarchy[direction] = { name: direction, count: 0, agents: [], services: {} };
            if (service && service.trim() !== '' && service !== 'SANS SERVICE') {
                if (!hierarchy[direction].services[service]) hierarchy[direction].services[service] = { name: service, count: 0, agents: [], secteurs: {} };
            }
            if (secteur && secteur.trim() !== '' && secteur !== 'SANS SECTEUR' && service) {
                if (!hierarchy[direction].services[service].secteurs[secteur]) hierarchy[direction].services[service].secteurs[secteur] = { name: secteur, count: 0, agents: [] };
            }
            
            hierarchy[direction].count++;
            if (!service || service.trim() === '' || service === 'SANS SERVICE') {
                hierarchy[direction].agents.push(agent);
            } else {
                hierarchy[direction].services[service].count++;
                if (!secteur || secteur.trim() === '' || secteur === 'SANS SECTEUR') {
                    hierarchy[direction].services[service].agents.push(agent);
                } else {
                    hierarchy[direction].services[service].secteurs[secteur].count++;
                    hierarchy[direction].services[service].secteurs[secteur].agents.push(agent);
                }
            }


        });

        // Conversion en tableau pour le frontend
        const result = Object.values(hierarchy).map(d => ({
            ...d,
            services: Object.values(d.services).map(s => ({
                ...s,
                secteurs: Object.values(s.secteurs)
            }))
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Erreur hiérarchie', error: err.message });
    }
});

// Récupérer les agents pour l'onboarding (arrivées futures et < 30j)
app.get('/api/admin/rh/onboarding', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().substring(0, 10);
        // Date il y a 30 jours
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 30);
        const limitDateStr = limitDate.toISOString().substring(0, 10);

        const agents = await db.all(`
            SELECT MATRICULE, NOM, PRENOM, SERVICE_L, DIRECTION_L, DATE_ARRIVEE, POSTE_L, ad_username, email, ad_account_enabled 
            FROM rh.referentiel_agents 
            WHERE DATE_ARRIVEE >= ? AND DATE_ARRIVEE != ''
            AND date_plusvu IS NULL
            ORDER BY DATE_ARRIVEE ASC
        `, [limitDateStr]);

        const result = {
            not_started: [],
            in_progress: [],
            completed: []
        };

        const now = new Date().getTime();

        agents.forEach(agent => {
            const arrivalTime = agent.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE).getTime() : 0;
            const daysSince = (now - arrivalTime) / (1000 * 3600 * 24);
            const isNouvOrProch = daysSince <= 30; // true for future dates (daysSince < 0) and up to 30 days past

            if (isNouvOrProch) {
                // Par défaut, dans "Non commencé" selon la demande
                result.not_started.push(agent);
            } else if (!agent.ad_username) {
                result.not_started.push(agent);
            } else if (!agent.email || agent.email === '') {
                result.in_progress.push(agent);
            } else {
                result.completed.push(agent);
            }
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Erreur onboarding', error: err.message });
    }
});

app.get('/api/admin/rh/alignments', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().substring(0, 10);
        const mappingsStr = req.query.mappings;
        let mappings = [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}];
        if (mappingsStr) {
            try { mappings = JSON.parse(mappingsStr); } catch (e) { console.error("Invalid mappings format"); }
        }

        // On récupère les agents avec un lien AD avec tous les champs pour supporter les mappings dynamiques
        const agents = await db.all(`
            SELECT * 
            FROM rh.referentiel_agents 
            WHERE ad_username IS NOT NULL AND ad_username != ''
            AND date_plusvu IS NULL 
            AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
        `, [today]);

        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) return res.status(400).json({ message: "AD non configuré" });

        const adAttributes = [...new Set(['sAMAccountName', ...mappings.map(m => m.adField)])];

        const allADUsers = await new Promise((resolve, reject) => {
            const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                if (err) { client.destroy(); return reject(err); }
                const users = new Map();
                const searchOptions = {
                    filter: '(objectClass=user)',
                    scope: 'sub',
                    attributes: adAttributes,
                    paged: true
                };
                client.search(adSettings.base_dn, searchOptions, (err, searchRes) => {
                    if (err) { client.destroy(); return reject(err); }
                    searchRes.on('searchEntry', (entry) => { 
                        const u = flattenLDAPEntry(entry);
                        if (u.sAMAccountName) users.set(u.sAMAccountName.toLowerCase(), u);
                    });
                    searchRes.on('end', () => { client.destroy(); resolve(users); });
                    searchRes.on('error', (err) => { client.destroy(); reject(err); });
                });
            });
        });

        const discrepancies = [];
        for (const agent of agents) {
            const sam = agent.ad_username.includes('\\') ? agent.ad_username.split('\\').pop().toLowerCase() : agent.ad_username.toLowerCase();
            const adUser = allADUsers.get(sam);
            if (adUser) {
                let hasDiscrepancy = false;
                const rhData = {};
                const adData = {};
                
                for (const m of mappings) {
                    const rhVal = agent[m.rhField] || '';
                    const adVal = adUser[m.adField] || '';
                    rhData[m.rhField] = rhVal;
                    adData[m.adField] = adVal;
                    // On compare en string simple
                    if (String(rhVal).trim() !== String(adVal).trim()) {
                        hasDiscrepancy = true;
                    }
                }

                if (hasDiscrepancy) {
                    discrepancies.push({
                        matricule: agent.MATRICULE,
                        nom: agent.NOM,
                        prenom: agent.PRENOM,
                        ad_username: agent.ad_username,
                        rh: rhData,
                        ad: adData,
                        mappings
                    });
                }
            }
        }

        res.json(discrepancies);
    } catch (err) {
        res.status(500).json({ message: 'Erreur alignements', error: err.message });
    }
});

app.post('/api/admin/rh/align-to-ad', authenticateAdmin, async (req, res) => {
    try {
        const { agents } = req.body; // Liste des agents { matricule, ad_username, service, direction }
        if (!agents || !Array.isArray(agents)) return res.status(400).json({ message: "Liste d'agents invalide" });

        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) return res.status(400).json({ message: "AD non configuré" });

        const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
        await new Promise((resolve, reject) => {
            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => err ? reject(err) : resolve());
        });

        const results = { success: 0, error: 0, details: [] };

        for (const agent of agents) {
            try {
                // On doit d'abord trouver le DN de l'utilisateur
                const sam = agent.ad_username.includes('\\') ? agent.ad_username.split('\\').pop() : agent.ad_username;
                const searchRes = await new Promise((resolve, reject) => {
                    client.search(adSettings.base_dn, { filter: `(sAMAccountName=${sam})`, scope: 'sub', attributes: ['dn'] }, (err, res) => {
                        if (err) return reject(err);
                        let dn = null;
                        res.on('searchEntry', (entry) => { dn = entry.objectName; });
                        res.on('end', () => resolve(dn));
                        res.on('error', reject);
                    });
                });

                if (!searchRes) throw new Error("Utilisateur AD non trouvé");

                const changes = [];
                for (const [adField, newValue] of Object.entries(agent.updates)) {
                    changes.push(new ldap.Change({ operation: 'replace', modification: { [adField]: newValue || '' } }));
                }

                if (changes.length > 0) {
                    await new Promise((resolve, reject) => {
                        client.modify(searchRes, changes, (err) => err ? reject(err) : resolve());
                    });
                }

                results.success++;
            } catch (err) {
                results.error++;
                results.details.push({ matricule: agent.matricule, error: err.message });
            }
        }

        client.destroy();
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Erreur mise à jour AD', error: err.message });
    }
});

// Récupérer les agents avec filtrage et pagination
app.get('/api/admin/rh/agents', authenticateAdmin, async (req, res) => {
    try {
        const { q, filter, management_level, page = 1, limit = 50 } = req.query;
        let whereClauses = [];
        let params = [];
        const today = new Date().toISOString().substring(0, 10);

        if (q && q.trim()) {
            const term = `%${q.trim()}%`;
            whereClauses.push("(NOM LIKE ? OR PRENOM LIKE ? OR MATRICULE LIKE ? OR ad_username LIKE ?)");
            params.push(term, term, term, term);
        }

        if (filter) {
            switch (filter) {
                case 'actif':
                    // Positions actives configurées
                    const activePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
                    if (activePosSetting && activePosSetting.setting_value) {
                        const positions = JSON.parse(activePosSetting.setting_value);
                        if (positions.length > 0) {
                            whereClauses.push(`POSITION_L IN (${positions.map(() => '?').join(',')})`);
                            params.push(...positions);
                        }
                    }
                    whereClauses.push("date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)");
                    params.push(today);
                    break;
                case 'non_actif':
                    // Positions actives configurées -> on prend l'inverse
                    const inactivePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
                    if (inactivePosSetting && inactivePosSetting.setting_value) {
                        const positions = JSON.parse(inactivePosSetting.setting_value);
                        if (positions.length > 0) {
                            whereClauses.push(`POSITION_L NOT IN (${positions.map(() => '?').join(',')})`);
                            params.push(...positions);
                        } else {
                            // Si vide, personne n'est "non actif" par ce critère
                            whereClauses.push("1=0");
                        }
                    } else {
                        // Pas de config -> personne n'est "non actif" (tous sont actifs par défaut si non partis)
                        whereClauses.push("1=0");
                    }
                    break;
                case 'parti':
                    whereClauses.push("(date_plusvu IS NOT NULL OR (DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART <= ?))");
                    params.push(today);
                    break;
                case 'future':
                    whereClauses.push("DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE != '' AND DATE_ARRIVEE > ?");
                    params.push(today);
                    break;
                case 'ad_linked':
                    whereClauses.push("ad_username IS NOT NULL AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)");
                    params.push(today);
                    break;
                case 'ad_unlinked':
                    whereClauses.push("ad_username IS NULL AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)");
                    params.push(today);
                    break;
                case 'arrivals':
                    whereClauses.push("DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE > ?");
                    params.push(today);
                    break;
                case 'departures':
                    whereClauses.push("(DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART >= ?)");
                    params.push(today);
                    break;
                case 'modified':
                    whereClauses.push("last_sync_modified = 1");
                    break;
            }
        }

        if (management_level) {
            switch (management_level) {
                case 'dg':
                    whereClauses.push("POSTE_L LIKE 'DIRECTEUR·TRICE GENERAL·E%'");
                    break;
                case 'dir':
                    whereClauses.push("POSTE_L LIKE 'DIRECTEUR·TRICE D%'");
                    break;
                case 'service':
                    whereClauses.push("POSTE_L LIKE 'RESPONSABLE DU SERVICE%'");
                    break;
                case 'secteur':
                    whereClauses.push("POSTE_L LIKE 'RESPONSABLE DU SECTEUR%'");
                    break;
            }
        }

        const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

        // Comptage total pour la pagination
        const countQuery = `SELECT count(*) as c FROM rh.referentiel_agents ${whereSql}`;
        const total = (await db.get(countQuery, params)).c;

        // Récupération des agents
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const agentsQuery = `
            SELECT *
            FROM rh.referentiel_agents
            ${whereSql}
            ORDER BY NOM ASC, PRENOM ASC 
            LIMIT ? OFFSET ?
        `;
        const agents = await db.all(agentsQuery, [...params, parseInt(limit), offset]);

        // Déterminer les positions actives pour le flag is_active_position
        const activePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
        const activePositions = activePosSetting && activePosSetting.setting_value ? JSON.parse(activePosSetting.setting_value) : [];
        const activePosSet = new Set(activePositions.map(p => String(p).toUpperCase()));

        // Ajouter les flags et calculs supplémentaires
        for (let agent of agents) {
            // Flag de position active : si rien n'est configuré, tout le monde est actif par défaut
            const agentPos = (agent.POSITION_L || '').trim().toUpperCase();
            agent.is_active_position = (activePositions.length === 0) || 
                                       (agentPos !== '' && activePosSet.has(agentPos));

            // Calculate subordinate counts for managers if management_level is requested
            if (management_level) {
                let countQuery = '';
                let countParams = [today];

                if (management_level === 'service' || management_level === 'secteur') {
                    if (agent.SERVICE_L) {
                        countQuery = `SELECT count(*) as c FROM rh.referentiel_agents WHERE SERVICE_L = ? AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`;
                        countParams.unshift(agent.SERVICE_L);
                    }
                } else if (management_level === 'dir' || management_level === 'dg') {
                    if (agent.DIRECTION_L) {
                        countQuery = `SELECT count(*) as c FROM rh.referentiel_agents WHERE DIRECTION_L = ? AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`;
                        countParams.unshift(agent.DIRECTION_L);
                    }
                }

                if (countQuery) {
                    const resCount = await db.get(countQuery, countParams);
                    agent.subordinate_count = resCount.c;
                } else {
                    agent.subordinate_count = 0;
                }
            }
        }

        res.json({ agents, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture agents', error: err.message });
    }
});

// Supprimer le lien AD d'un agent
app.delete('/api/admin/rh/agents/:matricule/ad-link', authenticateAdmin, async (req, res) => {
    try {
        const { matricule } = req.params;
        await db.run(
            `UPDATE rh.referentiel_agents 
             SET ad_username = NULL, ad_account_enabled = NULL, ad_last_logon = NULL, date_fin_association_ad = ?
             WHERE MATRICULE = ?`,
            [new Date().toISOString().substring(0, 10), matricule]
        );
        res.json({ message: `Lien AD supprimé pour ${matricule}` });
    } catch (err) {
        res.status(500).json({ message: 'Erreur suppression lien AD', error: err.message });
    }
});

// Récupérer toutes les positions distinctes
app.get('/api/admin/rh/positions', authenticateAdmin, async (req, res) => {
    try {
        const positions = await db.all('SELECT DISTINCT POSITION_L FROM rh.referentiel_agents WHERE POSITION_L IS NOT NULL AND POSITION_L != "" ORDER BY POSITION_L ASC');
        res.json(positions.map(p => p.POSITION_L));
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture positions', error: err.message });
    }
});

// Récupérer les positions actives paramétrées
app.get('/api/admin/rh/active-positions', authenticateAdmin, async (req, res) => {
    try {
        const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
        res.json(setting ? JSON.parse(setting.setting_value) : []);
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture positions actives', error: err.message });
    }
});

// Sauvegarder les positions actives
app.post('/api/admin/rh/active-positions', authenticateAdmin, async (req, res) => {
    try {
        const { positions } = req.body;
        await db.run("INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)",
            ['rh_active_positions', JSON.stringify(positions || []), 'Liste des positions POSITION_L considérées comme actives']);
        res.json({ message: 'Positions enregistrées' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur sauvegarde positions actives', error: err.message });
    }
});


app.get('/api/admin/rh/align-mappings', authenticateAdmin, async (req, res) => {
    try {
        const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_ad_align_mappings'");
        res.json(setting && setting.setting_value ? JSON.parse(setting.setting_value) : [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}]);
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture mappings', error: err.message });
    }
});

app.post('/api/admin/rh/align-mappings', authenticateAdmin, async (req, res) => {
    try {
        const { mappings } = req.body;
        await db.run("INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)",
            ['rh_ad_align_mappings', JSON.stringify(mappings || []), 'Paramétrage des champs RH/AD pour les alignements']);
        res.json({ message: 'Mappings enregistrés' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur sauvegarde mappings', error: err.message });
    }
});

// Synchronisation RH : Import complet (Upsert) et recherche AD
app.post('/api/admin/rh/sync', authenticateAdmin, async (req, res) => {
    const username = req.user?.username || 'system';
    console.log("[SYNC RH] Début de la synchronisation RH complète...");
    try {
        // 1. Découverte de la structure de V_EXTRACT_DSI
        const oracleColsInfo = await db.all("PRAGMA rh.table_info('V_EXTRACT_DSI')");
        if (!oracleColsInfo || oracleColsInfo.length === 0) {
            return res.status(500).json({ message: "La table source V_EXTRACT_DSI est introuvable." });
        }
        const oracleCols = oracleColsInfo.map(c => c.name);

        // 2. Création/Mise à jour de la table referentiel_agents
        const createCols = oracleCols.map(c => `"${c}" TEXT${c === 'MATRICULE' ? ' PRIMARY KEY' : ''}`).join(', ');
        await db.run(`
            CREATE TABLE IF NOT EXISTS rh.referentiel_agents (
                ${createCols}, 
                ad_username TEXT, 
                date_plusvu DATETIME,
                last_sync_modified INTEGER DEFAULT 0
            )
        `);

        // S'assurer que les colonnes ad_username et date_plusvu existent si la table existait déjà
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_username TEXT"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN date_plusvu DATETIME"); } catch (e) { }

        // S'assurer que toutes les colonnes Oracle existent dans le referentiel
        for (const col of oracleCols) {
            try { await db.run(`ALTER TABLE rh.referentiel_agents ADD COLUMN "${col}" TEXT`); } catch (e) { }
        }

        // Colonnes techniques supplémentaires
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN date_fin_association_ad DATETIME"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN azure_id TEXT"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN azure_license TEXT"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN azure_account_enabled INTEGER DEFAULT 1"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN last_sync_modified INTEGER DEFAULT 0"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_last_logon TEXT"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_account_enabled INTEGER DEFAULT 1"); } catch (e) { }

        // 3. Récupérer les données Oracle
        const extractData = await db.all("SELECT * FROM rh.V_EXTRACT_DSI");
        const extractMatricules = new Set(extractData.map(r => String(r.MATRICULE)));

        // 4. Statistiques de départ
        const beforeSyncCount = (await db.get("SELECT COUNT(*) as c FROM rh.referentiel_agents WHERE date_plusvu IS NULL")).c;
        const existingMatricules = new Set((await db.all("SELECT MATRICULE FROM rh.referentiel_agents")).map(r => String(r.MATRICULE)));

        // Réinitialiser les drapeaux de modification
        await db.run('UPDATE rh.referentiel_agents SET last_sync_modified = 0');

        // 5. UPSERT des données
        await db.run('BEGIN TRANSACTION');
        try {
            const placeholders = oracleCols.map(() => '?').join(',');
            const setCols = oracleCols.map(c => `"${c}"=excluded."${c}"`).join(',');

            const stmt = await db.prepare(`
                INSERT INTO rh.referentiel_agents (${oracleCols.map(c => `"${c}"`).join(', ')}, date_plusvu, last_sync_modified) 
                VALUES (${placeholders}, NULL, 0)
                ON CONFLICT(MATRICULE) DO UPDATE SET 
                ${setCols}, 
                last_sync_modified = CASE 
                    WHEN ${oracleCols.map(c => `COALESCE(rh.referentiel_agents."${c}", '') <> COALESCE(excluded."${c}", '')`).join(' OR ')} 
                    THEN 1 ELSE 0 END,
                date_plusvu=NULL
            `);

            for (const row of extractData) {
                // Determine the correct key casing from the row (SQLite can be inconsistent)
                const rowKeys = Object.keys(row);
                const values = oracleCols.map(c => {
                    const actualKey = rowKeys.find(k => k.toUpperCase() === c.toUpperCase());
                    let val = actualKey ? row[actualKey] : null;

                    // Standardize if it's a date
                    if (c.toUpperCase().includes('DATE')) {
                        val = parseOracleDate(val);
                    }
                    return val !== null ? String(val) : null;
                });
                await stmt.run(values);
            }
            await stmt.finalize();

            // 5. Marquer les agents disparus
            await db.run('UPDATE rh.referentiel_agents SET date_plusvu = CURRENT_TIMESTAMP WHERE date_plusvu IS NULL AND MATRICULE NOT IN (SELECT MATRICULE FROM rh.V_EXTRACT_DSI)');

            // 6. Correction forcée des dates mal formatées (migration rétroactive)
            const agentsToFix = await db.all('SELECT MATRICULE, DATE_ARRIVEE, DATE_DEPART FROM rh.referentiel_agents');
            for (const a of agentsToFix) {
                const newArrival = parseOracleDate(a.DATE_ARRIVEE);
                const newDepart = parseOracleDate(a.DATE_DEPART);
                if (newArrival !== a.DATE_ARRIVEE || newDepart !== a.DATE_DEPART) {
                    await db.run('UPDATE rh.referentiel_agents SET DATE_ARRIVEE = ?, DATE_DEPART = ? WHERE MATRICULE = ?', [newArrival, newDepart, a.MATRICULE]);
                }
            }

            await db.run('COMMIT');
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }

        // 6. Matching AD pour les actifs non liés
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        let matchedCount = 0;

        if (adSettings && adSettings.is_enabled) {
            console.log("[SYNC RH] Recherche de correspondances AD en cours...");
            const agentsADaLier = await db.all("SELECT MATRICULE, NOM, PRENOM FROM rh.referentiel_agents WHERE ad_username IS NULL AND DATE_DEPART IS NULL AND date_plusvu IS NULL");

            for (const rhA of agentsADaLier) {
                const matricule = String(rhA.MATRICULE || '').trim();
                const nom = rhA.NOM;
                const prenom = rhA.PRENOM;

                if (!matricule || !nom || !prenom) continue;
                try {
                    const adMatch = await searchADUserByName(nom, prenom, adSettings);
                    if (adMatch) {
                        await db.run('UPDATE rh.referentiel_agents SET ad_username = ? WHERE MATRICULE = ?', [adMatch.sAMAccountName, matricule]);
                        matchedCount++;
                    }
                } catch (adErr) {
                    console.error(`[SYNC RH] Erreur matching AD pour ${nom} ${prenom}:`, adErr.message);
                }
            }
        }

        // 7. Calcul des statistiques réelles
        // Nouveaux : matricules qui n'existaient pas au début
        const newAgentsCount = extractData.filter(r => {
            const m = String(r.MATRICULE || r.matricule || '').trim();
            return m && !existingMatricules.has(m);
        }).length;
        
        // Modifiés : ceux déjà existants dont last_sync_modified = 1
        const modifiedAgentsCount = (await db.get("SELECT COUNT(*) as c FROM rh.referentiel_agents WHERE last_sync_modified = 1")).c;
        
        // Départs : ceux qui ont été marqués date_plusvu dans cette synchro
        // (On compare le nombre d'actifs avant vs le nombre d'actifs maintenant)
        const afterSyncActiveCount = (await db.get("SELECT COUNT(*) as c FROM rh.referentiel_agents WHERE date_plusvu IS NULL")).c;
        const totalProcessedCount = extractData.length;
        
        const results = { 
            total: totalProcessedCount,
            new: newAgentsCount, 
            modified: modifiedAgentsCount, 
            departed: Math.max(0, beforeSyncCount + newAgentsCount - afterSyncActiveCount),
            matched_ad: matchedCount 
        };
        
        console.log(`[SYNC RH] Fin. Nouveaux: ${newAgentsCount}, Modifiés: ${modifiedAgentsCount}, Départs: ${results.departed}, AD liés: ${matchedCount}`);
        
        await db.run(
            'INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)',
            ['RH Oracle', 'success', `Sync RH terminée: +${newAgentsCount} nouveaux, ~${modifiedAgentsCount} modifiés, -${results.departed} départs`, JSON.stringify(results), username]
        );
        console.log(`[SYNC LOG] Succès pour RH Oracle`);

        res.json({
            message: 'Synchronisation complète terminée',
            stats: results
        });
    } catch (err) {
        console.error('[SYNC RH] Erreur fatale:', err);
        await db.run(
            'INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)',
            ['RH Oracle', 'error', `Erreur: ${err.message}`, null, username]
        );
        console.log(`[SYNC LOG] Erreur pour RH Oracle: ${err.message}`);
        res.status(500).json({ message: 'Erreur synchronisation', error: err.message });
    }
});

// Helper pour chercher un utilisateur AD par Nom/Prénom
async function searchADUserByName(nom, prenom, config) {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}` });
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { client.destroy(); return reject(err); }

            // Filtre : match sur nom ET prenom dans displayName ou cn
            const filter = `(&(objectClass=user)(|(displayName=*${nom}*${prenom}*)(displayName=*${prenom}*${nom}*)(cn=*${nom}*${prenom}*)(cn=*${prenom}*${nom}*)))`;
            client.search(config.base_dn, { filter, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn'] }, (err, searchRes) => {
                if (err) { client.destroy(); return reject(err); }
                let found = null;
                searchRes.on('searchEntry', (entry) => { found = flattenLDAPEntry(entry); });
                searchRes.on('end', () => { client.destroy(); resolve(found); });
                searchRes.on('error', (err) => { client.destroy(); reject(err); });
            });
        });
    });
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

// Fonction pour décoder l'UTF-8 LDAP (ex: \c3\a9)
function decodeLDAPString(str) {
    if (!str) return str;
    // Si c'est un buffer, on le convertit en string UTF-8
    if (Buffer.isBuffer(str)) return str.toString('utf8');
    if (typeof str !== 'string') return str;

    try {
        // LDAP escape \xx handling
        if (str.includes('\\')) {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                if (str[i] === '\\' && i + 2 < str.length && /[0-9a-fA-F]{2}/.test(str.substring(i + 1, i + 3))) {
                    bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
                    i += 2;
                } else {
                    bytes.push(str.charCodeAt(i));
                }
            }
            return Buffer.from(bytes).toString('utf8').normalize('NFC');
        }
        return str.normalize('NFC');
    } catch (e) {
        return str;
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
                const nom = (agentNom).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                const prenom = (agentPrenom).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
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
                        console.log(`[AD Sync] Compte AD '${agent.ad_username}' non trouvé dans l'index pour ${agentNom}`);
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

app.get('/api/admin/rh/ad-proposals', authenticateAdmin, async (req, res) => {
    try {
        await db.run('CREATE TABLE IF NOT EXISTS rh.ad_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, matricule TEXT, ad_username TEXT, score INTEGER, status TEXT DEFAULT "pending", date_creation DATETIME DEFAULT CURRENT_TIMESTAMP)');
        const proposals = await db.all(`
            SELECT p.*, a.NOM, a.PRENOM 
            FROM rh.ad_proposals p 
            JOIN rh.referentiel_agents a ON p.matricule = a.MATRICULE
        `);
        res.json(proposals);
    } catch (err) {
        console.error("Erreur lecture propositions:", err);
        res.status(500).json({ message: 'Erreur lecture propositions', error: err.message });
    }
});

app.post('/api/admin/rh/ad-proposals/action', authenticateAdmin, async (req, res) => {
    const { id, action } = req.body;
    try {
        const prop = await db.get('SELECT * FROM rh.ad_proposals WHERE id = ?', [id]);
        if (!prop) return res.status(404).json({ message: 'Proposition introuvable' });

        if (action === 'accept') {
            await db.run('UPDATE rh.referentiel_agents SET ad_username = ?, date_fin_association_ad = NULL WHERE MATRICULE = ?', [prop.ad_username, prop.matricule]);
        }
        await db.run('DELETE FROM rh.ad_proposals WHERE id = ?', [id]);
        res.json({ message: 'Action effectuée' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur action', error: err.message });
    }
});

// Lister les comptes AD qui n'ont pas d'association RH
app.get('/api/admin/rh/unlinked-ad', authenticateAdmin, async (req, res) => {
    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(503).json({ message: "AD non configuré" });
        }

        const allADUsers = await new Promise((resolve, reject) => {
            const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                if (err) { client.destroy(); return reject(err); }
                const users = [];
                client.search(adSettings.base_dn, {
                    filter: '(objectClass=user)',
                    paged: true,
                    scope: 'sub',
                    attributes: ['sAMAccountName', 'displayName', 'cn', 'mail']
                }, (err, searchRes) => {
                    if (err) { client.destroy(); return reject(err); }
                    searchRes.on('searchEntry', (entry) => { users.push(flattenLDAPEntry(entry)); });
                    searchRes.on('end', () => { client.destroy(); resolve(users); });
                    searchRes.on('error', (err) => { client.destroy(); reject(err); });
                });
            });
        });

        // 2. Récupérer les usernames déjà associés
        const associated = await db.all('SELECT ad_username FROM rh.referentiel_agents WHERE ad_username IS NOT NULL');
        const associatedSet = new Set(associated.map(a => a.ad_username ? a.ad_username.toLowerCase() : ''));

        // 3. Filtrer
        const unlinked = allADUsers.filter(u => u.sAMAccountName && !associatedSet.has(u.sAMAccountName.toLowerCase()));

        res.json(unlinked);
    } catch (err) {
        res.status(500).json({ message: 'Erreur recherche AD', error: err.message });
    }
});

// Association manuelle
app.post('/api/admin/rh/associate', authenticateAdmin, async (req, res) => {
    const { matricule, ad_username } = req.body;
    if (!matricule) return res.status(400).json({ message: 'Matricule manquant' });
    try {
        // Sécurité : S'assurer que les colonnes existent
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN date_fin_association_ad DATETIME"); } catch (e) { }
        try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_username TEXT"); } catch (e) { }

        if (!ad_username) {
            // Désassocier
            await db.run('UPDATE rh.referentiel_agents SET ad_username = NULL, date_fin_association_ad = NULL WHERE MATRICULE = ?', [matricule]);
        } else {
            // Associer
            await db.run('UPDATE rh.referentiel_agents SET ad_username = ?, date_fin_association_ad = NULL WHERE MATRICULE = ?', [ad_username, matricule]);
        }
        res.json({ message: 'Association mise à jour' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur association', error: err.message });
    }
});

// Recherche manuelle dans l'AD pour association
app.get('/api/admin/rh/ad-search', authenticateAdmin, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(503).json({ message: "AD non configuré" });
        }

        const results = await new Promise((resolve, reject) => {
            const client = ldap.createClient({
                url: `ldap://${adSettings.host}:${adSettings.port}`,
                connectTimeout: 5000,
                timeout: 5000
            });
            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                if (err) { client.destroy(); return reject(err); }

                const users = [];
                const searchOptions = {
                    filter: `(&(objectClass=user)(|(sAMAccountName=*${q}*)(cn=*${q}*)(displayName=*${q}*)(mail=*${q}*)))`,
                    scope: 'sub',
                    attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'title', 'department'],
                    sizeLimit: 20
                };

                client.search(adSettings.base_dn, searchOptions, (err, searchRes) => {
                    if (err) { client.destroy(); return reject(err); }
                    searchRes.on('searchEntry', (entry) => { users.push(flattenLDAPEntry(entry)); });
                    searchRes.on('end', () => { client.destroy(); resolve(users); });
                    searchRes.on('error', (err) => { client.destroy(); reject(err); });
                });
            });
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Erreur recherche AD', error: err.message });
    }
});

// Détails complets d'un agent (RH + AD + Azure)
app.get('/api/admin/rh/agent-details/:matricule', authenticateAdmin, async (req, res) => {
    const { matricule } = req.params;
    try {
        // 1. Infos RH
        const agent = await db.get('SELECT * FROM rh.referentiel_agents WHERE MATRICULE = ?', [matricule]);
        if (!agent) return res.status(404).json({ message: 'Agent introuvable' });

        const details = {
            rh: agent,
            ad: null,
            azure: null
        };

        // 2. Infos AD
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (agent.ad_username && adSettings && adSettings.is_enabled) {
            try {
                details.ad = await new Promise((resolve, reject) => {
                    const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                    client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                        if (err) { client.destroy(); return resolve(null); }
                        client.search(adSettings.base_dn, {
                            filter: `(sAMAccountName=${agent.ad_username})`,
                            scope: 'sub',
                            attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'userAccountControl', 'employeeID', 'description', 'lastLogonTimestamp']
                        }, (err, searchRes) => {
                            if (err) { client.destroy(); return resolve(null); }
                            let found = null;
                            searchRes.on('searchEntry', (entry) => {
                                found = flattenLDAPEntry(entry);
                                if (found.lastLogonTimestamp) {
                                    try {
                                        const ts = parseInt(found.lastLogonTimestamp);
                                        if (ts > 0) {
                                            found.lastLogonFormatted = new Date((ts / 10000) - 11644473600000).toLocaleString();
                                        }
                                    } catch (e) { }
                                }
                            });
                            searchRes.on('end', () => { client.destroy(); resolve(found); });
                            searchRes.on('error', () => { client.destroy(); resolve(null); });
                        });
                    });
                });
            } catch (e) { console.error("Error fetching AD details:", e); }
        }

        // 3. Infos Azure
        const azureSettings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
        if (azureSettings && azureSettings.is_enabled) {
            try {
                // Liaison par mail (priorité AD mail, sinon RH mail)
                const email = details.ad?.mail || agent.MAIL || agent.EMAIL;

                if (email) {
                    const tokenRes = await axios.post(`https://login.microsoftonline.com/${azureSettings.tenant_id}/oauth2/v2.0/token`,
                        new URLSearchParams({
                            client_id: azureSettings.client_id,
                            client_secret: azureSettings.client_secret,
                            grant_type: 'client_credentials',
                            scope: 'https://graph.microsoft.com/.default'
                        }).toString(),
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                    const accessToken = tokenRes.data.access_token;

                    const azureRes = await axios.get(
                        `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${email}' or userPrincipalName eq '${email}'&$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled,userType,createdDateTime,onPremisesSyncEnabled,usageLocation,proxyAddresses`,
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    );

                    if (azureRes.data.value && azureRes.data.value.length > 0) {
                        details.azure = azureRes.data.value[0];

                        // 4. Récupérer les licences (Azure ID requis)
                        try {
                            const licenseRes = await axios.get(`https://graph.microsoft.com/v1.0/users/${details.azure.id}/licenseDetails`, {
                                headers: { Authorization: `Bearer ${accessToken}` }
                            });
                            details.azure.licenses = licenseRes.data.value.map(l => l.skuPartNumber);
                        } catch (le) {
                            console.error("Error fetching Azure licenses:", le.response?.data || le.message);
                            details.azure.licenses = ["Erreur ou Permissions insuffisantes"];
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching Azure details:", e.response?.data || e.message);
            }
        }

        res.json(details);
    } catch (err) {
        res.status(500).json({ message: 'Erreur détails agent', error: err.message });
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

// GLPI Settings API
app.get('/api/glpi-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        res.json(settings || { url: '', app_token: '', user_token: '', is_enabled: 0 });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres GLPI' });
    }
});

app.post('/api/glpi-settings', authenticateAdmin, async (req, res) => {
    const { url, app_token, user_token, login, password, is_enabled } = req.body;
    try {
        const exists = await db.get('SELECT id FROM glpi_settings WHERE id = 1');
        if (exists) {
            await db.run(
                'UPDATE glpi_settings SET url = ?, app_token = ?, user_token = ?, login = ?, password = ?, is_enabled = ? WHERE id = 1',
                [url, app_token, user_token, login, password, is_enabled ? 1 : 0]
            );
        } else {
            await db.run(
                'INSERT INTO glpi_settings (id, url, app_token, user_token, login, password, is_enabled) VALUES (1, ?, ?, ?, ?, ?, ?)',
                [url, app_token, user_token, login, password, is_enabled ? 1 : 0]
            );
        }
        res.json({ message: 'Paramètres GLPI enregistrés' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur enregistrement paramètres GLPI' });
    }
});

app.post('/api/glpi/test-connection', authenticateAdmin, async (req, res) => {
    let { url, app_token, user_token, login, password } = req.body;
    try {
        url = (url || '').trim();
        app_token = (app_token || '').trim();
        user_token = (user_token || '').trim();
        login = (login || '').trim();
        password = (password || '').trim();

        if (url && !url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Définition de l'auth
        let authHeader = '';
        if (login && password) {
            authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
        } else {
            authHeader = `user_token ${user_token}`;
        }

        const response = await axios.get(`${url}/initSession`, {
            headers: {
                ...commonHeaders,
                'Authorization': authHeader
            },
            timeout: 10000
        });

        if (response.data && response.data.session_token) {
            await axios.get(`${url}/killSession`, {
                headers: {
                    ...commonHeaders,
                    'Session-Token': response.data.session_token
                }
            });
            res.json({ success: true, message: 'Connexion GLPI réussie !' });
        } else {
            res.status(400).json({ success: false, message: 'Réponse invalide de GLPI' });
        }
    } catch (error) {
        console.error('GLPI Test Error:', error.message);
        const msg = error.response?.data?.[1] || error.response?.data?.message || error.message;
        res.status(500).json({ success: false, message: `Erreur de connexion : ${msg}` });
    }
});

app.get('/api/glpi/tickets-count', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            return res.status(400).json({ message: 'Paramètres GLPI non configurés' });
        }

        let url = settings.url.trim();
        let app_token = (settings.app_token || '').trim();
        let user_token = (settings.user_token || '').trim();
        let login = (settings.login || '').trim();
        let password = (settings.password || '').trim();

        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Définition de l'auth
        let authHeader = '';
        if (login && password) {
            authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
        } else {
            authHeader = `user_token ${user_token}`;
        }

        // Log de diagnostic (masqué)
        console.log(`[GLPI] Tentative d'initSession sur ${url}`);

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: {
                ...commonHeaders,
                'Authorization': authHeader
            },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) {
            console.log('[GLPI] ÉCHEC: Pas de sessionToken récupéré.');
            return res.status(401).json({ message: 'Impossible d\'initier la session GLPI.' });
        }

        // --- ÉTAPE CRUCIALE POUR GLPI 9.4 + PLUGINS ---
        // On "active" la session en appelant ces deux endpoints, sinon la recherche redirige vers du HTML.
        console.log('[GLPI] Activation de la session (Profiles & FullSession)...');
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        // Recherche élargie (sans filtres)
        // On passe tout dans l'URL pour être certain que GLPI 9.4 intercepte bien le token.
        const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`;

        console.log(`[GLPI] Appel recherche : ${searchUrl}`);

        const ticketsRes = await axios.get(searchUrl, {
            headers: commonHeaders
        });

        let count = 0;
        if (ticketsRes.data && ticketsRes.data.totalcount !== undefined) {
            count = parseInt(ticketsRes.data.totalcount, 10) || 0;
            console.log(`[GLPI] Succès ! Compte final : ${count}`);
        } else {
            console.log('[GLPI] totalcount toujours absent.');
            const contentRange = ticketsRes.headers['content-range'];
            if (contentRange) {
                const total = contentRange.split('/')[1];
                count = parseInt(total, 10) || 0;
            }
        }

        await axios.get(`${url}/killSession`, {
            headers: {
                ...commonHeaders,
                'Session-Token': sessionToken
            }
        });

        res.json({ count });
    } catch (error) {
        const msg = error.response?.data?.[1] || error.response?.data?.message || error.message;
        res.status(500).json({ message: `Erreur GLPI : ${msg}` });
    }
});

// Route : Récupérer les 5 derniers tickets
app.get('/api/glpi/recent-tickets', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        let app_token = (settings.app_token || '').trim();
        let user_token = (settings.user_token || '').trim();
        let login = (settings.login || '').trim();
        let password = (settings.password || '').trim();

        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = login && password
            ? `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
            : `user_token ${user_token}`;

        // 1. Init Session
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        // 2. Activation Session (Crucial pour GLPI 9.4)
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        // 3. Recherche des 5 derniers (Tri par ID Desc)
        const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-5&sort=1&order=DESC&get_all_entities=1`;
        const ticketsRes = await axios.get(searchUrl, { headers: commonHeaders });

        let tickets = [];
        if (ticketsRes.data && Array.isArray(ticketsRes.data.data)) {
            // Dans GLPI Search, l'ID est souvent le champ 2, le titre le champ 1
            tickets = ticketsRes.data.data.map(t => ({
                id: t[2],
                title: t[1],
                date: t[19] || t[15] // Date modification ou création selon les champs dispos
            }));
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
        res.json({ tickets });
    } catch (error) {
        console.error('[GLPI] Erreur tickets récents:', error.message);
        res.status(500).json({ message: 'Erreur lors de la récupération des tickets récents' });
    }
});

// Route : Récupérer les tickets d'un utilisateur (créés + observés)
app.get('/api/glpi/user-tickets/:username', authenticateJWT, async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) return res.status(400).json({ message: 'Username requis' });

        // Récupérer l'utilisateur pour vérifier qu'il existe
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

        // Déterminer l'email de l'utilisateur pour recherche
        // Format standard : prenom.nom@ivry94.fr ou username@ivry94.fr
        const userEmail = `${username}@ivry94.fr`;

        // 1. Tickets créés par l'utilisateur (par email)
        const createdTickets = await db.all(
            `SELECT id, glpi_id, title, status, priority, urgency, date_creation,
                    date_mod, requester_name, requester_email, 'created' as ticket_type
             FROM tickets
             WHERE LOWER(requester_email) = LOWER(?)
             ORDER BY date_mod DESC`,
            [userEmail]
        );

         // 2. Tickets observés par l'utilisateur (join avec glpi.observers)
        const observedTickets = await pgDb.all(
            `SELECT t.id, t.glpi_id, t.title, t.status, t.priority, t.urgency,
                    t.date_creation, t.date_mod, t.requester_name, t.requester_email, 'observed' as ticket_type
             FROM tickets t
             INNER JOIN glpi.observers go ON t.glpi_id = go.ticket_id
             WHERE LOWER(go.login) = LOWER($1) OR LOWER(go.email) = LOWER($2)
             ORDER BY t.date_mod DESC`,
            [username, userEmail]
        );

        // Combiner et dédupliquer (un ticket peut être créé ET observé)
        const allTickets = [...createdTickets];
        const createdIds = new Set(createdTickets.map(t => t.glpi_id));

        for (const ticket of observedTickets) {
            if (!createdIds.has(ticket.glpi_id)) {
                allTickets.push(ticket);
            } else {
                // Si le ticket est à la fois créé et observé, mettre à jour le type
                const idx = allTickets.findIndex(t => t.glpi_id === ticket.glpi_id);
                if (idx >= 0) {
                    allTickets[idx].ticket_type = 'created_and_observed';
                }
            }
        }

        res.json({
            username,
            userEmail,
            total: allTickets.length,
            created_count: createdTickets.length,
            observed_count: observedTickets.filter(t => !createdIds.has(t.glpi_id)).length,
            tickets: allTickets
        });

    } catch (error) {
        console.error('[GLPI] Erreur user-tickets:', error.message);
        res.status(500).json({ message: 'Erreur lors de la récupération des tickets utilisateur' });
    }
});

// État global pour le suivi de la synchronisation GLPI
let glpiSyncProgress = {
    active: false,
    processed: 0,
    total: 0,
    startTime: null,
    lastUpdate: null,
    type: null
};

let glpiSyncCancelled = false;

let observersSyncProgress = {
    active: false,
    processed: 0,
    total: 0,
    startTime: null,
    lastUpdate: null
};

// Route : Statut de la synchronisation GLPI
app.get('/api/glpi/sync-status', authenticateAdmin, (req, res) => {
    res.json(glpiSyncProgress);
});

// Route : Annuler la synchronisation GLPI
app.post('/api/glpi/sync-cancel', authenticateAdmin, (req, res) => {
    console.log('[GLPI Cancel] Demande d\'annulation reçue');
    glpiSyncCancelled = true;
    res.json({ success: true, message: 'Annulation demandée' });
});

// Route : Statut de la synchronisation des observateurs
app.get('/api/glpi/sync-observers-status', authenticateAdmin, (req, res) => {
    res.json(observersSyncProgress);
});

// Route : Annuler la synchronisation des observateurs
app.post('/api/glpi/sync-observers-cancel', authenticateAdmin, (req, res) => {
    console.log('[GLPI Observers Cancel] Demande d\'annulation reçue');
    observersSyncCancelled = true;
    res.json({ success: true, message: 'Annulation demandée' });
});

// Route : Synchroniser les 500 derniers tickets GLPI
app.post('/api/glpi/sync-recent', authenticateInternalOrAdmin, async (req, res) => {
    console.log('[GLPI Sync] POST /api/glpi/sync-recent reçu');
    const triggeredBy = req.user?.username || 'admin';
    let syncLogId = null;
    
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        let app_token = (settings.app_token || '').trim();
        let user_token = (settings.user_token || '').trim();
        let login = (settings.login || '').trim();
        let password = (settings.password || '').trim();

        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = { 'App-Token': app_token, 'Content-Type': 'application/json', 'Accept': 'application/json' };
        let authHeader = login && password
            ? `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
            : `user_token ${user_token}`;

        // Init session
        const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        // Activer la session avec getMyProfiles et getFullSession
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        // Synchroniser les statuts GLPI
        const statuses = [
            { id: 1, label: 'Nouveau' },
            { id: 2, label: 'En cours (Attribué)' },
            { id: 3, label: 'En cours (Planifié)' },
            { id: 4, label: 'En attente' },
            { id: 5, label: 'Résolu' },
            { id: 6, label: 'Clos' }
        ];
        for (const status of statuses) {
            await pgDb.run(`INSERT INTO glpi.ticket_status (id, label) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`, [status.id, status.label]);
        }

        // Récupérer les 50 derniers tickets
        const batchSize = 50;
        const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
        const forcedStr = forcedFields.map((id) => `forcedisplay[${id}]=${id}`).join('&');
        const totalToFetch = 50;

        // Obtenir le count total pour savoir combien récupérer
        const countRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
        const totalAvailable = parseInt(countRes.data.totalcount, 10) || 0;
        const startOffset = Math.max(0, totalAvailable - totalToFetch);

        // Créer le log AVANT de traiter les données
        const logResult = await pool.query(
            `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            ['tickets', 'recent', triggeredBy, 'running', Math.min(totalToFetch, totalAvailable)]
        );
        syncLogId = logResult.rows[0]?.id;

        const val = (t, index) => {
            const v = t[index];
            if (v === undefined || v === null) return '';
            if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
            return String(v);
        };

        const valInt = (t, index) => {
            const v = t[index];
            if (v === undefined || v === null) return 0;
            if (typeof v === 'object' && v !== null) {
                if (v.id !== undefined && v.id !== null) return Number(v.id) || 0;
                return Number(v.name) || 0;
            }
            const num = parseInt(String(v), 10);
            return isNaN(num) ? 0 : num;
        };

        const normalizeEmail = (email) => {
            if (!email || typeof email !== 'string') return '';
            email = email.trim().toLowerCase();
            if (!email) return '';
            if (!email.includes('@')) email += '@ivry94.fr';
            return email;
        };

        // Helper pour insertion lot PostgreSQL
        const insertBatchToPg = async (tickets) => {
            if (tickets.length === 0) return;
            const cols = 'glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22';
            const values = tickets.map((t, i) => {
                const base = i * 20;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20})`;
            }).join(', ');
            const params = tickets.flatMap(t => [t.glpi_id, t.title, t.content || '', t.status, t.priority, t.urgency, t.impact, t.category, t.type, t.date_creation, t.date_mod, t.date_closed, t.date_solved, t.location, t.solution, t.source, t.entity, t.requester_name, t.email_alt, t.requester_email_22]);
            await pool.query(`INSERT INTO glpi.tickets (${cols}) VALUES ${values} ON CONFLICT (glpi_id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status, priority = EXCLUDED.priority, urgency = EXCLUDED.urgency, impact = EXCLUDED.impact, category = EXCLUDED.category, type = EXCLUDED.type, date_creation = EXCLUDED.date_creation, date_mod = EXCLUDED.date_mod, date_closed = EXCLUDED.date_closed, date_solved = EXCLUDED.date_solved, location = EXCLUDED.location, solution = EXCLUDED.solution, source = EXCLUDED.source, entity = EXCLUDED.entity, requester_name = EXCLUDED.requester_name, email_alt = EXCLUDED.email_alt, requester_email_22 = EXCLUDED.requester_email_22, last_sync = CURRENT_TIMESTAMP`, params);
        };

        let processedCount = 0;
        let allTickets = [];

        // Récupérer par lots de 500
        for (let start = startOffset; start < totalAvailable; start += batchSize) {
            const end = Math.min(start + batchSize, totalAvailable);
            console.log(`[GLPI Sync] Récupération tickets ${start}-${end - 1}...`);
            const ticketsRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=${start}-${end - 1}&get_all_entities=1&${forcedStr}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

            if (ticketsRes.data && Array.isArray(ticketsRes.data.data)) {
                for (const t of ticketsRes.data.data) {
                    const ticketId = valInt(t, 2);
                    if (!ticketId) continue;
                    const email34 = normalizeEmail(val(t, 34));
                    const email22 = normalizeEmail(val(t, 22));

                    allTickets.push({
                        glpi_id: ticketId, title: val(t, 1), content: val(t, 62), status: valInt(t, 12), priority: valInt(t, 3),
                        urgency: valInt(t, 10), impact: valInt(t, 11), category: val(t, 7), type: val(t, 14),
                        date_creation: val(t, 15), date_mod: val(t, 19) || val(t, 15), date_closed: val(t, 16) || null,
                        date_solved: val(t, 17) || null, location: val(t, 83), solution: val(t, 24), source: val(t, 9),
                        entity: val(t, 80), requester_name: val(t, 4) || 'Inconnu', email_alt: email34, requester_email_22: email22
                    });
                }
            }
        }

        // Insertion en lot PostgreSQL
        await insertBatchToPg(allTickets);
        processedCount = allTickets.length;

        // Mettre à jour le log en succès
        if (syncLogId) {
            await pool.query(
                `UPDATE glpi.sync_logs SET status = $1, processed_tickets = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3`,
                ['completed', processedCount, syncLogId]
            );
        }

        console.log(`[GLPI Sync] Synchronisation terminée : ${processedCount} tickets synchronisés via batch.`);
        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
        res.json({ success: true, count: processedCount, total: totalAvailable });
    } catch (error) {
        console.error('[GLPI] Erreur sync recent:', error.message);
        // Mettre à jour le log en erreur
        if (syncLogId) {
            try {
                await pool.query(
                    `UPDATE glpi.sync_logs SET status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3`,
                    ['error', error.message, syncLogId]
                );
            } catch (e) {
                console.error('[GLPI] Erreur mise à jour log:', e.message);
            }
        }
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Route : Lister les logs de synchronisation
app.get('/api/glpi/sync-logs', authenticateAdmin, async (req, res) => {
    try {
        const { type, status, date_from, date_to } = req.query;
        let sql = 'SELECT * FROM glpi.sync_logs WHERE 1=1';
        const params = [];
        let idx = 1;
        if (type) { sql += ` AND sync_type = $${idx++}`; params.push(type); }
        if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
        if (date_from) { sql += ` AND started_at >= $${idx++}`; params.push(date_from); }
        if (date_to) { sql += ` AND started_at <= $${idx++}`; params.push(date_to + ' 23:59:59'); }
        sql += ' ORDER BY started_at DESC LIMIT 500';
        const logs = await pgDb.all(sql, params);
        res.json(logs);
    } catch (error) {
        console.error('[GLPI] Erreur logs:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

let observersSyncCancelled = false;

// Route : Créer un ticket GLPI
app.post('/api/glpi/tickets', authenticateJWT, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const { title, content, type, urgency, priority, category_id, requester_email } = req.body;
        if (!title) return res.status(400).json({ message: 'Titre requis' });

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        const ticketData = {
            input: {
                name: title,
                content: content || title,
                type: type || 1,
                urgency: urgency || 3,
                priority: priority || 3,
                itilcategories_id: category_id || 0
            }
        };

        const createRes = await axios.post(`${url}/Ticket`, ticketData, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken },
            timeout: 15000
        });

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        res.json({ success: true, ticket: createRes.data });

        // Déclencher une synchro des 50 derniers tickets en arrière-plan vers PostgreSQL
        console.log(`[GLPI] Ticket créé, déclenchement sync recent...`);
        setTimeout(async () => {
            try {
                const recentSettings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
                if (!recentSettings || !recentSettings.url) return;

                let recentUrl = recentSettings.url.trim();
                if (!recentUrl.includes('apirest.php')) {
                    recentUrl = recentUrl.endsWith('/') ? `${recentUrl}apirest.php` : `${recentUrl}/apirest.php`;
                }

                const recentHeaders = { 'App-Token': (recentSettings.app_token || '').trim(), 'Content-Type': 'application/json' };
                let recentAuth = (recentSettings.user_token || '').trim()
                    ? `user_token ${(recentSettings.user_token || '').trim()}`
                    : `Basic ${Buffer.from(`${(recentSettings.login || '').trim()}:${(recentSettings.password || '').trim()}`).toString('base64')}`;

                // Créer un log pour la sync auto
                const logResult = await pool.query(
                    `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    ['tickets', 'auto', 'magapp-user', 'running', 50]
                );
                const autoLogId = logResult.rows[0]?.id;

                const session = await axios.get(`${recentUrl}/initSession`, { headers: { ...recentHeaders, 'Authorization': recentAuth } });
                const sToken = session.data?.session_token;
                if (!sToken) return;

                // Activer la session
                await axios.get(`${recentUrl}/getMyProfiles?session_token=${sToken}`, { headers: recentHeaders });
                await axios.get(`${recentUrl}/getFullSession?session_token=${sToken}`, { headers: recentHeaders });

                // Récupérer les 500 derniers tickets par lots
                const fields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
                const str = fields.map(id => `forcedisplay[${id}]=${id}`).join('&');
                const countRes = await axios.get(`${recentUrl}/search/Ticket?session_token=${sToken}&range=0-1&get_all_entities=1`, { headers: { ...recentHeaders, 'Session-Token': sToken } });
                const totalAvailable = parseInt(countRes.data.totalcount, 10) || 0;
                const startOffset = Math.max(0, totalAvailable - 500);

                const val = (t, id) => t[id] !== undefined && t[id] !== null ? (typeof t[id] === 'object' ? t[id].name || t[id].id || '' : String(t[id])) : '';
                const valInt = (t, id) => { const v = t[id]; if (v === undefined || v === null) return 0; if (typeof v === 'object' && v !== null) { if (v.id !== undefined && v.id !== null) return Number(v.id) || 0; return Number(v.name) || 0; } const num = parseInt(String(v), 10); return isNaN(num) ? 0 : num; };
                const normEmail = (e) => { if (!e) return ''; e = e.trim().toLowerCase(); if (!e.includes('@')) e += '@ivry94.fr'; return e; };

                const insertBatchToPg = async (tickets) => {
                    if (tickets.length === 0) return;
                    const cols = 'glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22';
                    const values = tickets.map((t, i) => {
                        const base = i * 20;
                        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20})`;
                    }).join(', ');
                    const params = tickets.flatMap(t => [t.glpi_id, t.title, t.content || '', t.status, t.priority, t.urgency, t.impact, t.category, t.type, t.date_creation, t.date_mod, t.date_closed, t.date_solved, t.location, t.solution, t.source, t.entity, t.requester_name, t.email_alt, t.requester_email_22]);
                    await pool.query(`INSERT INTO glpi.tickets (${cols}) VALUES ${values} ON CONFLICT (glpi_id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status, priority = EXCLUDED.priority, urgency = EXCLUDED.urgency, impact = EXCLUDED.impact, category = EXCLUDED.category, type = EXCLUDED.type, date_creation = EXCLUDED.date_creation, date_mod = EXCLUDED.date_mod, date_closed = EXCLUDED.date_closed, date_solved = EXCLUDED.date_solved, location = EXCLUDED.location, solution = EXCLUDED.solution, source = EXCLUDED.source, entity = EXCLUDED.entity, requester_name = EXCLUDED.requester_name, email_alt = EXCLUDED.email_alt, requester_email_22 = EXCLUDED.requester_email_22, last_sync = CURRENT_TIMESTAMP`, params);
                };

                let processedCount = 0;
                const batchSize = 500;
                let allTickets = [];

                for (let start = startOffset; start < totalAvailable; start += batchSize) {
                    const end = Math.min(start + batchSize, totalAvailable);
                    const batchRes = await axios.get(`${recentUrl}/search/Ticket?session_token=${sToken}&range=${start}-${end - 1}&get_all_entities=1&${str}`, { headers: { ...recentHeaders, 'Session-Token': sToken } });
                    if (batchRes.data?.data && Array.isArray(batchRes.data.data)) {
                        for (const t of batchRes.data.data) {
                            const ticketId = valInt(t, 2);
                            if (!ticketId) continue;
                            allTickets.push({
                                glpi_id: ticketId, title: val(t, 1), content: val(t, 62) || '', status: valInt(t, 12), priority: valInt(t, 3), urgency: valInt(t, 10), impact: valInt(t, 11),
                                category: val(t, 7) || '', type: val(t, 14) || '', date_creation: val(t, 15) || '', date_mod: val(t, 19) || val(t, 15) || '',
                                date_closed: val(t, 16) || '', date_solved: val(t, 17) || '', location: val(t, 83) || '', solution: val(t, 24) || '', source: val(t, 9) || '',
                                entity: val(t, 80) || '', requester_name: val(t, 4) || 'Inconnu', email_alt: normEmail(val(t, 34)), requester_email_22: normEmail(val(t, 22))
                            });
                        }
                    }
                }

                await insertBatchToPg(allTickets);
                processedCount = allTickets.length;
                console.log(`[GLPI] Sync recent: ${processedCount} tickets synchronisés vers PostgreSQL (batch)`);

                // Mettre à jour le log
                if (autoLogId) {
                    await pool.query(
                        `UPDATE glpi.sync_logs SET status = $1, processed_tickets = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3`,
                        ['completed', processedCount, autoLogId]
                    );
                }

                await axios.get(`${recentUrl}/killSession?session_token=${sToken}`, { headers: { ...recentHeaders, 'Session-Token': sToken } });
            } catch (e) {
                console.error('[GLPI] Erreur sync recent auto:', e.message);
                // Log error if possible
                try {
                    if (autoLogId) {
                        await pool.query(
                            `UPDATE glpi.sync_logs SET status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3`,
                            ['error', e.message, autoLogId]
                        );
                    }
                } catch (logErr) {
                    console.error('[GLPI] Erreur log:', logErr.message);
                }
            }
        }, 2000);

    } catch (error) {
        console.error('[GLPI] Erreur création ticket:', error.message);
        res.status(500).json({ message: `Erreur création ticket: ${error.message}` });
    }
});

// Route : Clore un ticket GLPI
app.put('/api/glpi/tickets/:id/close', authenticateJWT, async (req, res) => {
    try {
        const ticketId = req.params.id;
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        // Créer un log pour la sync clôture
        const logResult = await pool.query(
            `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            ['ticket', 'close', 'magapp-user', 'running', 1]
        );
        const closeLogId = logResult.rows[0]?.id;

        // Mettre à jour le ticket avec status = 6 (Clos)
        const updateRes = await axios.put(`${url}/Ticket/${ticketId}`, {
            input: {
                id: parseInt(ticketId),
                status: 6
            }
        }, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken },
            timeout: 15000
        });

        // Récupérer le ticket mis à jour et synchroniser vers PostgreSQL
        const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
        const forcedStr = forcedFields.map((id) => `forcedisplay[${id}]=${id}`).join('&');
        const ticketRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&criteria[0][field]=2&criteria[0][searchtype]=equals&criteria[0][value]=${ticketId}&${forcedStr}`, { headers: commonHeaders, timeout: 10000 });

        if (ticketRes.data?.data && ticketRes.data.data.length > 0) {
            const t = ticketRes.data.data[0];
const val = (field, id) => {
                const v = field[id];
                if (v === undefined || v === null) return '';
                if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
                return String(v);
            };
            const valInt = (field, id) => {
                const v = field[id];
                if (v === undefined || v === null) return 0;
                if (typeof v === 'object' && v !== null) {
                    if (v.id !== undefined && v.id !== null) return Number(v.id) || 0;
                    return Number(v.name) || 0;
                }
                const num = parseInt(String(v), 10);
                return isNaN(num) ? 0 : num;
            };
            const normalizeEmail = (email) => {
                if (!email || typeof email !== 'string') return '';
                email = email.trim().toLowerCase();
                if (!email) return '';
                if (!email.includes('@')) email += '@ivry94.fr';
                return email;
            };

            const email34 = normalizeEmail(val(t, 34));
            const email22 = normalizeEmail(val(t, 22));

            await pgDb.run(
                `INSERT INTO glpi.tickets (glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22, last_sync)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP)
                 ON CONFLICT (glpi_id) DO UPDATE SET
                   title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status, priority = EXCLUDED.priority,
                   urgency = EXCLUDED.urgency, impact = EXCLUDED.impact, category = EXCLUDED.category, type = EXCLUDED.type,
                   date_creation = EXCLUDED.date_creation, date_mod = EXCLUDED.date_mod, date_closed = EXCLUDED.date_closed, 
                   date_solved = EXCLUDED.date_solved, location = EXCLUDED.location, solution = EXCLUDED.solution,
                   source = EXCLUDED.source, entity = EXCLUDED.entity, requester_name = EXCLUDED.requester_name,
                   email_alt = EXCLUDED.email_alt, requester_email_22 = EXCLUDED.requester_email_22, last_sync = CURRENT_TIMESTAMP`,
                 [valInt(t, 2), val(t, 1), val(t, 62) || '', valInt(t, 12), valInt(t, 3), valInt(t, 11), valInt(t, 10),
                  val(t, 7) || '', val(t, 14) || '', val(t, 15) || '', val(t, 16) || '',
                  val(t, 17) || '', val(t, 19) || '', val(t, 83) || '', val(t, 24) || '',
                  val(t, 9) || '', val(t, 80) || '', val(t, 4) || '', email34, email22]
            );
            console.log(`[GLPI] Ticket ${ticketId} sync après clôture`);
        }

        // Mettre à jour le log
        if (closeLogId) {
            await pool.query(
                `UPDATE glpi.sync_logs SET status = $1, processed_tickets = 1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`,
                ['completed', closeLogId]
            );
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        res.json({ success: true, ticket: updateRes.data });
    } catch (error) {
        console.error('[GLPI] Erreur clôture ticket:', error.message);
        res.status(500).json({ message: `Erreur clôture ticket: ${error.message}` });
    }
});

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

// Route : Upload de pièces jointes vers un ticket GLPI
const glpiUploadDir = path.join(__dirname, 'glpi_attachments');
if (!fs.existsSync(glpiUploadDir)) {
    fs.mkdirSync(glpiUploadDir, { recursive: true });
}

const glpiUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, glpiUploadDir),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + '-' + file.originalname);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.post('/api/glpi/tickets/:id/attachments', authenticateJWT, glpiUpload.array('files', 5), async (req, res) => {
    try {
        const ticketId = req.params.id;
        const files = req.files;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'Aucun fichier' });
        }
        
        console.log(`[GLPI Upload] Début upload ${files.length} fichier(s) pour ticket ${ticketId}`);
        
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const appToken = (settings.app_token || '').trim();
        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { 'App-Token': appToken, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        // Activer la session
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: { 'App-Token': appToken } });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: { 'App-Token': appToken } });

        let uploadedCount = 0;
        
        for (const file of files) {
            try {
                console.log(`[GLPI Upload] Traitement fichier: ${file.originalname} (${file.size} bytes)`);
                
                const FormData = require('form-data');
                const form = new FormData();
                
                form.append('uploadManifest', JSON.stringify({
                    input: {
                        name: file.originalname,
                        filename: file.originalname,
                        mime: file.mimetype || 'application/octet-stream'
                    }
                }));
                
                form.append('filename', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype || 'application/octet-stream'
                });

                console.log(`[GLPI Upload] Envoi vers ${url}/Document`);
                
                const docRes = await axios.post(`${url}/Document`, form, {
                    headers: { 
                        'App-Token': appToken,
                        'Session-Token': sessionToken,
                        ...form.getHeaders()
                    },
                    timeout: 30000
                });

                console.log(`[GLPI Upload] Réponse complète:`, JSON.stringify(docRes.data));

                // GLPI peut retourner le document de différentes façons
                let docId = null;
                if (docRes.data?.id) {
                    docId = docRes.data.id;
                } else if (docRes.data && typeof docRes.data === 'object') {
                    // Chercher l'ID dans différentes structures possibles
                    docId = docRes.data.document_id || docRes.data.documents_id || docRes.data[0]?.id || docRes.data.id;
                }

                console.log(`[GLPI Upload] Document ID trouvé:`, docId);

                if (docId) {
                    // Vérifier les détails du document uploadé
                    const docDetailRes = await axios.get(`${url}/Document/${docId}`, {
                        headers: { 'App-Token': appToken, 'Session-Token': sessionToken }
                    });
                    console.log(`[GLPI Upload] Détails document ${docId}:`, JSON.stringify(docDetailRes.data));
                    
                    // Lier via Document_Item (itemtype=Ticket, items_id=ticketId)
                    const itemRes = await axios.post(`${url}/Document_Item`, {
                        input: {
                            documents_id: docId,
                            itemtype: 'Ticket',
                            items_id: parseInt(ticketId)
                        }
                    }, {
                        headers: { 
                            'App-Token': appToken, 
                            'Session-Token': sessionToken,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    });
                    console.log(`[GLPI Upload] Document_Item créé:`, itemRes.data);
                    
                    uploadedCount++;
                } else {
                    console.log(`[GLPI Upload] Pas d'ID de document retourné, réponse:`, docRes.data);
                }
            } catch (e) {
                console.error('[GLPI] Erreur upload fichier:', e.response?.data || e.message);
            }

            // Supprimer le fichier temporaire
            fs.unlinkSync(file.path);
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { 
            headers: { 'App-Token': appToken, 'Session-Token': sessionToken } 
        });

        res.json({ success: true, count: uploadedCount });
    } catch (error) {
        console.error('[GLPI] Erreur upload:', error.message);
        res.status(500).json({ message: `Erreur upload: ${error.message}` });
    }
});

// Route : Synchroniser TOUS les tickets GLPI (Pagination par 500)
app.post('/api/glpi/sync-all-tickets', authenticateInternalOrAdmin, async (req, res) => {
    let sessionToken = null;
    let url = null;
    let commonHeaders = null;
    let processedCount = 0;
    let syncLogId = null;
    const triggeredBy = req.user?.username || 'admin';

    glpiSyncCancelled = false;
    glpiSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString(), type: 'full' };

    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            glpiSyncProgress.active = false;
            return res.status(400).json({ message: 'GLPI non configuré' });
        }

        url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const app_token = (settings.app_token || '').trim();
        const user_token = (settings.user_token || '').trim();
        const login = (settings.login || '').trim();
        const password = (settings.password || '').trim();

        commonHeaders = { 'App-Token': app_token, 'Content-Type': 'application/json', 'Accept': 'application/json' };
        let authHeader = login && password
            ? `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
            : `user_token ${user_token}`;

        // 1. Session Init
        const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
        sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        // Synchroniser les statuts GLPI
        const statuses = [
            { id: 1, label: 'Nouveau' },
            { id: 2, label: 'En cours (Attribué)' },
            { id: 3, label: 'En cours (Planifié)' },
            { id: 4, label: 'En attente' },
            { id: 5, label: 'Résolu' },
            { id: 6, label: 'Clos' }
        ];
        for (const status of statuses) {
            await pgDb.run(`INSERT INTO glpi.ticket_status (id, label) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`, [status.id, status.label]);
        }
        console.log('[GLPI Sync] Statuts synchronisés');

        // 2. Obtenir le compte total
        const countRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`, { headers: commonHeaders });
        const totalCount = parseInt(countRes.data.totalcount, 10) || 0;
        console.log(`[GLPI Sync] Début synchronisation totale. Total estimé: ${totalCount}`);
        glpiSyncProgress.total = totalCount;

        // Créer le log de synchro
        const logResult = await pool.query(
            `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            ['tickets', 'full', triggeredBy, 'running', totalCount]
        );
        syncLogId = logResult.rows[0]?.id;

        if (totalCount === 0) {
            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            return res.json({ success: true, count: 0, message: 'Aucun ticket à synchroniser.' });
        }

        const batchSize = 500;
        let processedCount = 0;

        // Helper pour insertion lot PostgreSQL
        const insertBatchToPg = async (tickets) => {
            if (tickets.length === 0) return;
            const cols = 'glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22';
            const values = tickets.map((t, i) => {
                const base = i * 20;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20})`;
            }).join(', ');
            const params = tickets.flatMap(t => [t.glpi_id, t.title, t.content || '', t.status, t.priority, t.urgency, t.impact, t.category, t.type, t.date_creation, t.date_mod, t.date_closed, t.date_solved, t.location, t.solution, t.source, t.entity, t.requester_name, t.email_alt, t.requester_email_22]);
            await pool.query(`INSERT INTO glpi.tickets (${cols}) VALUES ${values} ON CONFLICT (glpi_id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status, priority = EXCLUDED.priority, urgency = EXCLUDED.urgency, impact = EXCLUDED.impact, category = EXCLUDED.category, type = EXCLUDED.type, date_creation = EXCLUDED.date_creation, date_mod = EXCLUDED.date_mod, date_closed = EXCLUDED.date_closed, date_solved = EXCLUDED.date_solved, location = EXCLUDED.location, solution = EXCLUDED.solution, source = EXCLUDED.source, entity = EXCLUDED.entity, requester_name = EXCLUDED.requester_name, email_alt = EXCLUDED.email_alt, requester_email_22 = EXCLUDED.requester_email_22, last_sync = CURRENT_TIMESTAMP`, params);
        };

        // Helper function to safely extract values from GLPI response, handling objects and nulls
        const val = (t, id) => {
            const v = t[id];
            if (v === undefined || v === null) return '';
            if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
            return v;
        };

        const valInt = (t, id) => {
            const v = t[id];
            if (v === undefined || v === null) return 0;
            if (typeof v === 'object' && v !== null) {
                if (v.id !== undefined && v.id !== null) return Number(v.id) || 0;
                return Number(v.name) || 0;
            }
            const num = parseInt(String(v), 10);
            return isNaN(num) ? 0 : num;
        };

        // Helper pour normaliser les emails (ajouter @ivry94.fr si pas de domaine)
        const normalizeEmail = (email) => {
            if (!email || typeof email !== 'string') return '';
            email = email.trim().toLowerCase();
            if (!email) return '';
            if (!email.includes('@')) email += '@ivry94.fr';
            return email;
        };

        for (let start = 0; start < totalCount; start += batchSize) {
            if (glpiSyncCancelled) {
                console.log('[GLPI Sync] Synchronisation annulée par l\'utilisateur.');
                glpiSyncProgress.active = false;
                glpiSyncCancelled = false;
                return res.status(499).json({ message: 'Synchronisation annulée', count: processedCount, total: totalCount });
            }

            const end = Math.min(start + batchSize, totalCount);
            console.log(`[GLPI Sync] Récupération tickets ${start}-${end}...`);

            // forcedisplay pour tous les champs requis. Ajout du 22 (Email) car le 34 est parfois vide. 62 = content/description.
            const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
            const forcedStr = forcedFields.map((id) => `forcedisplay[${id}]=${id}`).join('&');
            // GLPI Range est inclusif (0-499 = 500 items). On utilise donc start-${end-1}
            const batchRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=${start}-${end - 1}&get_all_entities=1&${forcedStr}`, { headers: commonHeaders });

            if (batchRes.data && Array.isArray(batchRes.data.data)) {
                const batchTickets = [];
                for (const t of batchRes.data.data) {
                    const ticketId = valInt(t, 2);
                    if (!ticketId) {
                        console.log('[GLPI Sync] Ticket sans ID ignoré dans le batch:', JSON.stringify(t).substring(0, 200));
                        continue;
                    }
                    const email34 = normalizeEmail(val(t, 34));
                    const email22 = normalizeEmail(val(t, 22));

                    batchTickets.push({
                        glpi_id: ticketId, title: val(t, 1), content: val(t, 62), status: valInt(t, 12), priority: valInt(t, 3),
                        urgency: valInt(t, 10), impact: valInt(t, 11), category: val(t, 7), type: val(t, 14),
                        date_creation: val(t, 15), date_mod: val(t, 19) || val(t, 15), date_closed: val(t, 16) || null,
                        date_solved: val(t, 17) || null, location: val(t, 83), solution: val(t, 24), source: val(t, 9),
                        entity: val(t, 80), requester_name: val(t, 4) || 'Inconnu', email_alt: email34, requester_email_22: email22
                    });

                    processedCount++;
                    glpiSyncProgress.processed = processedCount;
                    glpiSyncProgress.lastUpdate = new Date().toISOString();
                }
                // Insertion lot PostgreSQL
                await insertBatchToPg(batchTickets);
            }
        }
        glpiSyncProgress.active = false;
        console.log(`[GLPI Sync] Synchronisation terminée : ${processedCount} tickets.`);

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
        res.json({ success: true, count: processedCount, total: totalCount });

    } catch (error) {
        console.error('[GLPI] Erreur Sync Totale:', error.message);
        if (sessionToken && url && commonHeaders) {
            try { await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders }); } catch (e) { }
        }
        glpiSyncProgress.active = false;
        res.status(500).json({ message: `Erreur Synchronisation Totale: ${error.message}` });
    }
});

// Route : Synchroniser les statuts GLPI
app.post('/api/glpi/sync-statuses', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        const statuses = [
            { id: 1, label: 'Nouveau' },
            { id: 2, label: 'En cours (Attribué)' },
            { id: 3, label: 'En cours (Planifié)' },
            { id: 4, label: 'En attente' },
            { id: 5, label: 'Résolu' },
            { id: 6, label: 'Clos' }
        ];

        let count = 0;
        for (const status of statuses) {
            await pgDb.run(
                `INSERT INTO glpi.ticket_status (id, label) VALUES ($1, $2)
                 ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
                [status.id, status.label]
            );
            count++;
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        res.json({ success: true, count, message: `${count} statuts synchronisés` });
    } catch (error) {
        console.error('[GLPI] Erreur sync statuts:', error.message);
        res.status(500).json({ message: `Erreur sync statuts: ${error.message}` });
    }
});

// Route : Synchroniser les observateurs GLPI (par lots de tickets)
app.post('/api/glpi/sync-observers', authenticateInternalOrAdmin, async (req, res) => {
    observersSyncCancelled = false;
    observersSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString() };

    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            observersSyncProgress.active = false;
            return res.status(400).json({ message: 'GLPI non configuré' });
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        // Récupérer les IDs des tickets depuis PostgreSQL
        const tickets = await pgDb.all('SELECT glpi_id FROM glpi.tickets ORDER BY glpi_id');
        console.log(`[GLPI Observers] Synchronisation de ${tickets.length} tickets...`);
        console.log(`[GLPI Observers] Exemple de ticket:`, tickets[0]);
        observersSyncProgress.total = tickets.length;

        let observerCount = 0;
        const batchSize = 500;
        const observersToInsert = [];

        for (let i = 0; i < tickets.length; i += batchSize) {
            if (observersSyncCancelled) {
                console.log('[GLPI Observers] Synchronisation annulée');
                observersSyncProgress.active = false;
                observersSyncCancelled = false;
                return res.status(499).json({ message: 'Synchronisation annulée', count: observerCount });
            }

            const batch = tickets.slice(i, i + batchSize);
            const promises = batch.map(ticket => 
                axios.get(`${url}/Ticket/${ticket.glpi_id}/Ticket_User?session_token=${sessionToken}`, {
                    headers: commonHeaders,
                    timeout: 10000
                }).catch(() => ({ data: [] }))
            );
            
            const results = await Promise.all(promises);
            
            for (let j = 0; j < results.length; j++) {
                const ticketId = batch[j].glpi_id;
                const ticketUsers = results[j].data || [];
                
                // Filtrer uniquement les observateurs (type=3)
                const observers = ticketUsers.filter(tu => tu.type === 3);
                
                for (const obs of observers) {
                    observersToInsert.push({
                        ticket_id: ticketId,
                        user_id: obs.users_id,
                        name: obs.users_id?.toString() || '',
                        login: obs.users_id?.toString() || '',
                        email: obs.alternative_email || ''
                    });
                }
            }

            observersSyncProgress.processed = Math.min(i + batchSize, tickets.length);
            observersSyncProgress.lastUpdate = new Date().toISOString();

            if ((i + batchSize) % 500 === 0 || i + batchSize >= tickets.length) {
                console.log(`[GLPI Observers] Progression: ${Math.min(i + batchSize, tickets.length)}/${tickets.length}`);
            }
        }

        // Insertion par lots dans PostgreSQL
        if (observersToInsert.length > 0) {
            const insertBatch = async (obs) => {
                const values = obs.map((o, idx) => {
                    const base = idx * 5;
                    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, CURRENT_TIMESTAMP)`;
                }).join(', ');
                const params = obs.flatMap(o => [o.ticket_id, o.user_id, o.name, o.login, o.email]);
                await pool.query(`INSERT INTO glpi.observers (ticket_id, user_id, name, login, email, last_sync) VALUES ${values} ON CONFLICT (ticket_id, user_id) DO UPDATE SET name = EXCLUDED.name, login = EXCLUDED.login, email = EXCLUDED.email, last_sync = EXCLUDED.last_sync`, params);
            };

            const pgBatchSize = 500;
            for (let i = 0; i < observersToInsert.length; i += pgBatchSize) {
                await insertBatch(observersToInsert.slice(i, i + pgBatchSize));
            }
            observerCount = observersToInsert.length;
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        try {
            await pool.query(`INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets, processed_tickets) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['observers', 'full', req.user?.username || 'admin', 'completed', tickets.length, observerCount]);
        } catch (logErr) {
            console.error('[GLPI] Erreur log sync observateurs:', logErr.message);
        }

        observersSyncProgress.active = false;
        res.json({ success: true, count: observerCount, message: `${observerCount} observateurs synchronisés` });
    } catch (error) {
        observersSyncProgress.active = false;
        console.error('[GLPI] Erreur sync observateurs:', error.message);
        res.status(500).json({ message: `Erreur sync observateurs: ${error.message}` });
    }
});

// Route : Synchro observateurs pour tickets récents uniquement
app.post('/api/glpi/sync-observers-recent', authenticateInternalOrAdmin, async (req, res) => {
    observersSyncCancelled = false;
    observersSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString() };

    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            observersSyncProgress.active = false;
            return res.status(400).json({ message: 'GLPI non configuré' });
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        // Récupérer uniquement les 50 derniers tickets
        const tickets = await pgDb.all('SELECT glpi_id FROM glpi.tickets ORDER BY glpi_id DESC LIMIT 50');
        console.log(`[GLPI Observers Recent] Synchronisation de ${tickets.length} tickets...`);
        observersSyncProgress.total = tickets.length;

        let observerCount = 0;
        const observersToInsert = [];

        const obsResults = await Promise.allSettled(tickets.map(async (ticket) => {
            try {
                const resUsers = await axios.get(`${url}/Ticket/${ticket.glpi_id}/Ticket_User?session_token=${sessionToken}`, {
                    headers: commonHeaders,
                    timeout: 5000
                });
                const ticketUsers = resUsers.data || [];
                const observers = ticketUsers.filter(tu => tu.type === 3);
                return observers.map(obs => ({
                    ticket_id: ticket.glpi_id,
                    user_id: obs.users_id,
                    name: obs.users_id?.toString() || '',
                    login: obs.users_id?.toString() || '',
                    email: obs.alternative_email || ''
                }));
            } catch (e) {
                return [];
            }
        }));

        for (const result of obsResults) {
            if (result.status === 'fulfilled') {
                observersToInsert.push(...result.value);
            }
        }

        observersSyncProgress.processed = tickets.length;
        observersSyncProgress.lastUpdate = new Date().toISOString();

        if (observersToInsert.length > 0) {
            const insertBatch = async (obs) => {
                const values = obs.map((o, idx) => {
                    const base = idx * 5;
                    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, CURRENT_TIMESTAMP)`;
                }).join(', ');
                const params = obs.flatMap(o => [o.ticket_id, o.user_id, o.name, o.login, o.email]);
                await pool.query(`INSERT INTO glpi.observers (ticket_id, user_id, name, login, email, last_sync) VALUES ${values} ON CONFLICT (ticket_id, user_id) DO UPDATE SET name = EXCLUDED.name, login = EXCLUDED.login, email = EXCLUDED.email, last_sync = EXCLUDED.last_sync`, params);
            };

            const pgBatchSize = 500;
            for (let i = 0; i < observersToInsert.length; i += pgBatchSize) {
                await insertBatch(observersToInsert.slice(i, i + pgBatchSize));
            }
            observerCount = observersToInsert.length;
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        try {
            await pool.query(`INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets, processed_tickets) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['observers', 'recent', req.user?.username || 'admin', 'completed', tickets.length, observerCount]);
        } catch (logErr) {
            console.error('[GLPI] Erreur log sync observateurs recent:', logErr.message);
        }

        observersSyncProgress.active = false;
        res.json({ success: true, count: observerCount, message: `${observerCount} observateurs synchronisés pour les 50 derniers tickets` });
    } catch (error) {
        observersSyncProgress.active = false;
        console.error('[GLPI] Erreur sync observateurs recent:', error.message);
        res.status(500).json({ message: `Erreur sync observateurs: ${error.message}` });
    }
});

let followupsSyncProgress = { active: false, processed: 0, total: 0 };
let followupsSyncCancelled = false;

app.get('/api/glpi/sync-followups-status', authenticateAdmin, (req, res) => {
    res.json(followupsSyncProgress);
});

app.post('/api/glpi/sync-followups-cancel', authenticateAdmin, (req, res) => {
    console.log('[GLPI Followups Cancel] Demande d\'annulation reçue');
    followupsSyncCancelled = true;
    res.json({ success: true });
});

app.post('/api/glpi/sync-followups', authenticateInternalOrAdmin, async (req, res) => {
    followupsSyncCancelled = false;
    followupsSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString() };

    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            followupsSyncProgress.active = false;
            return res.status(400).json({ message: 'GLPI non configuré' });
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        const tickets = await pgDb.all('SELECT glpi_id FROM glpi.tickets ORDER BY glpi_id DESC');
        console.log(`[GLPI Followups] Synchronisation de ${tickets.length} tickets...`);
        followupsSyncProgress.total = tickets.length;

        let followupCount = 0;
        const followupsToInsert = [];

        const CONCURRENCY = 500;
        for (let batch = 0; batch < tickets.length; batch += CONCURRENCY) {
            if (followupsSyncCancelled) {
                followupsSyncProgress.active = false;
                followupsSyncCancelled = false;
                return res.status(499).json({ message: 'Synchronisation annulée', count: followupCount });
            }

            const batchTickets = tickets.slice(batch, batch + CONCURRENCY);
            const results = await Promise.allSettled(batchTickets.map(async (ticket) => {
                try {
                    const resFollowups = await axios.get(`${url}/Ticket/${ticket.glpi_id}/ITILFollowup?session_token=${sessionToken}`, {
                        headers: commonHeaders,
                        timeout: 5000
                    });
                    const followups = resFollowups.data || [];
                    const items = [];
                    for (const fu of followups) {
                        if (fu.content) {
                            items.push({
                                ticket_id: ticket.glpi_id,
                                content: fu.content,
                                author_name: fu.users_id?.name || fu.users_id?.toString() || '',
                                author_email: fu.users_id?.email || '',
                                is_private: fu.is_private || 0,
                                date_creation: fu.date || null
                            });
                        }
                    }
                    return items;
                } catch (e) {
                    return [];
                }
            }));

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    followupsToInsert.push(...result.value);
                }
            }

            followupsSyncProgress.processed = Math.min(batch + CONCURRENCY, tickets.length);
            followupsSyncProgress.lastUpdate = new Date().toISOString();
            console.log(`[GLPI Followups] Progression: ${followupsSyncProgress.processed}/${tickets.length}`);
        }

        if (followupsToInsert.length > 0) {
            const insertBatch = async (fus) => {
                const values = fus.map((f, idx) => {
                    const base = idx * 6;
                    return `($${base + 1}, $${base + 2}, md5($${base + 2}), $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, CURRENT_TIMESTAMP)`;
                }).join(', ');
                const params = fus.flatMap(f => [f.ticket_id, f.content, f.author_name, f.author_email, f.is_private, f.date_creation]);
                await pool.query(`INSERT INTO glpi.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation, last_sync) VALUES ${values} ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING`, params);
            };

            const pgBatchSize = 500;
            for (let i = 0; i < followupsToInsert.length; i += pgBatchSize) {
                await insertBatch(followupsToInsert.slice(i, i + pgBatchSize));
            }
            followupCount = followupsToInsert.length;
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        try {
            await pool.query(`INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets, processed_tickets) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['followups', 'full', req.user?.username || 'admin', 'completed', tickets.length, followupCount]);
        } catch (logErr) {
            console.error('[GLPI] Erreur log sync followups:', logErr.message);
        }

        followupsSyncProgress.active = false;
        res.json({ success: true, count: followupCount, message: `${followupCount} traitements synchronisés` });
    } catch (error) {
        followupsSyncProgress.active = false;
        console.error('[GLPI] Erreur sync followups:', error.message);
        res.status(500).json({ message: `Erreur sync followups: ${error.message}` });
    }
});

app.post('/api/glpi/sync-followups-recent', authenticateInternalOrAdmin, async (req, res) => {
    followupsSyncCancelled = false;
    followupsSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString() };

    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            followupsSyncProgress.active = false;
            return res.status(400).json({ message: 'GLPI non configuré' });
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = (settings.user_token || '').trim()
            ? `user_token ${(settings.user_token || '').trim()}`
            : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

        const tickets = await pgDb.all('SELECT glpi_id FROM glpi.tickets ORDER BY glpi_id DESC LIMIT 50');
        console.log(`[GLPI Followups Recent] Synchronisation de ${tickets.length} tickets...`);
        followupsSyncProgress.total = tickets.length;

        let followupCount = 0;
        const followupsToInsert = [];

        const results = await Promise.allSettled(tickets.map(async (ticket) => {
            try {
                const resFollowups = await axios.get(`${url}/Ticket/${ticket.glpi_id}/ITILFollowup?session_token=${sessionToken}`, {
                    headers: commonHeaders,
                    timeout: 5000
                });
                const followups = resFollowups.data || [];
                const items = [];
                for (const fu of followups) {
                    if (fu.content) {
                        items.push({
                            ticket_id: ticket.glpi_id,
                            content: fu.content,
                            author_name: fu.users_id?.name || fu.users_id?.toString() || '',
                            author_email: fu.users_id?.email || '',
                            is_private: fu.is_private || 0,
                            date_creation: fu.date || null
                        });
                    }
                }
                return items;
            } catch (e) {
                return [];
            }
        }));

        for (const result of results) {
            if (result.status === 'fulfilled') {
                followupsToInsert.push(...result.value);
            }
        }

        followupsSyncProgress.processed = tickets.length;
        followupsSyncProgress.lastUpdate = new Date().toISOString();

        if (followupsToInsert.length > 0) {
            const insertBatch = async (fus) => {
                const values = fus.map((f, idx) => {
                    const base = idx * 6;
                    return `($${base + 1}, $${base + 2}, md5($${base + 2}), $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, CURRENT_TIMESTAMP)`;
                }).join(', ');
                const params = fus.flatMap(f => [f.ticket_id, f.content, f.author_name, f.author_email, f.is_private, f.date_creation]);
                await pool.query(`INSERT INTO glpi.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation, last_sync) VALUES ${values} ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING`, params);
            };

            const pgBatchSize = 500;
            for (let i = 0; i < followupsToInsert.length; i += pgBatchSize) {
                await insertBatch(followupsToInsert.slice(i, i + pgBatchSize));
            }
            followupCount = followupsToInsert.length;
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        try {
            await pool.query(`INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets, processed_tickets) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['followups', 'recent', req.user?.username || 'admin', 'completed', tickets.length, followupCount]);
        } catch (logErr) {
            console.error('[GLPI] Erreur log sync followups recent:', logErr.message);
        }

        followupsSyncProgress.active = false;
        res.json({ success: true, count: followupCount, message: `${followupCount} traitements synchronisés pour les 50 derniers tickets` });
    } catch (error) {
        followupsSyncProgress.active = false;
        console.error('[GLPI] Erreur sync followups recent:', error.message);
        res.status(500).json({ message: `Erreur sync followups: ${error.message}` });
    }
});

// Nouvelle route : Get My Profile
app.get('/api/glpi/my-profile', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'Non configuré' });

        let url = settings.url.trim();
        let app_token = (settings.app_token || '').trim();
        let user_token = (settings.user_token || '').trim();

        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        console.log(`[GLPI Profile] Tentative sur ${url}`);
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': `user_token ${user_token}` },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) {
            console.log('[GLPI Profile] Échec initSession:', sessionRes.data);
            return res.status(401).json({ message: 'Echec initialisation session GLPI' });
        }

        const profileRes = await axios.get(`${url}/getMyProfiles`, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });

        await axios.get(`${url}/killSession`, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });

        res.json({ profiles: profileRes.data });
    } catch (e) {
        const msg = e.response?.data?.[1] || e.response?.data?.message || e.message;
        res.status(500).json({ message: `Erreur Get Profiles : ${msg}` });
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

async function recalculateAllOperations() {
    try {
        const operations = await db.all('SELECT * FROM operations');
        const oracle_commande = await db.all('SELECT operation_id, "Montant TTC" FROM v_orders WHERE operation_id IS NOT NULL');

        for (const op of operations) {
            const linkedOrders = oracle_commande.filter(o => String(o.operation_id) === String(op.id));
            const used = linkedOrders.reduce((acc, o) => {
                let val = o["Montant TTC"];
                if (!val) return acc;
                const num = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
                return acc + num;
            }, 0);

            await db.run('UPDATE operations SET used_amount = ? WHERE id = ?', [used, op.id]);
        }
        console.log('Synchronisation montants terminée.');
    } catch (error) {
        console.error('Erreur synchronisation:', error);
    }
}
// Magapp Public Routes
app.get('/api/magapp/categories', async (req, res) => {
    try {
        const categories = await pgDb.all('SELECT * FROM magapp_categories ORDER BY display_order ASC, name ASC');
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
});

app.get('/api/test-simple', (req, res) => {
    res.json({ message: 'Simple test works!' });
});

app.get('/api/magapp/apps', async (req, res) => {
    try {
        const apps = await pgDb.all(`
            SELECT a.*, (SELECT COUNT(*) FROM magapp.app_users WHERE app_id = a.id) as user_count
            FROM magapp_apps a
            ORDER BY a.name ASC
        `);
        res.json(apps);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching apps' });
    }
});

app.get('/api/magapp/mercator-apps', async (req, res) => {
    try {
        const mariadbSettings = await db.get('SELECT * FROM mariadb_settings WHERE type = ?', ['MAIN']);
        if (!mariadbSettings || !mariadbSettings.is_enabled) {
            return res.json([]);
        }
        const conn = await mariadb.createConnection({
            host: mariadbSettings.host, port: mariadbSettings.port, user: mariadbSettings.user,
            password: mariadbSettings.password, database: mariadbSettings.database, connectTimeout: 5000
        });
        const rows = await conn.query('SELECT id, name, description FROM m_applications ORDER BY name');
        await conn.end();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching mercator apps:', err.message);
        res.json([]);
    }
});

// Route de test de connectivité des applications
app.post('/api/magapp/health-check', async (req, res) => {
    try {
        const apps = await pgDb.all('SELECT id, url FROM magapp_apps WHERE is_maintenance = 0');
        const results = {};

        const checkApp = async (app) => {
            if (!app.url || !app.url.startsWith('http')) {
                results[app.id] = 'fail';
                return;
            }
            try {
                // Config axios pour accepter plus de codes et ignorer les erreurs SSL
                const config = {
                    timeout: 5000,
                    validateStatus: (status) => (status >= 200 && status < 400) || status === 401 || status === 403
                };

                // Tentative en HEAD d'abord
                try {
                    await axios.head(app.url.trim(), config);
                    results[app.id] = 'ok';
                } catch (error) {
                    // Fallback en GET
                    await axios.get(app.url.trim(), config);
                    results[app.id] = 'ok';
                }
            } catch (error) {
                results[app.id] = 'fail';
            }
        };

        // Exécution en parallèle avec une limite pour ne pas saturer le réseau
        const BATCH_SIZE = 10;
        for (let i = 0; i < apps.length; i += BATCH_SIZE) {
            const batch = apps.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(checkApp));
        }

        res.json({ results });
    } catch (err) {
        console.error('Health Check Error:', err);
        res.status(500).json({ message: 'Erreur lors du test des applications' });
    }
});

// Favorites Routes
app.get('/api/magapp/favorites', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: 'Username requis' });
    try {
        const favorites = await pgDb.all('SELECT app_id FROM magapp_favorites WHERE username = ?', [username]);
        res.json(favorites.map(f => f.app_id));
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture favoris' });
    }
});

app.post('/api/magapp/favorites', async (req, res) => {
    const { username, app_id } = req.body;
    if (!username || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await pgDb.run('INSERT INTO magapp_favorites (username, app_id) VALUES (?, ?)', [username, app_id]);
        res.json({ message: 'Ajouté aux favoris' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur ajout favoris' });
    }
});

app.delete('/api/magapp/favorites', async (req, res) => {
    const { username, app_id } = req.query;
    if (!username || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await pgDb.run('DELETE FROM magapp_favorites WHERE username = ? AND app_id = ?', [username, app_id]);
        res.json({ message: 'Retiré des favoris' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur suppression favoris' });
    }
});

app.post('/api/magapp/clicks', async (req, res) => {
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
                // Try to get displayName from LDAP/AD
                let displayName = username;
                try {
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
                } catch (ldapErr) {
                    console.warn('[MAGAPP TRACK] LDAP search failed, using username:', ldapErr.message);
                }

                await pgDb.run(`
                    INSERT INTO magapp.app_users (app_id, username, display_name, last_connection, source)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'magapp')
                    ON CONFLICT (app_id, username)
                    DO UPDATE SET last_connection = EXCLUDED.last_connection, display_name = EXCLUDED.display_name
                `, [app_id, username.toLowerCase(), displayName]);
            } catch (trackErr) {
                console.error('[MAGAPP TRACK] Error auto-tracking user:', trackErr.message);
            }
        }

        res.json({ message: 'Click recorded' });
    } catch (error) {
        res.status(500).json({ message: 'Error recording click', error: error.message });
    }
});

app.post('/api/magapp/subscribe', async (req, res) => {
    const { app_id, email } = req.body;
    if (!app_id || !email) return res.status(400).json({ message: 'Données manquantes' });

    try {
        await pgDb.run(
            'INSERT INTO magapp_subscriptions (app_id, email) VALUES (?, ?)',
            [app_id, email]
        );
        res.json({ message: 'Vous recevrez désormais les notifications de maintenance pour cette application.' });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'abonnement", error: error.message });
    }
});

app.get('/api/magapp/tickets', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    try {
        const username = email.split('@')[0].toLowerCase();
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
        res.json(tickets);
    } catch (err) {
        console.error('Erreur tickets list:', err);
        res.status(500).json({ message: 'Erreur lecture tickets' });
    }
});

// Route : Récupérer un ticket spécifique depuis GLPI et le stocker dans PostgreSQL
app.get('/api/glpi/tickets/:id', authenticateJWT, async (req, res) => {
    const ticketId = req.params.id;
    const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
    if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

    let url = settings.url.trim();
    if (!url.includes('apirest.php')) {
        url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
    }

    const commonHeaders = {
        'App-Token': (settings.app_token || '').trim(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    let authHeader = (settings.user_token || '').trim()
        ? `user_token ${(settings.user_token || '').trim()}`
        : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

    try {
        const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        // Activer la session
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        const fields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
        const str = fields.map(id => `forcedisplay[${id}]=${id}`).join('&');
        const ticketRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&criteria[0][field]=2&criteria[0][searchtype]=equals&criteria[0][value]=${ticketId}&${str}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        if (ticketRes.data?.data && ticketRes.data.data.length > 0) {
            const t = ticketRes.data.data[0];
            const val = (field, id) => {
                const v = field[id];
                if (v === undefined || v === null) return '';
                if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
                return String(v);
            };
            const valInt = (field, id) => {
                const v = field[id];
                if (v === undefined || v === null) return 0;
                if (typeof v === 'object' && v !== null) {
                    if (v.id !== undefined && v.id !== null) return Number(v.id) || 0;
                    return Number(v.name) || 0;
                }
                const num = parseInt(String(v), 10);
                return isNaN(num) ? 0 : num;
            };
            const normalizeEmail = (email) => {
                if (!email || typeof email !== 'string') return '';
                email = email.trim().toLowerCase();
                if (!email) return '';
                if (!email.includes('@')) email += '@ivry94.fr';
                return email;
            };

const ticketId = valInt(t, 2);
                if (!ticketId) {
                    console.log('[GLPI] Ticket sans ID ignoré:', JSON.stringify(t).substring(0, 200));
                    return res.status(404).json({ message: 'Ticket non trouvé (ID manquant)' });
                }
                const email34 = normalizeEmail(val(t, 34));
                const email22 = normalizeEmail(val(t, 22));

                await pgDb.run(
                    `INSERT INTO glpi.tickets (glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22, last_sync)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP)
                     ON CONFLICT (glpi_id) DO UPDATE SET
                       title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status, priority = EXCLUDED.priority,
                       urgency = EXCLUDED.urgency, impact = EXCLUDED.impact, category = EXCLUDED.category,
                       type = EXCLUDED.type, date_creation = EXCLUDED.date_creation, date_mod = EXCLUDED.date_mod,
                       date_closed = EXCLUDED.date_closed, date_solved = EXCLUDED.date_solved, location = EXCLUDED.location,
                       solution = EXCLUDED.solution, source = EXCLUDED.source, entity = EXCLUDED.entity,
                       requester_name = EXCLUDED.requester_name, email_alt = EXCLUDED.email_alt,
                       requester_email_22 = EXCLUDED.requester_email_22, last_sync = CURRENT_TIMESTAMP`,
                    [
                        ticketId, val(t, 1), val(t, 62) || '', valInt(t, 12), valInt(t, 3), valInt(t, 10), valInt(t, 11),
                        val(t, 7) || '', val(t, 14) || '', val(t, 15) || '', val(t, 19) || '',
                        val(t, 16) || '', val(t, 17) || '', val(t, 83) || '', val(t, 24) || '', val(t, 9) || '',
                        val(t, 80) || '', val(t, 4) || 'Inconnu', email34, email22
                    ]
                );

            res.json({ 
                glpi_id: ticketId,
                title: val(t, 1), 
                status_label: '', 
                date_creation: val(t, 15), 
                type: val(t, 14), 
                status: val(t, 12), 
                solution: val(t, 24) 
            });
        } else {
            res.status(404).json({ message: 'Ticket non trouvé' });
        }
    } catch (error) {
        console.error('[GLPI] Erreur fetch ticket:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

// Route : Incidents haute priorité non résolus
app.get('/api/magapp/high-priority-incidents', async (req, res) => {
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
        console.error('Erreur high priority incidents:', err);
        res.status(500).json({ message: 'Erreur lecture incidents haute priorité' });
    }
});

// Route : Ajouter un suivi à un ticket existant
app.post('/api/glpi/tickets/:id/followup', authenticateJWT, async (req, res) => {
    const ticketId = req.params.id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'Contenu requis' });

    const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
    if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

    let url = settings.url.trim();
    if (!url.includes('apirest.php')) {
        url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
    }

    const commonHeaders = {
        'App-Token': (settings.app_token || '').trim(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    let authHeader = (settings.user_token || '').trim()
        ? `user_token ${(settings.user_token || '').trim()}`
        : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

    try {
        const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        const followupRes = await axios.post(`${url}/Ticket/${ticketId}/ITILFollowup`, {
            input: {
                itemtype: 'Ticket',
                items_id: parseInt(ticketId),
                content: content,
                is_private: 0
            }
        }, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

        res.json({ success: true, id: followupRes.data?.id });
    } catch (error) {
        console.error('[GLPI] Erreur followup:', error.message);
        res.status(500).json({ message: `Erreur: ${error.message}` });
    }
});

app.get('/api/magapp/observed-tickets', async (req, res) => {
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

        // Résoudre les noms via AD pour les identifiants/matricules
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
                            client.search(adSettings.base_dn, { filter: `(|(sAMAccountName=${sam})(employeeID=${sam})(description=*${sam}*))`, scope: 'sub', attributes: ['displayName', 'cn'] }, (err, searchRes) => {
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
                } catch (e) { /* ignore individual lookup failures */ }
            }
            tickets.rows.forEach(t => {
                const resolved = nameCache[t.requester_name];
                if (resolved) {
                    t.requester_name = resolved;
                } else if (/^\d+$/.test(t.requester_name) && t.requester_email) {
                    // Si c'est un matricule (nombre pur) et qu'on n'a pas pu le résoudre via AD, préférer l'email
                    t.requester_name = t.requester_email.split('@')[0];
                }
            });
        }

        res.json(tickets.rows);
    } catch (err) {
        console.error('Erreur observed tickets list:', err);
        res.status(500).json({ message: 'Erreur lecture tickets observés' });
    }
});

app.get('/api/magapp/tickets-count', async (req, res) => {
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
        console.error('Erreur tickets-count:', err);
        res.status(500).json({ message: 'Erreur lecture tickets' });
    }
});

app.get('/api/magapp/user-subscriptions', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    try {
        const subs = await pgDb.all('SELECT app_id FROM magapp_subscriptions WHERE email = ?', [email]);
        res.json(subs.map(s => s.app_id));
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture abonnements' });
    }
});

app.delete('/api/magapp/user-subscriptions', async (req, res) => {
    const { email, app_id } = req.query;
    if (!email || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await pgDb.run('DELETE FROM magapp_subscriptions WHERE email = ? AND app_id = ?', [email, app_id]);
        res.json({ message: 'Désabonné avec succès' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur désabonnement' });
    }
});

app.get('/api/magapp/subscriptions', authenticateMagappControl, async (req, res) => {
    try {
        const subs = await pgDb.all(`
            SELECT s.*, a.name as app_name 
            FROM magapp_subscriptions s
            JOIN magapp_apps a ON s.app_id = a.id
            ORDER BY a.name, s.email
        `);
        res.json(subs);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture abonnements', error: error.message });
    }
});

app.delete('/api/magapp/subscriptions/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM magapp_subscriptions WHERE id = ?', [req.params.id]);
        res.json({ message: 'Abonnement supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression abonnement', error: error.message });
    }
});

// Route déplacée plus bas pour consolidation (ligne 3979)

app.get('/api/magapp/icons', authenticateJWT, (req, res) => {
    const dir = path.join(__dirname, 'magapp_img');
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const files = fs.readdirSync(dir);
        // Filtrer pour ne garder que les images
        const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f));
        res.json(imageFiles.map(f => `/img/${f}`));
    } catch (err) {
        res.status(500).json({ message: 'Error reading icons', error: err.message });
    }
});

// Added Multer error handling middleware here
app.post('/api/magapp/icons/upload', authenticateJWT, (err, req, res, next) => {
    // Custom Multer error handler
    if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        const logMsg = `Multer Error during upload: ${err.message}`;
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(500).json({ message: 'Erreur lors de la gestion du fichier uploadé', error: err.message });
    } else if (err) {
        // An unknown error occurred when uploading.
        const logMsg = `Unknown Error during upload: ${err.message}`;
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(500).json({ message: "Erreur inconnue lors de l'upload", error: err.message });
    }
    // If no error, proceed to the next middleware/route handler
    next();
}, upload.single('file'), async (req, res) => {
    if (!req.file) {
        const logMsg = 'No file received in /api/magapp/icons/upload';
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(400).send('No file uploaded.');
    }

    try {
        const fileName = req.file.filename;
        const sourcePath = req.file.path;

        // Destination unique dans le dossier statique du backend
        const destPath = path.join(__dirname, 'magapp_img', fileName);

        // S'assurer que le dossier existe
        if (!fs.existsSync(path.dirname(destPath))) fs.mkdirSync(path.dirname(destPath), { recursive: true });

        fs.copyFileSync(sourcePath, destPath);

        // Supprimer le fichier temporaire dans uploads
        fs.unlinkSync(sourcePath);

        res.json({ message: 'Icône uploadée avec succès', path: `/img/${fileName}` });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'upload de l'icône", error: error.message });
    }
});

// Click Statistics API for Admin
app.get('/api/magapp/stats', authenticateJWT, async (req, res) => {
    try {
        const stats = await pgDb.all(`
            SELECT 
                a.id,
                a.name,
                COALESCE(total_info.total_clicks, 0) as total_clicks,
                COALESCE(today_info.today_clicks, 0) as today_clicks,
                CASE WHEN COALESCE(today_info.today_clicks, 0) > 0 THEN 1 ELSE 0 END as has_today_stats,
                ROUND(CAST(COALESCE(total_info.total_clicks, 0) AS NUMERIC) / NULLIF(COALESCE(total_info.total_days, 1), 0), 2) as avg_clicks_per_day,
                ROUND(CAST(COALESCE(total_info.unique_users_total, 0) AS NUMERIC) / NULLIF(COALESCE(total_info.total_days, 1), 0), 2) as avg_unique_users_per_day
            FROM magapp_apps a
            LEFT JOIN (
                SELECT app_id, COUNT(*) as total_clicks, COUNT(DISTINCT DATE(clicked_at)) as total_days, COUNT(DISTINCT COALESCE(username, ip_address)) as unique_users_total
                FROM magapp_clicks GROUP BY app_id
            ) total_info ON a.id = total_info.app_id
            LEFT JOIN (
                SELECT app_id, COUNT(*) as today_clicks
                FROM magapp_clicks 
                WHERE DATE(clicked_at) = CURRENT_DATE
                GROUP BY app_id
            ) today_info ON a.id = today_info.app_id
            ORDER BY a.name ASC
        `);

        res.json(stats);
    } catch (error) {
        console.error('STATS ERROR:', error);
        res.status(500).json({ message: 'Error fetching stats', error: error.message, stack: error.stack });
    }
});

// Admin endpoints for Magapp
app.post('/api/magapp/categories', authenticateMagappControl, async (req, res) => {
    const { name, icon, display_order } = req.body;
    try {
        const result = await pgDb.run('INSERT INTO magapp_categories (name, icon, display_order) VALUES (?, ?, ?)', [name, icon, display_order || 0]);
        res.json({ id: result.lastID, message: 'Catégorie créée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur création', error: error.message });
    }
});

app.put('/api/magapp/categories/:id', authenticateMagappControl, async (req, res) => {
    const { name, icon, display_order } = req.body;
    try {
        await pgDb.run('UPDATE magapp_categories SET name = ?, icon = ?, display_order = ? WHERE id = ?', [name, icon, display_order || 0, req.params.id]);
        res.json({ message: 'Catégorie mise à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
    }
});

app.delete('/api/magapp/categories/:id', authenticateMagappControl, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM magapp_categories WHERE id = ?', [req.params.id]);
        res.json({ message: 'Catégorie supprimée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression', error: error.message });
    }
});

app.post('/api/magapp/upload-icon', authenticateMagappControl, (req, res, next) => {
    upload.single('icon')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error(`[MagApp] Multer Error: ${err.message}`);
            return res.status(500).json({ message: 'Erreur Multer', error: err.message });
        } else if (err) {
            console.error(`[MagApp] Unknown Upload Error: ${err.message}`);
            return res.status(500).json({ message: 'Erreur Upload', error: err.message });
        }
        next();
    });
}, (req, res) => {
    if (!req.file) {
        console.error('[MagApp] Upload failed: No file received');
        return res.status(400).json({ message: 'Aucun fichier envoyé' });
    }
    
    const fileUrl = `/api/img/${req.file.filename}`;
    const logMsg = `Icon uploaded: ${req.file.filename} -> ${fileUrl}`;
    console.log(`[MagApp] ${logMsg}`);
    
    // Log dans mouchard
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}\n`);
    
    res.json({ 
        message: 'Icône uploadée avec succès', 
        url: fileUrl 
    });
});

app.post('/api/magapp/apps', authenticateMagappControl, async (req, res) => {
    const { category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, lien_mercator, mercator_id, mercator_name } = req.body;
    try {
        const result = await pgDb.run('INSERT INTO magapp_apps (category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, lien_mercator, mercator_id, mercator_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [category_id, name, description, url, icon, display_order || 0, is_maintenance ? 1 : 0, maintenance_start || null, maintenance_end || null, app_type || 'Web', present_magapp || 'oui', present_onboard || 'oui', email_createur || '', lien_mercator || '', mercator_id || null, mercator_name || '']);
        res.json({ id: result.lastID, message: 'Application créée' });
    } catch (error) {
        console.error('Erreur création app:', error);
        res.status(500).json({ message: 'Erreur création', error: error.message });
    }
});

app.put('/api/magapp/apps/:id', authenticateMagappControl, async (req, res) => {
    const { category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end, app_type, present_magapp, present_onboard, email_createur, lien_mercator, mercator_id, mercator_name } = req.body;
    try {
        const oldApp = await pgDb.get('SELECT is_maintenance FROM magapp_apps WHERE id = ?', [req.params.id]);

        await pgDb.run('UPDATE magapp_apps SET category_id = ?, name = ?, description = ?, url = ?, icon = ?, display_order = ?, is_maintenance = ?, maintenance_start = ?, maintenance_end = ?, app_type = ?, present_magapp = ?, present_onboard = ?, email_createur = ?, lien_mercator = ?, mercator_id = ?, mercator_name = ? WHERE id = ?', [category_id, name, description, url, icon, display_order || 0, is_maintenance ? 1 : 0, maintenance_start || null, maintenance_end || null, app_type || 'Web', present_magapp || 'oui', present_onboard || 'oui', email_createur || '', lien_mercator || '', mercator_id || null, mercator_name || '', req.params.id]);

        // Si on vient d'activer la maintenance, on prévient les abonnés
        if (is_maintenance && (!oldApp || !oldApp.is_maintenance)) {
            sendMaintenanceEmail(req.params.id).catch(err => console.error("Error in sendMaintenanceEmail:", err));
        }

        res.json({ message: 'Application mise à jour' });
    } catch (error) {
        console.error('Erreur MAJ app:', error);
        res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
    }
});

app.delete('/api/magapp/apps/:id', authenticateMagappControl, async (req, res) => {
    const appId = parseInt(req.params.id);
    console.log(`[MagApp] Delete attempt: id=${appId}`);
    try {
        const result = await pgDb.run('DELETE FROM magapp_apps WHERE id = ?', [appId]);
        console.log(`[MagApp] Delete success: id=${appId}, changes=${result.changes}`);
        res.json({ message: 'Application supprimée' });
    } catch (error) {
        console.error(`[MagApp] Delete error (id=${appId}):`, error);
        res.status(500).json({ message: 'Erreur suppression', error: error.message });
    }
});

// MagApp Settings (Feature flags in Postgres)
app.get('/api/magapp/settings', async (req, res) => {
    try {
        const rawSettings = await pgDb.get('SELECT * FROM magapp.settings LIMIT 1');
        const result = { ...(rawSettings || { show_tickets: true, show_subscriptions: true, show_health_check: true, show_create_buttons: true, show_ideas: true, show_rencontres: true }) };
        // Check if user is admin or has MagApp tile — bypass toggle settings for these buttons
        let isSpecialUser = false;
        try {
            // Try JWT first
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                if (token) {
                    const decoded = jwt.verify(token, SECRET_KEY);
                    if (decoded && (decoded.role === 'admin' || decoded.username?.toLowerCase() === 'admin' || decoded.username?.toLowerCase() === 'adminhub')) {
                        isSpecialUser = true;
                    } else if (decoded && decoded.id) {
                        const tileLink = await db.get(`SELECT 1 FROM user_tiles ut JOIN tile_links tl ON ut.tile_id = tl.tile_id WHERE ut.user_id = ? AND tl.url = '/admin/magapp'`, [decoded.id]);
                        if (tileLink) isSpecialUser = true;
                    }
                }
            }
            // Fallback: check by username/email query param (for MagApp sessions without JWT)
            if (!isSpecialUser) {
                const { username, email } = req.query;
                const identifier = (username || (email && email.split('@')[0]) || '').toLowerCase().trim();
                console.log('[MAGAPP SETTINGS] Query params:', { username, email, identifier });
                if (identifier) {
                    const user = await db.get('SELECT id, role, username FROM users WHERE LOWER(username) = ?', [identifier]);
                    console.log('[MAGAPP SETTINGS] User found:', user ? `${user.username} (id=${user.id}, role=${user.role})` : 'NOT FOUND');
                    if (user) {
                        if (user.role === 'admin' || user.username?.toLowerCase() === 'admin' || user.username?.toLowerCase() === 'adminhub') {
                            isSpecialUser = true;
                        } else {
                            const tileLink = await db.get(`SELECT 1 FROM user_tiles ut JOIN tile_links tl ON ut.tile_id = tl.tile_id WHERE ut.user_id = ? AND tl.url = '/admin/magapp'`, [user.id]);
                            console.log('[MAGAPP SETTINGS] Tile link for /admin/magapp:', tileLink ? 'YES' : 'NO');
                            if (tileLink) isSpecialUser = true;
                        }
                    }
                }
            }
        } catch (e) { console.error('[MAGAPP SETTINGS] Beta check error:', e.message); }
        if (isSpecialUser) {
            result.show_tickets_original = result.show_tickets;
            result.show_subscriptions_original = result.show_subscriptions;
            result.show_health_check_original = result.show_health_check;
            result.show_create_buttons_original = result.show_create_buttons;
            result.show_ideas_original = result.show_ideas;
            result.show_rencontres_original = result.show_rencontres;
            result.show_tickets = true;
            result.show_subscriptions = true;
            result.show_health_check = true;
            result.show_create_buttons = true;
            result.show_ideas = true;
            result.show_rencontres = true;
            result.is_beta_user = true;
        }

        // Vérifier si l'utilisateur a un email dans direction_emails pour les Rencontres Budgétaires
        let hasRencontresAccess = false;
        try {
            const { username, email } = req.query;
            const identifier = (username || (email && email.split('@')[0]) || '').toLowerCase().trim();
            if (identifier) {
                const directionEmail = await db.get('SELECT 1 FROM direction_emails WHERE email LIKE ? OR email LIKE ?', [`${identifier}@%`, `${identifier}%`]);
                hasRencontresAccess = !!directionEmail;
            }
        } catch (e) {
            console.error('[MAGAPP SETTINGS] Rencontres access check error:', e.message);
        }
        result.has_rencontres_access = hasRencontresAccess;

        console.log('[MAGAPP SETTINGS] Result:', JSON.stringify({ is_beta_user: result.is_beta_user, show_create_buttons: result.show_create_buttons, show_ideas: result.show_ideas, has_rencontres_access: hasRencontresAccess }));
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching MagApp settings' });
    }
});

app.post('/api/magapp/settings', authenticateMagappControl, async (req, res) => {
    const { show_tickets, show_subscriptions, show_health_check, show_create_buttons, show_ideas, show_rencontres } = req.body;
    try {
        await pgDb.run('UPDATE magapp.settings SET show_tickets = $1, show_subscriptions = $2, show_health_check = $3, show_create_buttons = $4, show_ideas = $5, show_rencontres = $6 WHERE id = 1',
            [!!show_tickets, !!show_subscriptions, !!show_health_check, !!show_create_buttons, !!show_ideas, !!show_rencontres]);
        res.json({ message: 'Settings updated' });
    } catch (error) {
        console.error('Erreur magapp_settings:', error);
        res.status(500).json({ message: 'Error updating MagApp settings', error: error.message });
    }
});

// App Users Management
app.get('/api/magapp/apps/:id/users', authenticateMagappControl, async (req, res) => {
    console.log('[MAGAPP USERS API] Request received for app ID:', req.params.id);
    try {
        // Fetch data - Use AT TIME ZONE 'UTC' to get the true UTC timestamp
        // (driver converts timestamps by subtracting 2 hours, so we need the explicit UTC conversion)
        const users = await pgDb.all(
            `SELECT id, app_id, username, display_name, source,
                    (last_connection AT TIME ZONE 'UTC') as last_connection
             FROM magapp.app_users
             WHERE app_id = ?
             ORDER BY last_connection DESC NULLS LAST`,
            [req.params.id]
        );
        console.log('[MAGAPP USERS API] Users found:', users.length);

        // Format timestamps to French timezone
        const formattedUsers = users.map(user => {
            let formattedDate = null;
            if (user.last_connection) {
                try {
                    // Handle both Date objects and ISO strings from PostgreSQL
                    let date;
                    if (user.last_connection instanceof Date) {
                        date = user.last_connection;
                    } else {
                        // It's a string - parse it
                        let isoString = String(user.last_connection);

                        // Check if it has timezone info
                        if (isoString.includes('+') || isoString.includes('Z')) {
                            // Already has timezone, parse as-is
                            date = new Date(isoString);
                        } else {
                            // No timezone info - assume UTC and add Z
                            date = new Date(isoString + 'Z');
                        }
                    }

                    // Convert to Paris time by adding 2 hours (UTC+2 in summer, UTC+1 in winter)
                    // For now, we'll add 2 hours (summer time in April)
                    const utcDate = new Date(date.getTime());
                    const parisDate = new Date(utcDate.getTime() + 2 * 60 * 60 * 1000);

                    // Format manually
                    const day = String(parisDate.getUTCDate()).padStart(2, '0');
                    const month = String(parisDate.getUTCMonth() + 1).padStart(2, '0');
                    const year = parisDate.getUTCFullYear();
                    const hours = String(parisDate.getUTCHours()).padStart(2, '0');
                    const minutes = String(parisDate.getUTCMinutes()).padStart(2, '0');

                    formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

                    console.log('[DEBUG] UTC:', date.toISOString(), '-> Paris:', formattedDate);
                } catch (e) {
                    console.error('[DEBUG] Error formatting:', e.message);
                    formattedDate = user.last_connection;
                }
            }
            return {
                id: user.id,
                app_id: user.app_id,
                username: user.username,
                display_name: user.display_name,
                source: user.source,
                last_connection: formattedDate
            };
        });

        res.json(formattedUsers);
    } catch (error) {
        console.error('[MAGAPP] Error fetching users:', error.message);
        res.status(500).json({ message: 'Erreur lors de la recuperation des utilisateurs', error: error.message });
    }
});

app.post('/api/magapp/apps/:id/users', authenticateMagappControl, async (req, res) => {
    const { username, display_name } = req.body;
    if (!username) return res.status(400).json({ message: 'Username requis' });
    try {
        console.log('[ADD USER] Attempting to add user:', { app_id: req.params.id, username, display_name });
        const result = await pgDb.run(`
            INSERT INTO magapp.app_users (app_id, username, display_name, last_connection, source)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'admin')
            ON CONFLICT (app_id, username)
            DO UPDATE SET last_connection = EXCLUDED.last_connection, display_name = EXCLUDED.display_name, source = EXCLUDED.source
        `, [req.params.id, username.toLowerCase(), display_name || username]);
        console.log('[ADD USER] Success:', result);
        res.json({ message: 'Utilisateur ajoute/mis a jour' });
    } catch (error) {
        console.error('[ADD USER] Error:', error);
        res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'utilisateur', error: error.message });
    }
});

app.delete('/api/magapp/apps/:id/users/:username', authenticateMagappControl, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM magapp.app_users WHERE app_id = ? AND username = ?', [req.params.id, req.params.username.toLowerCase()]);
        res.json({ message: 'Utilisateur retire' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
});

// AD Search for Users
app.post('/api/magapp/ad/search', authenticateMagappControl, async (req, res) => {
    const { query } = req.body;
    if (!query || query.length < 2) return res.json([]);
    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(503).json({ message: 'AD Desactive' });
        }

        const results = await new Promise((resolve, reject) => {
            try {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }

                    const filter = `(&(objectClass=user)(|(sAMAccountName=*${query}*)(displayName=*${query}*)(cn=*${query}*)))`;
                    const entries = [];
                    client.search(adSettings.base_dn, {
                        filter,
                        scope: 'sub',
                        attributes: ['sAMAccountName', 'displayName', 'cn', 'mail'],
                        sizeLimit: 20
                    }, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => {
                            const obj = flattenLDAPEntry(entry);
                            if (obj && obj.sAMAccountName) {
                                entries.push(obj);
                            }
                        });
                        searchRes.on('end', () => { client.destroy(); resolve(entries); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            } catch (e) {
                reject(e);
            }
        });

        const mappedResults = Array.isArray(results) ? results.map(r => ({
            username: r.sAMAccountName,
            displayName: r.displayName || r.cn || r.sAMAccountName,
            email: r.mail || ''
        })) : [];
        res.json(mappedResults);
    } catch (error) {
        console.error('[AD SEARCH] Error:', error.message);
        res.status(500).json({ message: 'Erreur lors de la recherche AD', error: error.message });
    }
});

// --- MagApp Versions API (What's New) --- //

// Read all versions (order by descending ID/Date)
app.get('/api/magapp/versions', async (req, res) => {
    try {
        const versions = await pgDb.all('SELECT * FROM magapp.versions ORDER BY release_date DESC');
        res.json(versions);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching MagApp versions', error: error.message });
    }
});

// Admin CRUD pour les versions
app.post('/api/admin/magapp/versions', authenticateMagappControl, async (req, res) => {
    const { version_number, release_notes_html } = req.body;
    try {
        const result = await pgDb.run(
            'INSERT INTO magapp.versions (version_number, release_notes_html) VALUES (?, ?)',
            [version_number, release_notes_html || '']
        );
        res.json({ id: result.lastID, message: 'Version créée' });
    } catch (error) {
        console.error('Erreur creation version:', error);
        res.status(500).json({ message: 'Erreur création de version', error: error.message });
    }
});

app.put('/api/admin/magapp/versions/:id', authenticateMagappControl, async (req, res) => {
    const { version_number, release_notes_html } = req.body;
    try {
        await pgDb.run(
            'UPDATE magapp.versions SET version_number = ?, release_notes_html = ? WHERE id = ?',
            [version_number, release_notes_html, req.params.id]
        );
        res.json({ message: 'Version mise à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour de version', error: error.message });
    }
});

app.delete('/api/admin/magapp/versions/:id', authenticateMagappControl, async (req, res) => {
    try {
        const id = req.params.id;
        console.log(`[ADMIN] Suppression de la version ID: ${id} par ${req.user.username}`);
        
        // On pourrait vérifier si elle est active ici, mais l'utilisateur a confirmé vouloir pouvoir la supprimer
        const result = await pgDb.run('DELETE FROM magapp.versions WHERE id = ?', [parseInt(id)]);
        
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Version non trouvée' });
        }
        
        res.json({ message: 'Version supprimée' });
    } catch (error) {
        console.error('Erreur suppression version:', error);
        res.status(500).json({ message: 'Erreur suppression de version', error: error.message });
    }
});

app.put('/api/admin/magapp/versions/:id/activate', authenticateMagappControl, async (req, res) => {
    try {
        // Only one version can be active at a time
        await pgDb.run('UPDATE magapp.versions SET is_active = FALSE');
        await pgDb.run('UPDATE magapp.versions SET is_active = TRUE WHERE id = ?', [req.params.id]);
        res.json({ message: 'Version définie comme principale (active)' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur bascule de version', error: error.message });
    }
});

// User Version Preferences (Has the user seen the active version?)
app.get('/api/magapp/user-version', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username;
        let pref = await pgDb.get('SELECT * FROM magapp.user_versions WHERE username = ?', [username]);
        if (!pref) {
            pref = { username, last_seen_version_id: null };
        }
        res.json(pref);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user version prefs', error: error.message });
    }
});

app.post('/api/magapp/user-version', authenticateJWT, async (req, res) => {
    const { version_id } = req.body;
    const username = req.user.username;
    try {
        // pgDb.run ajoute automatiquement RETURNING id aux INSERT,
        // mais user_versions n'a pas de colonne id. On fait un SELECT + INSERT/UPDATE.
        const existing = await pgDb.get('SELECT username FROM magapp.user_versions WHERE username = ?', [username]);
        if (existing) {
            await pgDb.run('UPDATE magapp.user_versions SET last_seen_version_id = ?, seen_at = CURRENT_TIMESTAMP WHERE username = ?', [version_id, username]);
        } else {
            // Use pgDb.all for INSERT to avoid pgDb.run's automatic RETURNING id
            await pgDb.all(
                `INSERT INTO magapp.user_versions (username, last_seen_version_id, seen_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [username, version_id]
            );
        }
        res.json({ message: 'Version vue enregistrée' });
    } catch (error) {
        console.error('Erreur maj user_version:', error);
        res.status(500).json({ message: 'Error updating user version pref', error: error.message });
    }
});

// Endpoint pour vérifier les observateurs GLPI stockés
app.get('/api/glpi/observers-list', async (req, res) => {
    try {
        // Vérifier si la table existe dans PostgreSQL
        const tableCheck = await pgDb.get(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'glpi'
                AND table_name = 'observers'
            ) as exists
        `);

        if (!tableCheck || !tableCheck.exists) {
            return res.json({
                status: 'missing',
                message: 'Table glpi.observers n\'existe pas',
                count: 0,
                observers: []
            });
        }

        // Table existe, récupérer les données
        const count = await pgDb.get("SELECT COUNT(*) as count FROM glpi.observers");
        const observers = await pgDb.all("SELECT * FROM glpi.observers ORDER BY name");

        res.json({
            status: 'exists',
            count: count.count,
            observers: observers
        });

    } catch (err) {
        res.status(500).json({
            error: err.message,
            message: 'Erreur accès table glpi.observers'
        });
    }
});

// Test endpoint - Récupérer directement les observateurs depuis GLPI
app.post('/api/glpi/test-fetch-observers', async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        console.log('[TEST] GLPI Settings:', { url: settings?.url, is_enabled: settings?.is_enabled });

        if (!settings || !settings.url) {
            return res.status(400).json({
                message: 'GLPI non configuré',
                configured: false
            });
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const app_token = (settings.app_token || '').trim();
        const user_token = (settings.user_token || '').trim();
        const login = (settings.login || '').trim();
        const password = (settings.password || '').trim();

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = login && password
            ? `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
            : `user_token ${user_token}`;

        // Init session
        console.log('[TEST] Initializing GLPI session...');
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) {
            return res.status(401).json({ message: 'Impossible de créer session GLPI' });
        }

        console.log('[TEST] Session OK, fetching users...');

        // Récupérer les users
        const usersRes = await axios.get(
            `${url}/search/User?session_token=${sessionToken}&get_all_entities=1&forcedisplay[1]=1&forcedisplay[2]=2&forcedisplay[14]=14&range=0-10000`,
            { headers: commonHeaders, timeout: 30000 }
        );

        const totalUsers = usersRes.data.data.length;
        console.log(`[TEST] Total users found: ${totalUsers}`);

        // Filtrer observateurs
        const potentialObservers = [];
        for (const user of usersRes.data.data) {
            if (user[1]) {
                try {
                    const userDetailsRes = await axios.get(`${url}/User/${user[2]}?session_token=${sessionToken}`, {
                        headers: commonHeaders,
                        timeout: 10000
                    });

                    const userDetails = userDetailsRes.data;
                    const roles = userDetails._profiles || [];
                    const isObserver = roles.some(role => role && (role.name === 'Observateur' || role === 'Observateur'));

                    if (isObserver || userDetails.is_observer || userDetails.profile_name === 'Observateur') {
                        potentialObservers.push({
                            id: user[2],
                            name: user[1],
                            login: user[14] || '',
                            roles: roles,
                            is_observer: isObserver
                        });
                    }
                } catch (e) {
                    console.warn(`[TEST] Error getting user ${user[2]}:`, e.message);
                }
            }
        }

        // Kill session
        await axios.get(`${url}/killSession?session_token=${sessionToken}`, {
            headers: commonHeaders,
            timeout: 10000
        });

        res.json({
            success: true,
            total_users: totalUsers,
            observers_found: potentialObservers.length,
            observers: potentialObservers
        });

    } catch (err) {
        console.error('[TEST] Error:', err.message);
        res.status(500).json({
            error: err.message,
            message: 'Erreur test récupération observateurs'
        });
    }
});

// Route : Récupérer les utilisateurs GLPI avec le rôle "Observateur"
app.get('/api/glpi/observers', authenticateAdmin, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ message: 'Base de données non initialisée' });
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

        let url = settings.url.trim();
        const app_token = (settings.app_token || '').trim();
        const user_token = (settings.user_token || '').trim();
        const login = (settings.login || '').trim();
        const password = (settings.password || '').trim();

        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = login && password
            ? `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
            : `user_token ${user_token}`;

        // Initialiser la session
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) {
            return res.status(401).json({ message: 'Echec initialisation session GLPI' });
        }

        // Récupérer les utilisateurs avec leurs profils
        // En GLPI, les observateurs ont un niveau d'accès spécifique
        const usersRes = await axios.get(`${url}/search/User?session_token=${sessionToken}&get_all_entities=1&forcedisplay[1]=1&forcedisplay[2]=2&forcedisplay[14]=14&range=0-10000`, {
            headers: commonHeaders,
            timeout: 30000
        });

        // Filtrer les utilisateurs avec le rôle "Observateur"
        const observers = [];
        if (usersRes.data.data && Array.isArray(usersRes.data.data)) {
            for (const user of usersRes.data.data) {
                if (user[1]) {
                    try {
                        const userDetailsRes = await axios.get(`${url}/User/${user[2]}?session_token=${sessionToken}`, {
                            headers: commonHeaders,
                            timeout: 10000
                        });

                        const userDetails = userDetailsRes.data;
                        const roles = userDetails._profiles || [];
                        const isObserver = roles.some(role => role && (role.name === 'Observateur' || role === 'Observateur'));

                        if (isObserver || userDetails.is_observer || userDetails.profile_name === 'Observateur') {
                            observers.push({
                                id: user[2],
                                name: user[1],
                                login: user[14] || '',
                                roles: roles,
                                is_active: userDetails.is_active !== 0
                            });
                        }
                    } catch (e) {
                        console.warn(`[GLPI Observers] Erreur récupération détails utilisateur ${user[2]}:`, e.message);
                    }
                }
            }
        }

        // Terminer la session
        await axios.get(`${url}/killSession?session_token=${sessionToken}`, {
            headers: commonHeaders,
            timeout: 10000
        });

        res.json({ observers, count: observers.length });
    } catch (e) {
        const msg = e.response?.data?.[1] || e.response?.data?.message || e.message;
        console.error('[GLPI Observers] Erreur:', msg);
        res.status(500).json({ message: `Erreur récupération observateurs : ${msg}` });
    }
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

// Certificates API
app.get('/api/certificates', authenticateJWT, async (req, res) => {
    try {
        const certs = await db.all('SELECT * FROM certificates ORDER BY request_date DESC, uploaded_at DESC');
        res.json(certs);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching certificates', error: error.message });
    }
});

app.delete('/api/certificates/:id', authenticateAdmin, async (req, res) => {
    try {
        const cert = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
        if (!cert) return res.status(404).json({ message: 'Certificat non trouvé' });

        // Suppression physique du fichier
        if (cert.file_path) {
            const fullPath = path.join(__dirname, cert.file_path);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                console.log(`Fichier supprimé: ${fullPath}`);
            }
        }

        await db.run('DELETE FROM certificates WHERE id = ?', [req.params.id]);

        const logMsg = `Certificat supprimé: ID ${req.params.id} (${cert.order_number})`;
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

        res.json({ message: 'Certificat supprimé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
});

app.put('/api/certificates/:id/expiry', authenticateJWT, async (req, res) => {
    const { expiry_date } = req.body;
    try {
        await db.run('UPDATE certificates SET expiry_date = ?, is_provisional = 0 WHERE id = ?', [expiry_date, req.params.id]);
        res.json({ message: 'Date de validité mise à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
});

app.post('/api/certificates/upload', authenticateJWT, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const logMsg = `Multer Error during upload: ${err.message}`;
            console.error(logMsg);
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
            return res.status(500).json({ message: 'Erreur Multer', error: err.message });
        }
        next();
    });
}, async (req, res) => {
    if (!req.file) {
        const logMsg = 'No file received in /api/certificates/upload';
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(400).send('No file uploaded.');
    }

    try {
        const filePath = req.file.path;
        const fileName = req.file.originalname;
        let content = '';

        const logMsg = `Processing file: ${filePath}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

        if (fileName.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            content = pdfData.text;
            const logParsed = `PDF Parsed successfully. Text length: ${content.length}`;
            console.log(logParsed);
            fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ${logParsed}
`);
        } else {
            fs.unlinkSync(filePath);
            return res.status(400).json({ message: 'Seuls les fichiers PDF sont acceptés pour les certificats.' });
        }

        // "AI" Extraction using Regex (simulating intelligence)
        // Example: BD1293791132-60572, 02/03/2026, JEAN FRANCOIS LORES, jflores@ivry94.fr, OE2-DMT-MKY-3A, Dématérialisation - G2 - 3 ans
        const orderMatch = content.match(/BD\d+-\d+/);
        const dateMatch = content.match(/\d{2}\/\d{2}\/\d{4}/);
        let emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            emailMatch[0] = emailMatch[0].replace(/^[A-Z]{2,}(?=[a-z])/, '');
        }
        const productCodeMatch = content.match(/(OE2|OP2)-[A-Z0-9-]+/);

        // Helper to format DD/MM/YYYY to YYYY-MM-DD
        const formatDateToISO = (dateStr) => {
            if (!dateStr) return null;
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
            return dateStr;
        };

        const addDays = (dateStr, days) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            date.setDate(date.getDate() + days);
            return date.toISOString().split('T')[0];
        };

        const addYears = (dateStr, years) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            date.setFullYear(date.getFullYear() + years);
            return date.toISOString().split('T')[0];
        };

        const data = {
            order_number: orderMatch ? orderMatch[0] : 'Inconnu',
            request_date: dateMatch ? formatDateToISO(dateMatch[0]) : new Date().toISOString().split('T')[0],
            beneficiary_name: 'Inconnu',
            beneficiary_email: emailMatch ? emailMatch[0] : 'Inconnu',
            product_code: productCodeMatch ? productCodeMatch[0] : 'Inconnu',
            product_label: 'Certificat Standard',
            file_path: `file_certif/${req.file.filename}`,
            is_provisional: 1
        };

        // 1. Extraction directe du libellé dans le PDF (Champ LIBELLE : ...)
        const libelleMatch = content.match(/LIBELLE\s*:\s*([^ \n]+.*)/i);
        if (libelleMatch) {
            data.product_label = libelleMatch[1].trim();
        } else {
            // 2. Fallback : Détermination du libellé produit intelligente
            let type = 'Standard';
            if (data.product_code.startsWith('OP2') || data.product_code.includes('AUTH') || content.toUpperCase().includes('AGENT')) {
                type = 'Agents - G2';
            } else if (data.product_code.startsWith('OE2') || data.product_code.includes('DMT') || content.includes('Dématérialisation')) {
                type = 'Dématérialisation - G2';
            } else if (data.product_code.includes('SRV') || content.toUpperCase().includes('SERVEUR')) {
                type = 'Serveur - SSL';
            }

            let duration = '2 ans'; // Par défaut
            if (data.product_code.endsWith('3A') || content.includes('3 ans')) {
                duration = '3 ans';
            } else if (data.product_code.endsWith('2A') || content.includes('2 ans')) {
                duration = '2 ans';
            }

            if (type !== 'Standard') {
                data.product_label = `${type} - ${duration}`;
            } else {
                data.product_label = 'Certificat Standard';
            }
        }

        // Calcul de la date de validité basée sur la durée (fin du libellé)
        const durationMatch = data.product_label.match(/(\d+)\s*ans?/i);
        if (durationMatch) {
            data.expiry_date = addYears(data.request_date, parseInt(durationMatch[1]));
        } else {
            data.expiry_date = addDays(data.request_date, 15);
        }

        // Extraction du nom du bénéficiaire améliorée
        // ... (extraction name logic unchanged) ...
        const prefNomMatch = content.match(/PRENOM \/ NOM\s*:\s*([^ \n]+.*)/i);
        if (prefNomMatch) {
            data.beneficiary_name = prefNomMatch[1].trim();
        } else {
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (productCodeMatch && emailMatch) {
                for (const line of lines) {
                    if (line.includes(productCodeMatch[0]) && line.includes(emailMatch[0])) {
                        let namePart = line.replace(productCodeMatch[0], '').replace(emailMatch[0], '').trim();
                        if (namePart.length > 2) {
                            data.beneficiary_name = namePart;
                            break;
                        }
                    }
                }
            }
            if (data.beneficiary_name === 'Inconnu') {
                for (const line of lines) {
                    if (line.toUpperCase().includes('JEAN FRANCOIS') && !line.includes('MANDATAIRE')) {
                        let cleaned = line.replace(/\d{2}\/\d{2}\/\d{4}/g, '').replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '').replace(/BD\d+-\d+/g, '').replace(/PRENOM \/ NOM\s*:/i, '').replace(/,/g, ' ').trim();
                        if (cleaned.length > 2) {
                            data.beneficiary_name = cleaned;
                            break;
                        }
                    }
                }
            }
        }

        // Vérifier si le certificat existe déjà (par numéro de commande)
        const existing = await db.get('SELECT id, file_path, is_provisional FROM certificates WHERE order_number = ?', [data.order_number]);

        let result;
        if (existing && data.order_number !== 'Inconnu') {
            // Mise à jour (on garde is_provisional existant s'il était déjà à 0, sinon on met à jour)
            const finalProvisional = existing.is_provisional === 0 ? 0 : 1;
            await db.run(
                `UPDATE certificates SET 
                    request_date = ?, 
                    beneficiary_name = ?, 
                    beneficiary_email = ?, 
                    product_code = ?, 
                    product_label = ?, 
                    file_path = ?,
                    expiry_date = ?,
                    is_provisional = ?
                 WHERE id = ?`,
                [data.request_date, data.beneficiary_name, data.beneficiary_email, data.product_code, data.product_label, data.file_path, data.expiry_date, finalProvisional, existing.id]
            );
            // ... (unlink logic unchanged) ...
            if (existing.file_path && existing.file_path !== data.file_path) {
                try {
                    const oldPath = path.join(__dirname, existing.file_path);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                } catch (e) { }
            }
            result = { lastID: existing.id };
        } else {
            // Insertion
            result = await db.run(
                `INSERT INTO certificates (order_number, request_date, beneficiary_name, beneficiary_email, product_code, product_label, file_path, expiry_date, is_provisional) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.order_number, data.request_date, data.beneficiary_name, data.beneficiary_email, data.product_code, data.product_label, data.file_path, data.expiry_date, data.is_provisional]
            );
        }

        res.json({ id: result.lastID, ...data });
    } catch (error) {
        const logErr = `Certif upload error: ${error.message}
Stack: ${error.stack}`;
        console.error(logErr);
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${new Date().toISOString()}] ERREUR CRITIQUE: ${logErr}
`);
        res.status(500).json({ message: 'Error processing certificate PDF', error: error.message });
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

// Tiers API
app.get('/api/tiers', authenticateJWT, async (req, res) => {
    try {
        const showAll = req.query.all === 'true';

        let query = `
            SELECT t.*, 
                   COALESCE(ts.order_count, 0) as order_count, 
                   COALESCE(ts.invoice_count, 0) as invoice_count,
                   (SELECT COUNT(*) FROM contacts c WHERE c.tier_id = t.id AND c.is_order_recipient = 1) as has_order_recipient
            FROM tiers t
            LEFT JOIN tier_stats ts ON t.id = ts.tier_id
        `;
        if (!showAll) {
            query += `
                WHERE LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM v_orders)
                   OR LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM invoices)
            `;
        }

        query += ` ORDER BY t.nom`;

        const tiers = await db.all(query);

        // Global stats for the view
        const globalStats = await db.get(`
            SELECT 
                (SELECT COUNT(*) FROM v_orders) as total_orders,
                (SELECT COUNT(*) FROM invoices) as total_invoices,
                (SELECT COUNT(*) FROM tiers) as total_tiers_all,
                (SELECT COUNT(DISTINCT LOWER(TRIM(t.nom))) FROM tiers t WHERE LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM v_orders) OR LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM invoices)) as total_tiers_dsi
        `);

        res.json({ tiers, stats: globalStats || { total_orders: 0, total_invoices: 0, total_tiers_all: 0, total_tiers_dsi: 0 } });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des tiers', error: error.message });
    }
});

app.post('/api/tiers/import', authenticateAdminOrFinances, uploadMemory.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let updated = 0;
        let created = 0;

        for (const row of data) {
            const code = row['Code'];
            if (!code) continue;

            const existing = await db.get('SELECT id FROM tiers WHERE code = ?', [code]);

            if (existing) {
                // Mise à jour sans changer l'ID pour préserver les relations (contacts)
                await db.run(`
                    UPDATE tiers SET 
                        nom = ?, activite = ?, siret = ?, adresse = ?, banque = ?, 
                        guichet = ?, compte = ?, cle_rib = ?, date_creation = ?, 
                        telephone = ?, fax = ?, tva_intra = ?, email = ?, origine = ?
                    WHERE id = ?
                `, [
                    row['Nom'] ? row['Nom'].trim() : null,
                    row['Activité'],
                    row['SIRET'],
                    row['Adresse (Usuelle)'],
                    row['Banque'],
                    row['Guichet'],
                    row['N° compte'],
                    row['Clé RIB'],
                    row['Date de création'],
                    row['Téléphone'],
                    row['Fax'],
                    row['Tva Intra'],
                    row['Email'],
                    row['Origine'],
                    existing.id
                ]);
                updated++;
            } else {
                // Insertion d'un nouveau tiers
                await db.run(`
                    INSERT INTO tiers (
                        code, nom, activite, siret, adresse, banque, guichet, 
                        compte, cle_rib, date_creation, telephone, fax, 
                        tva_intra, email, origine
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    code,
                    row['Nom'] ? row['Nom'].trim() : null,
                    row['Activité'],
                    row['SIRET'],
                    row['Adresse (Usuelle)'],
                    row['Banque'],
                    row['Guichet'],
                    row['N° compte'],
                    row['Clé RIB'],
                    row['Date de création'],
                    row['Téléphone'],
                    row['Fax'],
                    row['Tva Intra'],
                    row['Email'],
                    row['Origine']
                ]);
                created++;
            }
        }

        await updateTierStats(db);

        const msg = `Import Excel tiers: ${created} créés, ${updated} mis à jour`;
        const time = new Date().toISOString();
        fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), `[${time}] POST /api/tiers/import - 200 - par ${req.user.username}: ${msg}
`);

        res.json({ message: 'Import réussi', created, updated });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: "Erreur lors de l'import", error: error.message });
    }
});

app.get('/api/tiers/:id/contacts', authenticateJWT, async (req, res) => {
    try {
        const contacts = await db.all('SELECT * FROM contacts WHERE tier_id = ?', [req.params.id]);
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: 'Erreur contacts', error: error.message });
    }
});

// Route de secours compatible avec l'ancienne version du frontend
app.get('/api/tiers/:id/oracle_commande', authenticateJWT, async (req, res) => {
    console.log(`Fallback oracle_commande route called for ID: ${req.params.id}`);
    res.redirect(`/api/tiers/${req.params.id}/history`);
});

app.get('/api/tiers/:id/history', authenticateJWT, async (req, res) => {
    try {
        const tier = await db.get('SELECT nom FROM tiers WHERE id = ?', [req.params.id]);
        if (!tier) return res.status(404).json({ message: 'Tiers non trouvé' });

        const tierNom = tier.nom.trim();

        // Recherche robuste
        const oracle_commande = await db.all('SELECT * FROM v_orders WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?)) OR "Fournisseur" LIKE ?', [tierNom, `%${tierNom}%`]);
        const invoices = await db.all('SELECT * FROM invoices WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?)) OR "Fournisseur" LIKE ?', [tierNom, `%${tierNom}%`]);

        console.log(`Found ${oracle_commande.length} oracle_commande and ${invoices.length} invoices for ${tierNom}`);

        // Version ultra-simplifiée pour test
        const invoicesList = invoices.map(inv => ({
            number: inv['N° Facture fournisseur'] || inv['N° Facture interne'] || 'Inconnu',
            total_ttc: parseFloat(String(inv['Montant TTC']).replace(',', '.').replace(/[^\d.-]/g, '')) || 0,
            lines: [inv],
            hasFile: false,
            filePath: null
        }));

        res.json({
            oracle_commande: oracle_commande.map(o => ({ ...o, matchedInvoices: [] })),
            invoices: invoicesList
        });
    } catch (error) {
        console.error('Erreur historique:', error);
        res.status(500).json({ message: 'Erreur historique', error: error.message });
    }
});

app.post('/api/tiers/:tierId/contacts', authenticateJWT, async (req, res) => {
    const { nom, prenom, role, telephone, email, commentaire, is_order_recipient } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO contacts (tier_id, nom, prenom, role, telephone, email, commentaire, is_order_recipient) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.tierId, nom, prenom, role, telephone, email, commentaire, is_order_recipient ? 1 : 0]
        );
        res.json({ id: result.lastID, message: 'Contact ajouté' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur ajout contact', error: error.message });
    }
});

app.put('/api/contacts/:id', authenticateJWT, async (req, res) => {
    const { nom, prenom, role, telephone, email, commentaire, is_order_recipient } = req.body;
    try {
        await db.run(
            'UPDATE contacts SET nom = ?, prenom = ?, role = ?, telephone = ?, email = ?, commentaire = ?, is_order_recipient = ? WHERE id = ?',
            [nom, prenom, role, telephone, email, commentaire, is_order_recipient ? 1 : 0, req.params.id]
        );
        res.json({ message: 'Contact mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour contact', error: error.message });
    }
});

app.delete('/api/contacts/:id', authenticateJWT, async (req, res) => {
    try {
        await db.run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
        res.json({ message: 'Contact supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression contact', error: error.message });
    }
});

// Budget & Invoices & Operations API
app.get('/api/budget/lines', authenticateJWT, async (req, res) => {
    const { fiscalYear, budgetScope } = req.query;
    let query = 'SELECT * FROM budget_lines';
    const params = [];
    const where = [];

    const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
    const principalBudgetLibelle = principalBudgetSetting ? principalBudgetSetting.setting_value : 'Ville';

    if (budgetScope === 'Ville' && fiscalYear) {
        // For budget_lines, 'Ville' is the magic word in the 'Budget' column if not linked to a budgetId
        // But since we have a 'budgets' table, we try to match the label 'Ville'
        where.push('("Budget" = ? OR budgetId IN (SELECT id FROM budgets WHERE Libelle = ? AND Annee = ?))');
        params.push('Ville', 'Ville', parseInt(fiscalYear));
    } else if (fiscalYear) {
        where.push('(year = ? OR budgetId IN (SELECT id FROM budgets WHERE Annee = ?))');
        params.push(parseInt(fiscalYear), parseInt(fiscalYear));
    }

    if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

    const logMsg = `[${new Date().toISOString()}] Query Lines: ${query}, Params: ${JSON.stringify(params)}\n`;
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), logMsg);

    const lines = await db.all(query, params);
    res.json(lines);
});

app.get('/api/budget/invoices', authenticateJWT, async (req, res) => {
    const { fiscalYear, budgetScope } = req.query;
    let query = 'SELECT * FROM v_invoices';
    const params = [];
    const where = [];

    const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
    const principalBudgetLibelle = principalBudgetSetting ? principalBudgetSetting.setting_value : 'Ville';

    if (budgetScope === 'Ville' && fiscalYear) {
        // Use the mapped BUDGET_CODE from our view
        where.push('TRIM(BUDGET_CODE) = ?');

        const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
        const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';
        params.push(principalBudgetRef);

        if (fiscalYear) {
            where.push('("Exercice" = ? OR substr("Arrivée", 1, 4) = ?)');
            params.push(String(fiscalYear), String(fiscalYear));
        }
    } else if (fiscalYear) {
        where.push('("Exercice" = ? OR substr("Arrivée", 1, 4) = ? OR budgetId IN (SELECT id FROM budgets WHERE Annee = ?))');
        params.push(String(fiscalYear), String(fiscalYear), parseInt(fiscalYear));
    }

    if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

    const logMsg = `[${new Date().toISOString()}] Query Invoices: ${query}, Params: ${JSON.stringify(params)}\n`;
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), logMsg);

    const invoices = await db.all(query, params);
    res.json(invoices);
});

app.get('/api/budget/operations', authenticateJWT, async (req, res) => {
    const { fiscalYear, budgetScope } = req.query;
    let query = 'SELECT * FROM operations';
    const params = [];
    const where = [];

    if (fiscalYear) {
        where.push('exercice = ?');
        params.push(fiscalYear);
    }

    if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

    try {
        const operations = await db.all(query, params);
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
    const line = `[${time}] ${msg}
`;
    fs.appendFileSync(path.join(__dirname, 'logs', 'mouchard.log'), line);
    console.log(line);
};

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

// Scan Excel file for the first year in "Exercice" column
app.post('/api/budget/scan-exercice', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (data.length === 0) return res.json({ year: null });

        // Find the first non-empty "Exercice" value
        const firstRow = data.find(row => row.Exercice || row.exercice || row.Annee || row.year);
        const year = firstRow ? (firstRow.Exercice || firstRow.exercice || firstRow.Annee || firstRow.year) : null;

        res.json({ year: year ? parseInt(year) : null });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors du scan du fichier", error: error.message });
    }
});

// Import Budget Lines from Excel
app.post('/api/budget/import-lines', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const budgetId = req.body.budgetId;
    if (!budgetId) return res.status(400).send('budgetId is required.');

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
            } catch (e) { }
            try {
                await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['lines', col, col, 1]);
            } catch (e) { }
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

            const bodyYear = req.body.year ? parseInt(req.body.year) : 2026;
            const year = row.Annee || row.year || row.Exercice || bodyYear;

            // Prepare mapped row using only columns that exist in DB
            const mappedRow = { budgetId };

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

            // Check if exists for this budget AND code AND year
            const exists = await db.get('SELECT id FROM budget_lines WHERE ("Code" = ? OR code = ?) AND year = ? AND budgetId = ?', [code, code, year, budgetId]);

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
        res.status(500).json({ message: "Erreur lors de l'import", error: error.message });
    }
});

// Import Invoices from Excel
app.post('/api/budget/import-invoices', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const budgetId = req.body.budgetId;
    if (!budgetId) return res.status(400).send('budgetId is required.');

    let currentStep = 'Reading file';
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { cellDates: true });

        if (data.length === 0) return res.json({ message: 'Le fichier est vide' });

        currentStep = 'Clearing existing data';
        // Clear existing data for this budget instead of dropping table
        await db.run('DELETE FROM gf.invoices WHERE budgetId = ?', [budgetId]);

        currentStep = 'Preparing columns';
        const excelCols = Object.keys(data[0]);
        const tableColsInfo = await db.all("PRAGMA gf.table_info(invoices)");
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
            const mappedRow = { budgetId };
            Object.keys(row).forEach(excelKey => {
                const dbKey = getDbKey(excelKey);
                if (dbKey) {
                    let val = row[excelKey];

                    const dateFields = ['Emission', 'Arrivée', 'Début DGP', 'Fin DGP', 'Date Réception Pièce', 'Date Suspension'];
                    if (dateFields.includes(dbKey)) {
                        if (val === undefined || val === null || val === '') {
                            val = null;
                        } else if (typeof val === 'number') {
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
            const sql = `INSERT INTO gf.invoices (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders})`;

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
        await updateTierStats(db);
        res.json({ message: `${imported} factures importées avec succès pour ce budget` });
    } catch (error) {
        console.error(`Import error during ${currentStep}:`, error);
        res.status(500).json({ message: `Erreur lors de l'import (${currentStep})`, error: error.message });
    }
});

// Import Orders from Excel
app.post('/api/orders/import', authenticateAdminOrFinances, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const budgetId = req.body.budgetId;
    if (!budgetId) return res.status(400).send('budgetId is required.');

    let currentStep = 'Reading file';
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { cellDates: true });

        if (data.length === 0) return res.json({ message: 'Le fichier est vide' });

        currentStep = 'Clearing existing data';
        await db.run('DELETE FROM gf.oracle_commande WHERE budgetId = ?', [budgetId]);

        currentStep = 'Preparing columns';
        const excelCols = Object.keys(data[0]);
        const tableColsInfo = await db.all("PRAGMA gf.table_info(oracle_commande)");
        const tableCols = tableColsInfo.map(c => c.name);

        for (const col of excelCols) {
            if (!tableCols.includes(col)) {
                try {
                    await db.run(`ALTER TABLE gf.oracle_commande ADD COLUMN "${col}" TEXT`);
                } catch (e) { }
            }
            await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, ?)', ['oracle_commande', col, col, 1]);
        }

        currentStep = 'Inserting rows';
        let imported = 0;

        for (const row of data) {
            const keys = Object.keys(row);
            const values = Object.values(row);

            // Add budgetId to insertion
            const finalKeys = [...keys, 'budgetId'];
            const finalValues = [...values, budgetId];

            const placeholders = finalKeys.map(() => '?').join(',');
            const sql = `INSERT INTO gf.oracle_commande (${finalKeys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders})`;

            try {
                await db.run(sql, finalValues);
                imported++;
            } catch (err) {
                console.error(`Row insertion error at row ${imported + 1}:`, err.message);
                throw new Error(`Erreur SQL à la ligne ${imported + 1} : ${err.message}`);
            }
        }

        currentStep = 'Recalculating operations';
        await recalculateAllOperations();

        currentStep = 'Updating tier stats';
        await updateTierStats(db);

        currentStep = 'Logging import';
        await db.run('INSERT INTO import_logs (type, username) VALUES (?, ?)', ['oracle_commande', req.user.username]);

        res.json({ message: `${imported} commandes importées avec succès pour ce budget` });
    } catch (error) {
        console.error(`Import error during ${currentStep}:`, error);
        res.status(500).json({ message: `Erreur lors de l'import (${currentStep})`, error: error.message });
    }
});

app.get('/api/orders/years', authenticateJWT, async (req, res) => {
    try {
        const rows = await db.all("SELECT DISTINCT substr(date, 1, 4) as year FROM v_orders WHERE date IS NOT NULL AND date != '' ORDER BY year DESC");
        const years = rows.map(r => parseInt(r.year)).filter(y => !isNaN(y) && y > 2000);
        res.json(years);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Orders API
app.get('/api/orders', authenticateJWT, async (req, res) => {
    const { fiscalYear, budgetScope } = req.query;

    // Découverte dynamique des colonnes de v_orders
    const viewColsInfo = await db.all("PRAGMA table_info(v_orders)");
    const excludedInternal = ['id', 'operation_id', 'budgetId', 'order_number', 'description', 'provider', 'amount_ht', 'date'];

    for (const col of viewColsInfo) {
        if (!excludedInternal.includes(col.name)) {
            await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, 1)', ['orders', col.name, col.name]);
        }
    }

    // Get visible columns from settings first
    const settings = await db.all("SELECT column_key FROM column_settings WHERE page = 'orders' AND is_visible = 1");
    const validKeys = settings.map(s => s.column_key);

    let query = `
        SELECT o.*, op.LIBELLE as operation_label 
        FROM v_orders o 
        LEFT JOIN operations op ON o.operation_id = op.id
    `;
    const params = [];

    // On s'assure d'avoir au moins une clause WHERE si fiscalYear est présent
    const whereClauses = [];
    const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
    const principalBudgetLibelle = principalBudgetSetting ? principalBudgetSetting.setting_value : 'Ville';

    if (budgetScope === 'Ville' && fiscalYear) {
        const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
        const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';

        whereClauses.push('TRIM(o.BUDGET_ROO_IMA_REF) = ?');
        params.push(principalBudgetRef);

        if (fiscalYear) {
            whereClauses.push('o.date LIKE ?');
            params.push(`${fiscalYear}%`);
        }
    } else if (fiscalYear) {
        whereClauses.push('(o.date LIKE ? OR o.budgetId IN (SELECT id FROM budgets WHERE Annee = ?))');
        params.push(`${fiscalYear}%`, parseInt(fiscalYear));
    }

    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY o.id';

    const results = await db.all(query, params);

    // Clean each order object
    const cleanedOrders = results.map(order => {
        const cleaned = {
            id: order.id,
            operation_id: order.operation_id,
            operation_label: order.operation_label,
            section: order.section || order.Section || ''
        };
        // Exposer toutes les colonnes de la vue + colonnes mappées
        viewColsInfo.forEach(c => {
            cleaned[c.name] = order[c.name];
        });
        // S'assurer que les clés demandées par settings sont là
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
    const order_id = req.params.id; // C'est le numéro de commande Oracle
    try {
        const order = await db.get('SELECT "N° Commande" FROM v_orders WHERE id = ?', [order_id]);
        if (!order) return res.status(404).json({ message: 'Commande non trouvée' });

        const nr = order['N° Commande'];

        if (operation_id) {
            await db.run(`
                INSERT INTO oracle_links (target_table, target_id, operation_id) 
                VALUES ('orders', ?, ?)
                ON CONFLICT(target_table, target_id) DO UPDATE SET operation_id = excluded.operation_id
            `, [nr, operation_id]);
        } else {
            await db.run('UPDATE oracle_links SET operation_id = NULL WHERE target_table = "orders" AND target_id = ?', [nr]);
        }

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
        await db.run('BEGIN TRANSACTION');
        for (const nr of order_numbers) {
            if (operation_id) {
                await db.run(`
                    INSERT INTO oracle_links (target_table, target_id, operation_id) 
                    VALUES ('orders', ?, ?)
                    ON CONFLICT(target_table, target_id) DO UPDATE SET operation_id = excluded.operation_id
                `, [nr, operation_id]);
            } else {
                await db.run('UPDATE oracle_links SET operation_id = NULL WHERE target_table = "orders" AND target_id = ?', [nr]);
            }
        }
        await db.run('COMMIT');
        await recalculateAllOperations();
        res.json({ message: 'Affectation groupée réussie' });
    } catch (error) {
        await db.run('ROLLBACK');
        res.status(500).json({ message: 'Erreur affectation groupée' });
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
app.get('/api/telecom/operators', authenticateJWT, async (req, res) => {
    try {
        const operators = await db.all('SELECT * FROM telecom_operators ORDER BY name');
        res.json(operators);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching operators', error: error.message });
    }
});

app.post('/api/telecom/operators', authenticateAdmin, async (req, res) => {
    const { name, logo_url } = req.body;
    try {
        const result = await db.run('INSERT INTO telecom_operators (name, logo_url) VALUES (?, ?)', [name, logo_url]);
        res.json({ id: result.lastID, message: 'Opérateur créé' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating operator', error: error.message });
    }
});

app.put('/api/telecom/operators/:id', authenticateAdmin, async (req, res) => {
    const { name, logo_url } = req.body;
    try {
        await db.run('UPDATE telecom_operators SET name = ?, logo_url = ? WHERE id = ?', [name, logo_url, req.params.id]);
        res.json({ message: 'Opérateur mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating operator', error: error.message });
    }
});

app.delete('/api/telecom/operators/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM telecom_operators WHERE id = ?', [req.params.id]);
        res.json({ message: 'Opérateur supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting operator', error: error.message });
    }
});

app.get('/api/telecom/billing-accounts', authenticateJWT, async (req, res) => {
    try {
        const { operator_id } = req.query;
        let query = `
            SELECT a.*, o.name as operator_name,
                   (SELECT COUNT(*) FROM telecom_invoices WHERE billing_account_id = a.id) as invoice_count,
                   (SELECT COALESCE(SUM(amount_ttc), 0) FROM telecom_invoices WHERE billing_account_id = a.id) as total_invoiced
            FROM telecom_billing_accounts a
            JOIN telecom_operators o ON a.operator_id = o.id
        `;
        let params = [];

        if (operator_id) {
            query += " WHERE a.operator_id = ?";
            params.push(operator_id);
        }

        query += " ORDER BY o.name, a.account_number";

        const accounts = await db.all(query, params);
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching accounts', error: error.message });
    }
});

// Alias for frontend compatibility
app.get('/api/telecom/operators/:operatorId/accounts', authenticateJWT, async (req, res) => {
    try {
        const accounts = await db.all(`
            SELECT a.*, o.name as operator_name,
                   (SELECT COUNT(*) FROM telecom_invoices WHERE billing_account_id = a.id) as invoice_count,
                   (SELECT COALESCE(SUM(amount_ttc), 0) FROM telecom_invoices WHERE billing_account_id = a.id) as total_invoiced
            FROM telecom_billing_accounts a
            JOIN telecom_operators o ON a.operator_id = o.id
            WHERE a.operator_id = ?
            ORDER BY a.account_number
        `, [req.params.operatorId]);
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching operator accounts', error: error.message });
    }
});

app.post('/api/telecom/billing-accounts', authenticateAdmin, async (req, res) => {
    const {
        operator_id, account_number, type, designation,
        customer_number, market_number, function_code, commitment_number
    } = req.body;
    try {
        const result = await db.run(`
            INSERT INTO telecom_billing_accounts 
            (operator_id, account_number, type, designation, customer_number, market_number, function_code, commitment_number) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [operator_id, account_number, type, designation, customer_number, market_number, function_code, commitment_number]);
        res.json({ id: result.lastID, message: 'Compte créé' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating account', error: error.message });
    }
});

app.put('/api/telecom/billing-accounts/:id', authenticateAdmin, async (req, res) => {
    const {
        operator_id, account_number, type, designation,
        customer_number, market_number, function_code, commitment_number
    } = req.body;
    try {
        await db.run(`
            UPDATE telecom_billing_accounts 
            SET operator_id = ?, account_number = ?, type = ?, designation = ?, 
                customer_number = ?, market_number = ?, function_code = ?, commitment_number = ? 
            WHERE id = ?
        `, [operator_id, account_number, type, designation, customer_number, market_number, function_code, commitment_number, req.params.id]);
        res.json({ message: 'Compte mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating account', error: error.message });
    }
});

app.delete('/api/telecom/billing-accounts/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM telecom_billing_accounts WHERE id = ?', [req.params.id]);
        res.json({ message: 'Compte supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting account', error: error.message });
    }
});

app.get('/api/telecom/commitments', authenticateJWT, async (req, res) => {
    try {
        const commitments = await db.all(`
            SELECT c.*, o.name as operator_name, a.account_number
            FROM telecom_commitments c
            JOIN telecom_operators o ON c.operator_id = o.id
            LEFT JOIN telecom_billing_accounts a ON c.billing_account_id = a.id
            ORDER BY c.commitment_number
        `);
        res.json(commitments);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching commitments', error: error.message });
    }
});

app.post('/api/telecom/commitments', authenticateAdmin, async (req, res) => {
    const { commitment_number, label, amount, year, operator_name, function_code } = req.body;
    try {
        const result = await db.run(`
            INSERT INTO telecom_commitments 
            (commitment_number, label, amount, year, operator_name, function_code) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [commitment_number, label, amount, year, operator_name, function_code]);
        res.json({ id: result.lastID, message: 'Engagement créé' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating commitment', error: error.message });
    }
});

app.put('/api/telecom/commitments/:id', authenticateAdmin, async (req, res) => {
    const { commitment_number, label, amount, year, operator_name, function_code } = req.body;
    try {
        await db.run(`
            UPDATE telecom_commitments 
            SET commitment_number = ?, label = ?, amount = ?, year = ?, operator_name = ?, function_code = ? 
            WHERE id = ?
        `, [commitment_number, label, amount, year, operator_name, function_code, req.params.id]);
        res.json({ message: 'Engagement mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating commitment', error: error.message });
    }
});

app.delete('/api/telecom/commitments/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM telecom_commitments WHERE id = ?', [req.params.id]);
        res.json({ message: 'Engagement supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting commitment', error: error.message });
    }
});

app.get('/api/telecom/invoices', authenticateJWT, async (req, res) => {
    try {
        const invoices = await db.all(`
            SELECT i.*, o.name as operator_name, a.account_number,
            (SELECT "Etat" FROM invoices WHERE LOWER(TRIM("N° Facture fournisseur")) = LOWER(TRIM(i.invoice_number)) LIMIT 1) as general_status
            FROM telecom_invoices i
            JOIN telecom_operators o ON i.operator_id = o.id
            LEFT JOIN telecom_billing_accounts a ON i.billing_account_id = a.id
            ORDER BY i.invoice_date DESC
        `);
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching invoices', error: error.message });
    }
});

app.post('/api/telecom/invoices/upload', authenticateJWT, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdf(dataBuffer);
        const content = pdfData.text;

        // Stratégie d'extraction 1 : Suppression de tous les espaces pour les libellés collés
        const flatContent = content.replace(/\s+/g, '');

        // Recherche du numéro de compte
        let account_number = null;
        const accountPatterns = [
            /N°decomptedefacturation[:\s]*(\d+)/i,
            /Compte[:\s]*(\d+)/i,
            /N°decompte[:\s]*(\d+)/i,
            /Facturationn°[:\s]*(\d+)/i
        ];

        for (const pattern of accountPatterns) {
            const match = flatContent.match(pattern);
            if (match) {
                account_number = match[1];
                break;
            }
        }

        // Extraction numéro de facture
        const invNumRegex = /(?:Facture\s*n°|FactureN°|N°defacture)[:\s]*([A-Z0-9\-_]{3,20})/i;
        const invNumMatch = content.match(invNumRegex) || flatContent.match(invNumRegex);
        let invoice_number = invNumMatch ? invNumMatch[1] : 'Inconnu';

        if (invoice_number.endsWith('N')) {
            invoice_number = invoice_number.slice(0, -1);
        }

        // Extraction Montant TTC
        const amountRegex = /(?:Total\s*TTC|Montant\s*à\s*payer|MontantTTC)[:\s]*(\d+[.,]\d{2})/i;
        const amountMatch = content.match(amountRegex) || flatContent.match(amountRegex);
        let amount_ttc = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;

        // Extraction Date
        const dateMatch = content.match(/Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) ||
            flatContent.match(/Date:(\d{2}\/\d{2}\/\d{4})/i) ||
            content.match(/(\d{2}\/\d{2}\/\d{4})/);

        let invoice_date = null;
        if (dateMatch) {
            const [d, m, y] = dateMatch[1].split('/');
            invoice_date = `${y}-${m}-${d}`;
        }

        const { overwrite } = req.body;
        const existingInvoice = await db.get('SELECT id, file_path FROM telecom_invoices WHERE invoice_number = ?', [invoice_number]);

        if (existingInvoice && overwrite !== 'true') {
            return res.status(409).json({
                message: `La facture n°${invoice_number} existe déjà. Souhaitez-vous la remplacer ?`,
                invoice_number
            });
        }

        let operator_id = null;
        let billing_account_id = null;

        const allAccounts = await db.all('SELECT id, operator_id, account_number FROM telecom_billing_accounts');

        // 1. Essayer le numéro de compte extrait explicitement
        if (account_number) {
            const acc = allAccounts.find(a => a.account_number === account_number);
            if (acc) {
                billing_account_id = acc.id;
                operator_id = acc.operator_id;
            }
        }

        // 2. Si pas trouvé, chercher si un des numéros de compte connus apparaît dans le texte (flatContent)
        if (!billing_account_id) {
            for (const acc of allAccounts) {
                if (flatContent.includes(acc.account_number)) {
                    billing_account_id = acc.id;
                    operator_id = acc.operator_id;
                    break;
                }
            }
        }

        // 3. Si toujours pas de compte, essayer de matcher au moins l'opérateur par son nom
        if (!operator_id) {
            const operators = await db.all('SELECT id, name FROM telecom_operators');
            for (const op of operators) {
                if (content.toUpperCase().includes(op.name.toUpperCase())) {
                    operator_id = op.id;
                    break;
                }
            }
        }

        let finalId = existingInvoice ? existingInvoice.id : null;
        const relativePath = `file_telecom/${req.file.filename}`;

        if (existingInvoice && overwrite === 'true') {
            if (existingInvoice.file_path) {
                const oldPath = path.join(__dirname, existingInvoice.file_path);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            await db.run(
                'UPDATE telecom_invoices SET operator_id = ?, billing_account_id = ?, amount_ttc = ?, invoice_date = ?, file_path = ?, uploaded_at = CURRENT_TIMESTAMP WHERE id = ?',
                [operator_id, billing_account_id, amount_ttc, invoice_date, relativePath, existingInvoice.id]
            );
        } else {
            const result = await db.run(
                'INSERT INTO telecom_invoices (invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, file_path) VALUES (?, ?, ?, ?, ?, ?)',
                [invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, relativePath]
            );
            finalId = result.lastID;
        }

        res.json({
            id: finalId,
            invoice_number,
            account_number,
            amount_ttc,
            invoice_date,
            operator_id,
            billing_account_id,
            file_path: relativePath,
            message: existingInvoice ? 'Facture mise à jour' : 'Analyse terminée'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error processing PDF', error: error.message });
    }
});

app.put('/api/telecom/invoices/:id', authenticateJWT, async (req, res) => {
    let { invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date } = req.body;
    if (invoice_number && invoice_number.endsWith('N')) {
        invoice_number = invoice_number.slice(0, -1);
    }
    try {
        await db.run(
            'UPDATE telecom_invoices SET invoice_number = ?, operator_id = ?, billing_account_id = ?, amount_ttc = ?, invoice_date = ? WHERE id = ?',
            [invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, req.params.id]
        );
        res.json({ message: 'Facture mise à jour avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating invoice', error: error.message });
    }
});

app.delete('/api/telecom/invoices/:id', authenticateJWT, async (req, res) => {
    try {
        const inv = await db.get('SELECT file_path FROM telecom_invoices WHERE id = ?', [req.params.id]);
        if (inv && inv.file_path) {
            const fullPath = path.join(__dirname, inv.file_path);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        await db.run('DELETE FROM telecom_invoices WHERE id = ?', [req.params.id]);
        res.json({ message: 'Facture supprimée' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting invoice', error: error.message });
    }
});

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

let currentRunningSync = null;
let syncQueue = [];

function getSyncStatus() {
    return {
        running: currentRunningSync,
        queue: syncQueue,
        queueLength: syncQueue.length
    };
}

async function executeScheduledSync(scheduledSync) {
    const syncKey = `${scheduledSync.sync_type}-${scheduledSync.sync_mode}`;
    const { sync_type, sync_mode, execution_time } = scheduledSync;
    console.log(`[SCHEDULED SYNC] Exécution: ${sync_type} - ${sync_mode}`);

    try {
        const syncRoutes = {
            'tickets': {
                'recent': '/api/glpi/sync-recent',
                'full': '/api/glpi/sync-all-tickets'
            },
            'observers': {
                'recent': '/api/glpi/sync-observers-recent',
                'full': '/api/glpi/sync-observers'
            },
            'followups': {
                'recent': '/api/glpi/sync-followups-recent',
                'full': '/api/glpi/sync-followups'
            }
        };

        const route = syncRoutes[sync_type]?.[sync_mode];
        if (!route) {
            console.error(`[SCHEDULED SYNC] Route non trouvée: ${sync_type} - ${sync_mode}`);
            return;
        }

        const axios = require('axios');
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) {
            console.error('[SCHEDULED SYNC] GLPI non configuré - URL:', settings?.url);
            try {
                await pool.query(
                    `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, error_message) VALUES ($1, $2, $3, $4, $5)`,
                    [sync_type, sync_mode, 'scheduled-cron', 'error', 'GLPI non configuré']
                );
            } catch (logErr) {
                console.error('[SCHEDULED SYNC] Erreur log:', logErr.message);
            }
            return;
        }

        const internalToken = Buffer.from('scheduled-sync:internal').toString('base64');

        currentRunningSync = { sync_type, sync_mode, started_at: new Date().toISOString() };

        console.log(`[SCHEDULED SYNC] Appel HTTP vers ${route}`);
        const response = await axios.post(`http://localhost:${process.env.PORT || 3001}${route}`, {}, {
            headers: {
                'Authorization': `Internal ${internalToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 300000
        });

        currentRunningSync = null;
        console.log(`[SCHEDULED SYNC] Terminé: ${sync_type} - ${sync_mode} (HTTP ${response?.status})`);
    } catch (error) {
        currentRunningSync = null;
        const errorMsg = error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message;
        console.error(`[SCHEDULED SYNC] Erreur: ${errorMsg}`);
        try {
            await pool.query(
                `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, error_message) VALUES ($1, $2, $3, $4, $5)`,
                [sync_type, sync_mode, 'scheduled-cron', 'error', errorMsg]
            );
        } catch (logErr) {
            console.error('[SCHEDULED SYNC] Erreur log:', logErr.message);
        }
    }
}

async function processScheduledSyncs() {
    console.log(`[SCHEDULED SYNC] Cron déclenché à ${new Date().toISOString()}`);
    try {
        const now = new Date();

        console.log(`[SCHEDULED SYNC] Pool état: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} en attente`);

        const dueSyncs = await pool.query(
            `SELECT * FROM glpi.scheduled_syncs WHERE is_enabled = 1 AND (next_run IS NULL OR next_run <= $1)`,
            [now.toISOString()]
        );

        console.log(`[SCHEDULED SYNC] Vérification: ${dueSyncs.rows.length} syncs dus (now=${now.toISOString()})`);

        if (dueSyncs.rows.length > 0) {
            console.log(`[SCHEDULED SYNC] Détail des syncs:`, JSON.stringify(dueSyncs.rows.map(s => ({ id: s.id, type: s.sync_type, mode: s.sync_mode, next_run: s.next_run, is_enabled: s.is_enabled }))));
        }

        for (const sync of dueSyncs.rows) {
            console.log(`[SCHEDULED SYNC] Sync trouvé: ${sync.sync_type}-${sync.sync_mode}, next_run=${sync.next_run}`);
            const syncKey = `${sync.sync_type}-${sync.sync_mode}`;

            if (currentRunningSync && currentRunningSync.sync_type === syncKey) {
                console.log(`[SCHEDULED SYNC] Déja en cours: ${sync.sync_type} - ${sync.sync_mode}. Ignoré.`);
                continue;
            }

            console.log(`[SCHEDULED SYNC] Lancement de "${sync.sync_type} - ${sync.sync_mode}"`);
            executeScheduledSync(sync);

            const nextRun = new Date(now);
            const execTime = sync.execution_time || '00:00';
            const [targetHour, targetMin] = execTime.split(':').map(Number);

            switch (sync.frequency_type) {
                case 'minutes':
                    nextRun.setMinutes(nextRun.getMinutes() + sync.frequency_value);
                    break;
                case 'hours':
                    nextRun.setHours(nextRun.getHours() + sync.frequency_value);
                    break;
                case 'days':
                    nextRun.setDate(nextRun.getDate() + sync.frequency_value);
                    nextRun.setHours(targetHour, targetMin, 0, 0);
                    break;
            }

            await pool.query(
                `UPDATE glpi.scheduled_syncs SET last_run = $1, next_run = $2 WHERE id = $3`,
                [now, nextRun, sync.id]
            );
        }
    } catch (error) {
        console.error(`[SCHEDULED SYNC] Erreur: ${error.message}`, error.stack);
    }
}

console.log('[SCHEDULED SYNC] Initialisation du cron...');
cron.schedule('* * * * *', () => {
    processScheduledSyncs();
});
console.log('[SCHEDULED SYNC] Cron job enregistré');

// =====================
// SCHEDULED SYNCS API ROUTES
// =====================

app.post('/api/glpi/cron-test', authenticateAdmin, async (req, res) => {
    console.log('[CRON-TEST] Déclenchement manuel du cron');
    try {
        await processScheduledSyncs();
        res.json({ message: 'Cron exécuté, voir logs serveur' });
    } catch (error) {
        console.error('[CRON-TEST] Erreur:', error);
        res.status(500).json({ message: error.message });
    }
});

// Middleware pour authentification interne des syncs scheduled
function authenticateInternal(req, res, next) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Internal ')) {
        const token = Buffer.from('scheduled-sync:internal').toString('base64');
        if (auth === `Internal ${token}`) {
            req.user = { username: 'scheduled-sync' };
            return next();
        }
    }
    authenticateAdmin(req, res, next);
}

app.get('/api/glpi/scheduled-syncs', authenticateAdmin, async (req, res) => {
    try {
        const syncs = await pool.query('SELECT * FROM glpi.scheduled_syncs ORDER BY id');
        res.json(syncs.rows);
    } catch (error) {
        console.error('Erreur lecture scheduled syncs:', error);
        res.status(500).json({ message: 'Erreur lecture' });
    }
});

app.get('/api/glpi/sync-status-global', authenticateAdmin, async (req, res) => {
    res.json(getSyncStatus());
});

app.post('/api/glpi/scheduled-syncs', authenticateAdmin, async (req, res) => {
    try {
        const { sync_type, sync_mode, frequency_type, frequency_value, execution_time, is_enabled } = req.body;

        if (!sync_type || !sync_mode || !frequency_type || !frequency_value) {
            return res.status(400).json({ message: 'Données incomplètes' });
        }

        const validTypes = ['tickets', 'observers', 'followups'];
        const validModes = {
            'tickets': ['recent', 'full'],
            'observers': ['recent', 'full'],
            'followups': ['recent', 'full']
        };
        const validFreq = ['minutes', 'hours', 'days'];
        const execTime = execution_time || '00:00';

        if (!validTypes.includes(sync_type)) {
            return res.status(400).json({ message: 'Type invalide' });
        }
        if (!validModes[sync_type]?.includes(sync_mode)) {
            return res.status(400).json({ message: 'Mode invalide pour ce type' });
        }
        if (!validFreq.includes(frequency_type)) {
            return res.status(400).json({ message: 'Fréquence invalide' });
        }

        const nextRun = new Date();
        switch (frequency_type) {
case 'minutes': nextRun.setMinutes(nextRun.getMinutes() + frequency_value); break;
                case 'hours': nextRun.setHours(nextRun.getHours() + frequency_value); break;
                case 'days': {
                    nextRun.setDate(nextRun.getDate() + frequency_value);
                    const [targetHour, targetMin] = execTime.split(':').map(Number);
                    nextRun.setHours(targetHour, targetMin, 0, 0);
                    break;
                }
        }

        const result = await pool.query(
            `INSERT INTO glpi.scheduled_syncs (sync_type, sync_mode, frequency_type, frequency_value, execution_time, is_enabled, next_run)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [sync_type, sync_mode, frequency_type, frequency_value, execTime, is_enabled !== false ? 1 : 0, nextRun]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur création scheduled sync:', error);
        res.status(500).json({ message: 'Erreur création' });
    }
});

app.put('/api/glpi/scheduled-syncs/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { frequency_type, frequency_value, execution_time, is_enabled } = req.body;

        let nextRun = null;
        const execTime = execution_time || '00:00';
        if (frequency_type && frequency_value) {
            nextRun = new Date();
            switch (frequency_type) {
                case 'minutes': nextRun.setMinutes(nextRun.getMinutes() + frequency_value); break;
                case 'hours': nextRun.setHours(nextRun.getHours() + frequency_value); break;
                case 'days': {
                    nextRun.setDate(nextRun.getDate() + frequency_value);
                    const [targetHour, targetMin] = execTime.split(':').map(Number);
                    nextRun.setHours(targetHour, targetMin, 0, 0);
                    break;
                }
            }
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (frequency_type) { updates.push(`frequency_type = $${paramIndex++}`); values.push(frequency_type); }
        if (frequency_value) { updates.push(`frequency_value = $${paramIndex++}`); values.push(frequency_value); }
        if (execution_time) { updates.push(`execution_time = $${paramIndex++}`); values.push(execution_time); }
        if (is_enabled !== undefined) { updates.push(`is_enabled = $${paramIndex++}`); values.push(is_enabled ? 1 : 0); }
        if (nextRun) { updates.push(`next_run = $${paramIndex++}`); values.push(nextRun); }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        values.push(id);
        const result = await pool.query(
            `UPDATE glpi.scheduled_syncs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Sync non trouvé' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur mise à jour scheduled sync:', error);
        res.status(500).json({ message: 'Erreur mise à jour' });
    }
});

app.delete('/api/glpi/scheduled-syncs/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM glpi.scheduled_syncs WHERE id = $1', [id]);
        res.json({ message: 'Supprimé avec succès' });
    } catch (error) {
        console.error('Erreur suppression scheduled sync:', error);
        res.status(500).json({ message: 'Erreur suppression' });
    }
});

// ============================================
// RENCONTRES BUDGÉTAIRES - Endpoints
// ============================================

// Helper: Convert Excel serial date to ISO 8601
function excelDateToISO(excelDate) {
    if (!excelDate && excelDate !== 0) return null;

    const dateNum = typeof excelDate === 'string' ? parseInt(excelDate) : excelDate;

    // Excel serial number: days since 1899-12-30 (with 1900 leap year bug)
    if (!isNaN(dateNum) && dateNum > 0) {
        // Excel epoch is December 30, 1899
        // But we need to account for the leap year bug in 1900
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + dateNum * 86400000);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Try to parse as string DD/MM/YYYY or YYYY-MM-DD
    if (typeof excelDate === 'string') {
        const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;

        let match = excelDate.match(ddmmyyyy);
        if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;

        match = excelDate.match(yyyymmdd);
        if (match) return excelDate;
    }

    return null;
}

// GET: Liste des rencontres budgétaires
app.get('/api/rencontres-budgetaires', authenticateJWT, async (req, res) => {
    try {
        const { direction, annee, statut, directions } = req.query;
        let sql = 'SELECT * FROM rencontres_budgetaires WHERE 1=1';
        const params = [];

        // Si 'directions' est passé (liste de directions séparées par virgule), filtrer par ces directions
        if (directions && typeof directions === 'string') {
            const dirList = directions.split(',').map(d => d.trim()).filter(d => d);
            if (dirList.length > 0) {
                sql += ` AND direction IN (${dirList.map(() => '?').join(',')})`;
                params.push(...dirList);
            }
        }
        // Sinon, récupérer les directions de l'utilisateur connecté depuis direction_emails
        else if (!direction) {
            try {
                // Utiliser le username du token JWT
                const username = req.user.username;
                console.log(`[RENCONTRES] Utilisateur: ${username}`);
                if (username) {
                    // Chercher les directions associées à cet username
                    // Le username peut être trouvé au début de l'email (ex: "machevalier" dans "machevalier@ivry94.fr")
                    const userDirections = await db.all('SELECT direction FROM direction_emails WHERE email LIKE ? OR email LIKE ?', [`${username}@%`, `${username}%`]);
                    console.log(`[RENCONTRES] Directions trouvées pour ${username}:`, userDirections);
                    if (userDirections && userDirections.length > 0) {
                        const dirList = userDirections.map(d => d.direction);
                        console.log(`[RENCONTRES] Filtre appliqué pour directions:`, dirList);
                        sql += ` AND direction IN (${dirList.map(() => '?').join(',')})`;
                        params.push(...dirList);
                    } else {
                        console.warn(`Aucune direction trouvée pour l'utilisateur ${username}`);
                    }
                }
            } catch (e) {
                console.warn('Impossible de récupérer les directions de l\'utilisateur:', e.message);
            }
        }
        // Utiliser le filtre 'direction' si spécifié
        else if (direction) {
            sql += ' AND direction = ?';
            params.push(direction);
        }

        if (annee) {
            sql += ' AND annee = ?';
            params.push(parseInt(annee));
        }
        if (statut) {
            sql += ' AND statut = ?';
            params.push(statut);
        }

        sql += ' ORDER BY date_reunion DESC';

        console.log(`[RENCONTRES] SQL Query:`, sql);
        console.log(`[RENCONTRES] Params:`, params);
        const rencontres = await db.all(sql, params);
        console.log(`[RENCONTRES] Résultat: ${rencontres.length} rencontres`);
        res.json(rencontres);
    } catch (error) {
        console.error('Erreur GET rencontres:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET: Détail d'une rencontre avec participants et suivi
app.get('/api/rencontres-budgetaires/:id', authenticateJWT, async (req, res) => {
    try {
        const { id } = req.params;
        const rencontre = await db.get('SELECT * FROM rencontres_budgetaires WHERE id = ?', [id]);

        if (!rencontre) {
            return res.status(404).json({ error: 'Rencontre non trouvée' });
        }

        const participants = await db.all('SELECT * FROM rencontres_participants WHERE rencontre_id = ?', [id]);
        const suivi = await db.all('SELECT * FROM rencontres_suivi WHERE rencontre_id = ?', [id]);

        res.json({ ...rencontre, participants, suivi });
    } catch (error) {
        console.error('Erreur GET rencontre detail:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Import Excel des rencontres budgétaires
app.post('/api/rencontres-budgetaires/import', authenticateAdminOrFinances, uploadMemory.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        const fileName = req.file.originalname || '';
        let rows = [];

        // DEBUG: Log filename
        let debugLog = `Filename: "${fileName}"\n`;

        // FORCE CSV parsing regardless of filename
        if (true) { // Force CSV parsing
            const content = req.file.buffer.toString('utf-8');
            const lines = content.split('\n').filter(l => l.trim().length > 0);

            if (lines.length < 2) {
                return res.status(400).json({ error: 'Fichier CSV vide' });
            }

            // Parse headers
            const headerLine = lines[0];
            debugLog += `RawHeaderLine: "${headerLine}"\n`;
            const headers = headerLine.split(';').map(h => h.trim().replace(/^"|"$/g, ''));

            // Find Suivi column index
            const suiviIndex = headers.findIndex(h => h.toLowerCase() === 'suivi');

            // DEBUG: Append to existing debug log
            debugLog += `Headers: ${JSON.stringify(headers)}\nSuiviIndex: ${suiviIndex}\n`;
            debugLog += `Header[${suiviIndex}]: "${headers[suiviIndex]}"\n\n`;

            // Parse data rows
            for (let i = 1; i < lines.length; i++) {
                const rawLine = lines[i];
                const values = rawLine.split(';').map(v => v.trim().replace(/^"|"$/g, ''));
                const row = {};

                // Map all columns
                headers.forEach((header, idx) => {
                    row[header] = values[idx] || '';
                });

                // Store suivi separately for reliability
                const rawSuiviValue = suiviIndex >= 0 ? (values[suiviIndex] || '') : '';
                row['__suivi'] = rawSuiviValue;
                row['__rawSuiviValue'] = rawSuiviValue;

                // DEBUG: First 5 rows - very detailed
                if (i <= 5) {
                    debugLog += `Row${i}:\n`;
                    debugLog += `  RawLine: "${rawLine.substring(0, 150)}..."\n`;
                    debugLog += `  Split count: ${values.length}, HeaderCount: ${headers.length}\n`;
                    debugLog += `  values[${suiviIndex}]: "${values[suiviIndex]}"\n`;
                    debugLog += `  rawSuiviValue: "${rawSuiviValue}"\n`;
                    debugLog += `  row['__suivi']: "${row['__suivi']}"\n`;
                    debugLog += `  row['Suivi']: "${row['Suivi']}"\n`;
                    debugLog += `  row['suivi']: "${row['suivi']}"\n`;
                    debugLog += `  Keys in row: ${Object.keys(row).join(', ')}\n\n`;
                }

                rows.push(row);
            }

            // Write debug
            try {
                fs.writeFileSync(path.join(__dirname, 'CSV_PARSE_DEBUG.txt'), debugLog);
            } catch (e) {}
        } else {
            // Excel fallback
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

            if (rawData.length < 2) {
                return res.status(400).json({ error: 'Aucune donnée' });
            }

            const headers = rawData[0];
            for (let i = 1; i < rawData.length; i++) {
                const row = {};
                headers.forEach((h, idx) => {
                    if (h) row[h.toString().trim()] = rawData[i][idx] || '';
                });
                row['__suivi'] = rawData[i][10] || '';
                rows.push(row);
            }
        }

        // Write debug log
        try {
            fs.writeFileSync(path.join(__dirname, 'IMPORT_DEBUG_FINAL.txt'), debugLog);
            console.log('DEBUG: Written debug log to IMPORT_DEBUG_FINAL.txt');
        } catch (e) {
            console.error('DEBUG: Failed to write debug log:', e.message);
        }

        // Also write to mouchard log so we can see it
        try {
            const timestamp = new Date().toISOString();
            fs.appendFileSync(
                path.join(__dirname, 'logs', 'mouchard.log'),
                `[${timestamp}] DEBUG: Import debug info:\n${debugLog}\n`
            );
        } catch (e) {}

        const data = rows.filter(r => r.Direction || r.Date);

        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Aucune donnée trouvée dans le fichier' });
        }

        let imported = 0;
        let errors = [];

        for (let i = 0; i < data.length; i++) {
            try {
                const row = data[i];

                // Vérifier les champs obligatoires
                if (!row.Direction) {
                    errors.push(`Ligne ${i + 2}: Direction manquante`);
                    continue;
                }

                if (row.Date === '' || row.Date === null || row.Date === undefined) {
                    errors.push(`Ligne ${i + 2}: Date manquante`);
                    continue;
                }

                // Convertir la date
                const dateReunion = excelDateToISO(row.Date);
                if (!dateReunion) {
                    errors.push(`Ligne ${i + 2}: Format de date invalide (${row.Date})`);
                    continue;
                }

                // Extraire l'année de la date
                const annee = parseInt(dateReunion.split('-')[0]);

                // Parser le coût (accepte nombre ou string)
                let coutTTC = 0;
                if (row['Cout TTC'] && row['Cout TTC'] !== '') {
                    const coutStr = String(row['Cout TTC']).replace(/[^0-9,.]/g, '').replace(',', '.');
                    coutTTC = parseFloat(coutStr) || 0;
                }

                // Préparer les données (trim et limite de longueur)
                const titre = row['Quoi ?']
                    ? String(row['Quoi ?']).trim().substring(0, 255)
                    : '';
                const direction = String(row['Direction']).trim();
                // Service peut être dans différentes colonnes (Service, SERVICE, service_code, etc.)
                const service = (row['Service'] || row['SERVICE'] || row['service_code'] || row['Service code'])
                    ? String(row['Service'] || row['SERVICE'] || row['service_code'] || row['Service code']).trim()
                    : '';
                const type = row['Type'] ? String(row['Type']).trim() : '';
                const description = row['Quoi ?'] ? String(row['Quoi ?']).trim() : '';
                const arbitrage = row['Arbitrage '] ? String(row['Arbitrage ']).trim() : '';
                const responsableDsi = row['DSI'] && String(row['DSI']).trim() !== '' ? String(row['DSI']).trim() : '';
                const ticketGlpi = row['TICKET'] && String(row['TICKET']).trim() !== '' ? String(row['TICKET']).trim() : '';
                const lienReference = row['LIEN'] && String(row['LIEN']).trim() !== '' ? String(row['LIEN']).trim() : '';
                const commentaires = row['Commentaire ?'] && String(row['Commentaire ?']).trim() !== '' ? String(row['Commentaire ?']).trim() : '';

                // Suivi: Utiliser la valeur stockée lors du parsing
                const suiviRaw = row['__suivi'] ? String(row['__suivi']).trim() : '';
                const suivi = suiviRaw && suiviRaw.toLowerCase() !== 'undefined' && suiviRaw.toLowerCase() !== 'null' && suiviRaw !== '' ? suiviRaw : '';

                // DEBUG: Very detailed logging for first 5 rows
                if (i < 5) {
                    const debugMsg = `DEBUG_ROW${i}: __suivi="${row['__suivi']}" | suiviRaw="${suiviRaw}" | final_suivi="${suivi}" | len=${suivi.length}`;
                    try {
                        await db.run(
                            'INSERT INTO import_logs (type, username) VALUES (?, ?)',
                            [debugMsg, 'debug']
                        );
                    } catch (e) {}
                }

                // DEBUG: Log the exact values going into INSERT
                if (i < 3) {
                    debugLog += `\nBEFORE INSERT Row${i}:\n`;
                    debugLog += `  row['__suivi']: "${row['__suivi']}" (type: ${typeof row['__suivi']}, len: ${String(row['__suivi']).length})\n`;
                    debugLog += `  suiviRaw: "${suiviRaw}" (type: ${typeof suiviRaw}, len: ${suiviRaw.length})\n`;
                    debugLog += `  suivi final: "${suivi}" (type: ${typeof suivi}, len: ${suivi.length})\n`;
                    debugLog += `  Will insert: direction="${direction}" | suivi="${suivi}"\n`;
                }

                // INSERT OR REPLACE
                await db.run(
                    `INSERT OR REPLACE INTO rencontres_budgetaires
                    (direction, service, date_reunion, annee, type, titre, description, cout_ttc,
                     arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, suivi, statut)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importée')`,
                    [direction, service, dateReunion, annee, type, titre, description, coutTTC,
                     arbitrage, responsableDsi, ticketGlpi, lienReference, commentaires, suivi]
                );

                imported++;
            } catch (lineError) {
                errors.push(`Ligne ${i + 2}: ${lineError.message}`);
            }
        }

        // Log de l'import
        const timestamp = new Date().toISOString();
        fs.appendFileSync(
            path.join(__dirname, 'logs', 'mouchard.log'),
            `[${timestamp}] POST /api/rencontres-budgetaires/import - 200 - par ${req.user.username}: ${imported} importées, ${errors.length} erreurs\n`
        );

        await db.run('INSERT INTO import_logs (type, username) VALUES (?, ?)',
            ['rencontres_budgetaires', req.user.username]);

        res.json({
            imported,
            errors: errors.length > 0 ? errors : [],
            message: `${imported} rencontres importées${errors.length > 0 ? `, ${errors.length} erreurs` : ''}`
        });
    } catch (error) {
        console.error('Erreur import rencontres:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Créer une rencontre manuelle
app.post('/api/rencontres-budgetaires', authenticateAdminOrFinances, async (req, res) => {
    try {
        const { titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires } = req.body;

        if (!titre || !direction) {
            return res.status(400).json({ error: 'Titre et Direction sont obligatoires' });
        }

        const result = await db.run(
            `INSERT INTO rencontres_budgetaires
            (titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planifiée')`,
            [titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires]
        );

        res.json({ id: result.lastID, message: 'Rencontre créée' });
    } catch (error) {
        console.error('Erreur POST rencontre:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Mettre à jour une rencontre
app.put('/api/rencontres-budgetaires/:id', authenticateAdminOrFinances, async (req, res) => {
    try {
        const { id } = req.params;
        const { titre, direction, service, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, statut } = req.body;

        await db.run(
            `UPDATE rencontres_budgetaires SET
            titre=?, direction=?, service=?, date_reunion=?, annee=?, type=?, description=?, cout_ttc=?,
            arbitrage=?, responsable_dsi=?, ticket_glpi=?, lien_reference=?, commentaires=?, statut=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?`,
            [titre, direction, service, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, statut, id]
        );

        res.json({ message: 'Rencontre mise à jour' });
    } catch (error) {
        console.error('Erreur PUT rencontre:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Supprimer TOUTES les rencontres (Admin only) - AVANT :id pour priorité
app.delete('/api/rencontres-budgetaires/delete-all', authenticateAdmin, async (req, res) => {
    try {
        const { confirm } = req.body;

        // Vérifier la confirmation
        if (confirm !== 'DELETE_ALL_RENCONTRES') {
            return res.status(400).json({ error: 'Confirmation manquante ou incorrecte' });
        }

        // Compter les demandes avant suppression
        const countResults = await db.all('SELECT COUNT(*) as count FROM rencontres_budgetaires');
        const totalCount = countResults?.[0]?.count || 0;

        // Supprimer les participants et suivi en cascade
        await db.run('DELETE FROM rencontres_participants');
        await db.run('DELETE FROM rencontres_suivi');

        // Supprimer toutes les rencontres
        await db.run('DELETE FROM rencontres_budgetaires');

        // Log
        const timestamp = new Date().toISOString();
        fs.appendFileSync(
            path.join(__dirname, 'logs', 'mouchard.log'),
            `[${timestamp}] DELETE /api/rencontres-budgetaires/delete-all - 200 - par ${req.user.username}: ${totalCount} demandes supprimées\n`
        );

        res.json({
            message: `${totalCount} demandes supprimées`,
            deleted: totalCount
        });
    } catch (error) {
        console.error('Erreur DELETE all rencontres:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Supprimer une rencontre
app.delete('/api/rencontres-budgetaires/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Supprimer les participants et suivi (cascade)
        await db.run('DELETE FROM rencontres_participants WHERE rencontre_id=?', [id]);
        await db.run('DELETE FROM rencontres_suivi WHERE rencontre_id=?', [id]);
        await db.run('DELETE FROM rencontres_budgetaires WHERE id=?', [id]);

        fs.appendFileSync(
            path.join(__dirname, 'logs', 'mouchard.log'),
            `[${new Date().toISOString()}] DELETE /api/rencontres-budgetaires/${id} - 200 - par ${req.user.username}\n`
        );

        res.json({ message: 'Rencontre supprimée' });
    } catch (error) {
        console.error('Erreur DELETE rencontre:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET: Statistiques par direction
app.get('/api/rencontres-budgetaires/stats/directions', authenticateJWT, async (req, res) => {
    try {
        const stats = await db.all(`
            SELECT direction, COUNT(*) as count, SUM(cout_ttc) as montant_total
            FROM rencontres_budgetaires
            GROUP BY direction
            ORDER BY count DESC
        `);
        res.json(stats);
    } catch (error) {
        console.error('Erreur stats directions:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET: Statistiques par année
app.get('/api/rencontres-budgetaires/stats/annees', authenticateJWT, async (req, res) => {
    try {
        const stats = await db.all(`
            SELECT annee, COUNT(*) as count, SUM(cout_ttc) as montant_total
            FROM rencontres_budgetaires
            WHERE annee IS NOT NULL
            GROUP BY annee
            ORDER BY annee DESC
        `);
        res.json(stats);
    } catch (error) {
        console.error('Erreur stats annees:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Ajouter un participant
app.post('/api/rencontres-budgetaires/:id/participants', authenticateJWT, async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, role, email, statut } = req.body;

        const result = await db.run(
            `INSERT INTO rencontres_participants (rencontre_id, nom, role, email, statut)
            VALUES (?, ?, ?, ?, ?)`,
            [id, nom, role, email, statut || 'en attente']
        );

        res.json({ id: result.lastID, message: 'Participant ajouté' });
    } catch (error) {
        console.error('Erreur POST participant:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Supprimer un participant
app.delete('/api/rencontres-participants/:id', authenticateJWT, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM rencontres_participants WHERE id=?', [id]);
        res.json({ message: 'Participant supprimé' });
    } catch (error) {
        console.error('Erreur DELETE participant:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Ajouter un suivi
app.post('/api/rencontres-budgetaires/:id/suivi', authenticateJWT, async (req, res) => {
    try {
        const { id } = req.params;
        const { action_item, responsable, date_echeance, statut } = req.body;

        const result = await db.run(
            `INSERT INTO rencontres_suivi (rencontre_id, action_item, responsable, date_echeance, statut)
            VALUES (?, ?, ?, ?, ?)`,
            [id, action_item, responsable, date_echeance, statut || 'en cours']
        );

        res.json({ id: result.lastID, message: 'Action ajoutée' });
    } catch (error) {
        console.error('Erreur POST suivi:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Mettre à jour un suivi
app.put('/api/rencontres-suivi/:id', authenticateJWT, async (req, res) => {
    try {
        const { id } = req.params;
        const { action_item, responsable, date_echeance, statut } = req.body;

        await db.run(
            `UPDATE rencontres_suivi SET action_item=?, responsable=?, date_echeance=?, statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [action_item, responsable, date_echeance, statut, id]
        );

        res.json({ message: 'Suivi mis à jour' });
    } catch (error) {
        console.error('Erreur PUT suivi:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Supprimer un suivi
app.delete('/api/rencontres-suivi/:id', authenticateJWT, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM rencontres_suivi WHERE id=?', [id]);
        res.json({ message: 'Suivi supprimé' });
    } catch (error) {
        console.error('Erreur DELETE suivi:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GESTION DES EMAILS PAR DIRECTION
// ============================================

// GET: Lister tous les emails par direction
app.get('/api/direction-emails', authenticateJWT, async (req, res) => {
    try {
        const data = await db.all('SELECT id, direction, email, created_at FROM direction_emails ORDER BY direction, email');
        res.json(data || []);
    } catch (error) {
        console.error('Erreur GET direction-emails:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET: Lister les emails d'une direction spécifique
app.get('/api/direction-emails/:direction', authenticateJWT, async (req, res) => {
    try {
        const { direction } = req.params;
        const data = await db.all(
            'SELECT id, direction, email FROM direction_emails WHERE direction = ? ORDER BY email',
            [direction]
        );
        res.json(data || []);
    } catch (error) {
        console.error('Erreur GET direction-emails/:direction:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Ajouter un email à une direction
app.post('/api/direction-emails', authenticateAdminOrFinances, async (req, res) => {
    try {
        const { direction, email } = req.body;

        if (!direction || !email) {
            return res.status(400).json({ error: 'Direction et email sont obligatoires' });
        }

        // Validation basique du format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Format email invalide' });
        }

        await db.run(
            'INSERT INTO direction_emails (direction, email) VALUES (?, ?)',
            [direction.trim(), email.trim().toLowerCase()]
        );

        res.json({ message: 'Email ajouté avec succès', direction, email });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Cet email est déjà attribué' });
        }
        console.error('Erreur POST direction-emails:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Attribuer plusieurs emails à une direction (en une requête)
app.post('/api/direction-emails/batch/:direction', authenticateAdminOrFinances, async (req, res) => {
    try {
        const { direction } = req.params;
        const { emails } = req.body;

        if (!direction || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ error: 'Direction et liste d\'emails sont obligatoires' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = emails.filter(e => !emailRegex.test(e));

        if (invalidEmails.length > 0) {
            return res.status(400).json({
                error: 'Emails invalides: ' + invalidEmails.join(', ')
            });
        }

        // D'abord, supprimer les anciens emails pour cette direction
        await db.run('DELETE FROM direction_emails WHERE direction = ?', [direction.trim()]);

        // Ensuite, insérer les nouveaux
        const uniqueEmails = [...new Set(emails.map(e => e.trim().toLowerCase()))];
        let inserted = 0;
        let skipped = 0;

        for (const email of uniqueEmails) {
            try {
                await db.run(
                    'INSERT INTO direction_emails (direction, email) VALUES (?, ?)',
                    [direction.trim(), email]
                );
                inserted++;
            } catch (error) {
                if (error.message.includes('UNIQUE constraint failed')) {
                    skipped++;
                } else {
                    throw error;
                }
            }
        }

        res.json({
            message: `Emails attribués à ${direction}`,
            inserted,
            skipped,
            total: uniqueEmails.length
        });
    } catch (error) {
        console.error('Erreur POST direction-emails/batch:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Supprimer un email d'une direction
app.delete('/api/direction-emails/:id', authenticateAdminOrFinances, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.run('DELETE FROM direction_emails WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Email non trouvé' });
        }

        res.json({ message: 'Email supprimé avec succès' });
    } catch (error) {
        console.error('Erreur DELETE direction-emails/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// FIN RENCONTRES BUDGÉTAIRES
// ============================================

app.post('/api/glpi/scheduled-syncs/:id/run', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const sync = await pool.query('SELECT * FROM glpi.scheduled_syncs WHERE id = $1', [id]);

        if (sync.rows.length === 0) {
            return res.status(404).json({ message: 'Sync non trouvé' });
        }

        await executeScheduledSync(sync.rows[0]);
        res.json({ message: 'Sync lancé manuellement' });
    } catch (error) {
        console.error('Erreur exécution scheduled sync:', error);
        res.status(500).json({ message: 'Erreur exécution' });
    }
});