const express = require('express');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Bypass SSL certificate verification globally

const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const setupDb = require('./db');
const updateTierStats = require('./update_tier_stats');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const ntlm = require('express-ntlm');
const pdf = require('pdf-parse');
const nodemailer = require('nodemailer');
const brevoTransport = require('nodemailer-brevo-transport');
const ldap = require('ldapjs');
const { exec } = require('child_process');
const axios = require('axios');
const oracledb = require('oracledb');
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
    
    const obj = { dn: pojo.objectName };
    if (pojo.attributes && Array.isArray(pojo.attributes)) {
        pojo.attributes.forEach(attr => {
            obj[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
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
            connectTimeout: 5000,
            timeout: 5000
        });

        const log = (msg) => {
            console.log(`[AD Auth Debug] ${msg}`);
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] AD Auth Debug: ${msg}\n`);
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
                attributes: ['dn', 'cn', 'memberOf', 'mail', 'displayName']
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
                        connectTimeout: 5000,
                        timeout: 5000
                    });

                    userClient.bind(userEntry.dn, password, (err) => {
                        userClient.destroy();
                        client.destroy();

                        if (err) {
                            log(`User bind FAILED for ${username}: ${err.message}`);
                            return resolve(null); // Mot de passe incorrect
                        }

                        log(`User bind SUCCESS for ${username}`);
                        // 4. Vérification de l'appartenance au groupe si requis
                        if (config.required_group) {
                            const groups = Array.isArray(userEntry.memberOf) ? userEntry.memberOf : [userEntry.memberOf];
                            const hasGroup = groups.some(g => g && g.toLowerCase().includes(config.required_group.toLowerCase()));
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
            connectTimeout: 5000,
            timeout: 5000
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
const folders = ['uploads', 'file_commandes', 'file_factures', 'file_certif', 'magapp_img', 'file_telecom'];
folders.forEach(f => {
    const dir = path.join(__dirname, f);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
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
        const dest = path.join(__dirname, folder);
        
        const logMsg = `Multer Destination: type=${type}, folder=${folder}, dest=${dest}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);
        
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const targetId = (req.body.target_id || 'unknown').replace(/[^a-z0-9]/gi, '_');
        const ext = path.extname(file.originalname);
        const fname = `${targetId}_${Date.now()}${ext}`;
        
        const logMsg = `Multer Filename: target_id=${req.body.target_id}, final_name=${fname}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);
        
        cb(null, fname);
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

    res.status = function(code) {
        this.statusCode = code;
        return originalStatus.apply(this, arguments);
    };

    res.send = function(body) {
        if (this.statusCode === 500) {
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] BODY 500 (${req.url}): ${body}
`);
        }
        return originalSend.apply(this, arguments);
    };

    res.json = function(body) {
        if (this.statusCode === 500) {
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] JSON 500 (${req.url}): ${JSON.stringify(body)}
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
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), line);
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

// Configuration NTLM
const ntlmOptions = {
    domain: 'IVRY',
    domaincontroller: 'ldap://10.103.130.118',
    internalservererror: function(req, res, next) {
        const msg = `NTLM Internal Error (${req.url}): Session cassée ou erreur proxy. Forcing retry.`;
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${msg}\n`);
        console.error(msg);
        
        // On force la fermeture de la connexion et on demande au navigateur de recommencer (401)
        res.setHeader('Connection', 'close');
        res.setHeader('WWW-Authenticate', 'NTLM');
        
        // Pour la route optionnelle, on peut aussi choisir de continuer sans auth 
        // mais pour sso-redirect il vaut mieux que le navigateur réessaie proprement.
        if (req.url.includes('/api/auth/ntlm')) {
            // Pour l'appel axios, on préfère que ça échoue proprement plutôt que de boucler à l'infini
            // si c'est vraiment un problème de proxy
            req.ntlm = { UserName: null, Authenticated: false };
            return next();
        }
        
        if (req.url.includes('/api/auth/sso-redirect')) {
            // Pour sso-redirect, on renvoie vers le frontend avec un flag de retry ou d'erreur
            const redirectUrl = req.query.redirect || 'http://localhost:5174';
            try {
                const url = new URL(redirectUrl);
                url.searchParams.set('error', 'ntlm_handshake_failed');
                return res.redirect(url.toString());
            } catch (e) {
                // Si l'URL de redirection est invalide, on continue vers le 401 standard
            }
        }
        res.status(401).send(msg);
    },
    debug: function() {
        const msg = Array.prototype.slice.call(arguments).join(' ');
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] NTLM DEBUG: ${msg}\n`);
    }
};

const ntlmMiddleware = ntlm(ntlmOptions); 
const ntlmMiddlewareForced = ntlm(ntlmOptions);

// Route SSO avec redirection (pour éviter les problèmes de CORS avec NTLM)
app.get('/api/auth/sso-redirect', ntlmMiddlewareForced, async (req, res) => {
    const login = req.ntlm ? req.ntlm.UserName : null;
    
    // Détection dynamique du host pour la redirection
    const host = req.get('host'); // ex: 10.103.131.162:3001
    const protocol = req.protocol;
    const frontendHost = host.replace(':3001', ':5174');
    const defaultRedirect = `${protocol}://${frontendHost}/`;
    
    const redirectUrl = req.query.redirect || defaultRedirect;
    
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] SSO Redirect triggered. Detected login: ${login}, Target: ${redirectUrl}
`);
    
    let displayName = login;
    let email = '';

    if (login) {
        try {
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (adSettings && adSettings.is_enabled) {
                const info = await getADUserInfo(login, adSettings);
                if (info) {
                    if (info.displayName) displayName = info.displayName;
                    if (info.mail) email = info.mail;
                }
            }
        } catch (e) {
            console.error('Erreur SSO Redirect AD:', e.message);
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] SSO AD Error: ${e.message}
`);
        }
    } else {
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] SSO Redirect failed to detect login
`);
    }

    // On redirige vers le frontend avec les infos en paramètres (encodés)
    const url = new URL(redirectUrl);
    if (login) {
        url.searchParams.set('login', login);
        if (displayName) url.searchParams.set('name', displayName);
        if (email) url.searchParams.set('email', email);
    } else {
        url.searchParams.set('error', 'no_login_detected');
    }
    
    res.redirect(url.toString());
});

// Route NTLM spécifique pour la détection du login Windows
app.get('/api/auth/ntlm', (req, res, next) => {
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] HIT /api/auth/ntlm (Optional-NTLM)
`);
    next();
}, ntlmMiddleware, async (req, res) => {
    const login = req.ntlm ? req.ntlm.UserName : null;
    let displayName = login;
    let email = '';

    const logMsg = `NTLM Call: User=${login}, Domain=${req.ntlm ? req.ntlm.Domain : 'N/A'}, Workstation=${req.ntlm ? req.ntlm.Workstation : 'N/A'}`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

    if (login) {
        try {
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (adSettings && adSettings.is_enabled) {
                const info = await getADUserInfo(login, adSettings);
                if (info) {
                    if (info.displayName) displayName = info.displayName;
                    if (info.mail) email = info.mail;
                    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] AD Lookup Success: DisplayName=${displayName}
`);
                } else {
                    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] AD Lookup Failed for ${login}
`);
                }
            } else {
                fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] AD disabled or no settings
`);
            }
        } catch (e) {
            console.error('Erreur lookup AD pour NTLM:', e.message);
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] AD Lookup Error: ${e.message}
`);
        }
    }

    res.json({
        login: login,
        displayName: displayName,
        email: email,
        domain: req.ntlm ? req.ntlm.Domain : 'N/A',
        workstation: req.ntlm ? req.ntlm.Workstation : 'N/A'
    });
});

// Route d'auto-login via NTLM
app.get('/api/auth/auto-login', ntlmMiddleware, async (req, res) => {
    try {
        // On prend soit le login détecté par NTLM, soit celui passé en paramètre (retour de redirect)
        const winLogin = req.query.login || req.ntlm.UserName;
        
        if (!winLogin) {
            return res.status(401).json({ message: 'Login Windows non détecté' });
        }

        // Chercher l'utilisateur de façon insensible à la casse
        const user = await db.get('SELECT id, username, role, service_code, service_complement FROM users WHERE LOWER(username) = LOWER(?)', [winLogin]);

        if (user) {
            const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role, service_code: user.service_code, service_complement: user.service_complement }, SECRET_KEY);
            res.json({ accessToken, user: { id: user.id, username: user.username, role: user.role, service_code: user.service_code, service_complement: user.service_complement } });
        } else {
            res.status(404).json({ message: `Utilisateur Windows "${winLogin}" non reconnu dans la base` });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erreur auto-login', error: error.message });
    }
});

// Route d'authentification AD manuelle pour le Magasin d'Applications
// Récupérer le profil utilisateur actuel (depuis la DB pour avoir le statut à jour)
app.get('/api/auth/me', authenticateJWT, async (req, res) => {
    try {
        const user = await db.get('SELECT id, username, role, is_approved, service_code, service_complement FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
        
        // Force l'approbation pour les admins
        if (user.role === 'admin' || user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === 'adminhub') {
            user.is_approved = 1;
        }
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération du profil', error: error.message });
    }
});

app.post('/api/auth/magapp-login', async (req, res) => {
    const { username, password } = req.body;
    
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

        // 2. Vérifier si l'utilisateur existe dans notre base locale
        let user = await db.get('SELECT id, username, role, service_code, service_complement FROM users WHERE LOWER(username) = LOWER(?)', [username]);

        if (!user) {
            // Création automatique de l'utilisateur s'il est OK AD mais absent de la base locale
            try {
                // Règle spéciale : admin et adminhub sont toujours approuvés et admins
                const isAdminAccount = username.toLowerCase() === 'admin' || username.toLowerCase() === 'adminhub';
                const role = isAdminAccount ? 'admin' : 'magapp';
                const isApproved = isAdminAccount ? 1 : 0;

                const result = await db.run(
                    'INSERT INTO users (username, role, is_approved) VALUES (?, ?, ?)',
                    [adUser.username.toLowerCase(), role, isApproved]
                );
                // Récupérer l'utilisateur fraîchement créé
                user = await db.get('SELECT id, username, role, service_code, service_complement, is_approved FROM users WHERE id = ?', [result.lastID]);
                console.log(`[AUTH] Nouvel utilisateur AD créé automatiquement via MagApp: ${adUser.username} (Role: ${role})`);
            } catch (insertError) {
                console.error(`[AUTH] Erreur lors de la création auto de l'utilisateur ${username}:`, insertError);
                // Si l'insertion échoue, on continue avec les infos AD uniquement (fallback)
            }
        }

        if (user) {
            const accessToken = jwt.sign({ 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                service_code: user.service_code, 
                service_complement: user.service_complement 
            }, SECRET_KEY);
            
            return res.json({ 
                accessToken, 
                user: { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role, 
                    service_code: user.service_code, 
                    service_complement: user.service_complement,
                    displayName: adUser.displayName,
                    email: adUser.email
                } 
            });
        }

        // Cas de secours si l'utilisateur n'a pas pu être créé
        res.json({ 
            user: { 
                username: adUser.username, 
                displayName: adUser.displayName, 
                email: adUser.email,
                role: 'user'
            } 
        });

    } catch (error) {
        console.error('Erreur login MagApp:', error.message);
        res.status(500).json({ message: 'Erreur lors de l\'authentification', error: error.message });
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
        if (!bind_password || bind_password === '********') {
            // Le mot de passe n'a pas été changé (vide ou masqué dans l'UI)
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
        const total = (await db.get('SELECT count(*) as c FROM referentiel_agents')).c;
        const actif = (await db.get("SELECT count(*) as c FROM referentiel_agents WHERE date_plusvu IS NULL")).c;
        const parti = (await db.get("SELECT count(*) as c FROM referentiel_agents WHERE date_plusvu IS NOT NULL")).c;
        const adLie = (await db.get("SELECT count(*) as c FROM referentiel_agents WHERE ad_username IS NOT NULL AND date_plusvu IS NULL")).c;
        const adNonLie = actif - adLie;
        res.json({ total, actif, parti, adLie, adNonLie });
    } catch (err) {
        res.status(500).json({ message: 'Erreur stats', error: err.message });
    }
});

// Récupérer la liste des agents consolidés (avec recherche optionnelle)
app.get('/api/admin/rh/agents', authenticateAdmin, async (req, res) => {
    try {
        const { q } = req.query;
        let agents;
        if (q && q.trim()) {
            const term = `%${q.trim()}%`;
            agents = await db.all(
                `SELECT * FROM referentiel_agents
                 WHERE nom LIKE ? OR prenom LIKE ? OR matricule LIKE ? OR ad_username LIKE ?
                 ORDER BY nom ASC, prenom ASC LIMIT 200`,
                [term, term, term, term]
            );
        } else {
            agents = await db.all('SELECT * FROM referentiel_agents ORDER BY nom ASC, prenom ASC');
        }
        res.json(agents);
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture agents', error: err.message });
    }
});

// Synchronisation RH Oracle -> Référentiel Agents
app.post('/api/admin/rh/sync', authenticateAdmin, async (req, res) => {
    console.log("[SYNC RH] Début de la synchronisation...");
    try {
        // 1. Attacher la base RH si nécessaire
        try {
            const rhDbPath = path.join(__dirname, 'oracle_rh.sqlite');
            console.log("[SYNC RH] Attachement de la base:", rhDbPath);
            await db.run(`ATTACH DATABASE '${rhDbPath}' AS rh`);
        } catch (attachErr) {
            if (!attachErr.message.includes('already being used')) {
                console.error("[SYNC RH] Erreur ATTACH rh:", attachErr.message);
            }
        }

        // 2. Lire les agents depuis l'import Oracle RH
        console.log("[SYNC RH] Lecture de rh.oracle_v_extract_dsi...");
        let rhAgents = [];
        try {
            rhAgents = await db.all('SELECT * FROM rh.oracle_v_extract_dsi');
            console.log(`[SYNC RH] ${rhAgents.length} agents trouvés dans l'import.`);
        } catch (e) {
            console.error("[SYNC RH] Erreur lecture rh.oracle_v_extract_dsi:", e.message);
            return res.status(404).json({ message: "La table rh.oracle_v_extract_dsi n'existe pas ou la base RH n'est pas accessible." });
        }

        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        const now = new Date().toISOString();
        let matchedCount = 0;
        let newCount = 0;
        let leftCount = 0;

        const currentMatricules = new Set(rhAgents.map(a => String(a.V_EXTRACT_DSI_MATRICULE || '').trim()));

        // 3. Traiter chaque agent RH
        for (const rhA of rhAgents) {
            const matricule = String(rhA.V_EXTRACT_DSI_MATRICULE || '').trim();
            if (!matricule) continue;

            const nom = rhA.V_EXTRACT_DSI_NOM;
            const prenom = rhA.V_EXTRACT_DSI_PRENOM;
            const civilite = rhA.V_EXTRACT_DSI_CIVILITE || ''; // Optionnel car peut être manquant
            const service = rhA.V_EXTRACT_DSI_SERVICE_L;

            const existing = await db.get('SELECT * FROM referentiel_agents WHERE matricule = ?', [matricule]);

            if (existing) {
                await db.run(
                    'UPDATE referentiel_agents SET nom = ?, prenom = ?, civilite = ?, service = ?, last_sync_date = ?, date_plusvu = NULL WHERE matricule = ?',
                    [nom, prenom, civilite, service, now, matricule]
                );
            } else {
                await db.run(
                    'INSERT INTO referentiel_agents (matricule, nom, prenom, civilite, service, last_sync_date) VALUES (?, ?, ?, ?, ?, ?)',
                    [matricule, nom, prenom, civilite, service, now]
                );
                newCount++;

                if (adSettings && adSettings.is_enabled) {
                    try {
                        const adMatch = await searchADUserByName(nom, prenom, adSettings);
                        if (adMatch) {
                            await db.run('UPDATE referentiel_agents SET ad_username = ? WHERE matricule = ?', [adMatch.sAMAccountName, matricule]);
                            matchedCount++;
                        }
                    } catch (adErr) {
                        console.error(`[SYNC RH] Erreur matching AD pour ${nom} ${prenom}:`, adErr.message);
                    }
                }
            }
        }

        // 4. Identifier ceux qui ne sont plus dans l'import (Partis)
        const dbAgents = await db.all("SELECT matricule FROM referentiel_agents WHERE date_plusvu IS NULL");
        for (const dbA of dbAgents) {
            const m = String(dbA.matricule || '').trim();
            if (!currentMatricules.has(m)) {
                console.log(`[SYNC RH] Agent parti: ${m}`);
                await db.run("UPDATE referentiel_agents SET date_plusvu = ?, last_sync_date = ? WHERE matricule = ?", [now, now, m]);
                leftCount++;
            }
        }

        console.log(`[SYNC RH] Synchronisation terminée: +${newCount}, AD=${matchedCount}, -${leftCount}`);
        res.json({ 
            message: 'Synchronisation terminée', 
            stats: { new: newCount, matched: matchedCount, left: leftCount }
        });
    } catch (err) {
        console.error('[SYNC RH] Erreur fatale:', err);
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
        const associated = await db.all('SELECT ad_username FROM referentiel_agents WHERE ad_username IS NOT NULL');
        const associatedSet = new Set(associated.map(a => a.ad_username.toLowerCase()));

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
        await db.run('UPDATE referentiel_agents SET ad_username = ? WHERE matricule = ?', [ad_username, matricule]);
        res.json({ message: 'Association réussie' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur association', error: err.message });
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
            try { await connection.close(); } catch (e) {}
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
            try { await connection.close(); } catch (e) {}
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
            try { await connection.close(); } catch (e) {}
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
            try { await connection.close(); } catch (e) {}
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
    } catch (e) {}

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
        if (connection) { try { await connection.close(); } catch (e) {} }
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
            const mainPrefix = tableName.toUpperCase() + "_";
            
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
                            const localColName = `${mainPrefix}${col}`;
                            selectParts.push(`T1."${col}" AS "${localColName}"`);
                            colSourceMap[localColName] = col;
                        }
                        joinParts.push(`LEFT JOIN ${secondaryTable} ${alias} ON T1."${col}" = ${alias}."${joinField}"`);
                    } else {
                        const localColName = `${mainPrefix}${col}`;
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
                    const reserved = ['WHERE','AND','OR','LIKE','IN','NULL','IS','NOT','BETWEEN','ORDER','BY','DESC','ASC','DATE','TO_DATE','TO_CHAR','NVL','COALESCE','TRIM','UPPER','LOWER','SUBSTR','INSTR','COUNT','SUM','ROWNUM'];
                    
                    formattedWhere = formattedWhere.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
                        if (reserved.includes(match.toUpperCase())) return match;
                        return `T1."${match}"`;
                    });
                    query += ` ${formattedWhere}`;
                }

                const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                const localTableName = `oracle_${tableName.toLowerCase()}`;
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
                                if (originalFieldName && tableDateFields.includes(originalFieldName)) {
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
            try { await connection.close(); } catch (e) {}
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

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
        res.json({ tickets });
    } catch (error) {
        console.error('[GLPI] Erreur tickets récents:', error.message);
        res.status(500).json({ message: 'Erreur lors de la récupération des tickets récents' });
    }
});

// Route : Synchroniser les 100 derniers tickets (Date Création Desc)
app.post('/api/glpi/sync-tickets', authenticateAdmin, async (req, res) => {
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

        // 1. Init & Activate Session
        const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
        const sessionToken = sessionRes.data?.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

        // 2. Recherche des 100 derniers par DATE DE CRÉATION (Champ 15)
        // Ajout du champ 22 (Email du demandeur) en plus du 34 car selon les versions GLPI, l'un ou l'autre est rempli
        const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22];
        const forcedStr = forcedFields.map((id, idx) => `forcedisplay[${idx}]=${id}`).join('&');
        const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-100&sort=15&order=DESC&get_all_entities=1&${forcedStr}`;
        const ticketsRes = await axios.get(searchUrl, { headers: commonHeaders });
        
        if (ticketsRes.data && Array.isArray(ticketsRes.data.data)) {
            const tickets = ticketsRes.data.data;
            let processedCount = 0;

            // Initialisation du statut
            glpiSyncProgress = {
                active: true,
                processed: 0,
                total: tickets.length,
                startTime: new Date().toISOString(),
                lastUpdate: new Date().toISOString()
            };
            
            // 3. Insertion par lots (ou individuel avec INSERT OR REPLACE)
            // Helper function to safely extract values from GLPI response, handling objects and nulls
            const val = (t, id) => {
                const v = t[id];
                if (v === undefined || v === null) return '';
                if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
                return String(v);
            };

            for (const t of tickets) {
                // Email : priorité au champ 34, sinon 22
                const email = val(t, 34) || val(t, 22);

                await db.run(`INSERT OR REPLACE INTO tickets (
                    glpi_id, title, status, priority, urgency, impact, 
                    category, type, date_creation, date_mod, date_closed, date_solved, 
                    location, solution, source, entity, requester_name, requester_email
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    t[2], // glpi_id
                    val(t, 1), // title
                    val(t, 12), // status
                    val(t, 3) || 0, // priority
                    val(t, 10) || 0, // urgency
                    val(t, 11) || 0, // impact
                    val(t, 7), // category
                    val(t, 14), // type
                    val(t, 15), // date_creation
                    val(t, 19) || val(t, 15), // date_mod
                    val(t, 16) || null, // date_closed
                    val(t, 17) || null, // date_solved
                    val(t, 83), // location
                    val(t, 24), // solution
                    val(t, 9), // source
                    val(t, 80), // entity
                    val(t, 4) || 'Inconnu', // requester_name
                    email // requester_email
                ]);
                processedCount++;
                glpiSyncProgress.processed = processedCount;
                glpiSyncProgress.lastUpdate = new Date().toISOString();
            }
            
            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
            res.json({ success: true, count: tickets.length });
        } else {
            glpiSyncProgress.active = false;
            res.json({ success: true, count: 0 });
        }
    } catch (error) {
        glpiSyncProgress.active = false;
        console.error('[GLPI] Erreur Sync:', error.message);
        res.status(500).json({ message: `Erreur Sync: ${error.message}` });
    }
});

// État global pour le suivi de la synchronisation GLPI
let glpiSyncProgress = {
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

// Route : Synchroniser TOUS les tickets GLPI (Pagination par 500)
app.post('/api/glpi/sync-all-tickets', authenticateAdmin, async (req, res) => {
    let sessionToken = null;
    let url = null;
    let commonHeaders = null;

    try {
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

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

        // 2. Obtenir le compte total
        const countRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`, { headers: commonHeaders });
        const totalCount = parseInt(countRes.data.totalcount, 10) || 0;
        console.log(`[GLPI Sync] Début synchronisation totale. Total estimé: ${totalCount}`);

        // Initialisation du statut
        glpiSyncProgress = {
            active: true,
            processed: 0,
            total: totalCount,
            startTime: new Date().toISOString(),
            lastUpdate: new Date().toISOString()
        };

        if (totalCount === 0) {
            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
            return res.json({ success: true, count: 0, message: 'Aucun ticket à synchroniser.' });
        }

        const batchSize = 500;
        let processedCount = 0;

        // Préparation insertion
        const insertStmt = await db.prepare(`
            INSERT OR REPLACE INTO tickets (
                glpi_id, title, status, priority, urgency, impact, category, type, 
                date_creation, date_mod, date_closed, date_solved, 
                location, solution, source, entity, requester_name, requester_email
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Utilisation d'une transaction pour la performance
        await db.run('BEGIN TRANSACTION');

        try {
            // Helper function to safely extract values from GLPI response, handling objects and nulls
            const val = (t, id) => {
                const v = t[id];
                if (v === undefined || v === null) return '';
                if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
                return v;
            };

            for (let start = 0; start < totalCount; start += batchSize) {
                const end = Math.min(start + batchSize, totalCount);
                console.log(`[GLPI Sync] Récupération tickets ${start}-${end}...`);
                
                // forcedisplay pour tous les champs requis. Ajout du 22 (Email) car le 34 est parfois vide.
                const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22];
                const forcedStr = forcedFields.map((id, idx) => `forcedisplay[${id}]=${id}`).join('&');
                // GLPI Range est inclusif (0-499 = 500 items). On utilise donc start-${end-1}
                const batchRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=${start}-${end-1}&get_all_entities=1&${forcedStr}`, { headers: commonHeaders });
                
                if (batchRes.data && Array.isArray(batchRes.data.data)) {
                    for (const t of batchRes.data.data) {
                        // Email : priorité au champ 34, sinon 22
                        const email = val(t, 34) || val(t, 22);

                        await insertStmt.run(
                            t[2], // glpi_id
                            val(t, 1), // title
                            val(t, 12), // status
                            val(t, 3) || 0, // priority
                            val(t, 10) || 0, // urgency
                            val(t, 11) || 0, // impact
                            val(t, 7), // category
                            val(t, 14), // type
                            val(t, 15), // date_creation
                            val(t, 19) || val(t, 15), // date_mod
                            val(t, 16) || null, // date_closed
                            val(t, 17) || null, // date_solved
                            val(t, 83), // location
                            val(t, 24), // solution
                            val(t, 9), // source
                            val(t, 80), // entity
                            val(t, 4) || 'Inconnu', // requester_name
                            email // requester_email
                        );
                        processedCount++;
                        glpiSyncProgress.processed = processedCount;
                        glpiSyncProgress.lastUpdate = new Date().toISOString();
                    }
                }
            }
            glpiSyncProgress.active = false;
            await db.run('COMMIT');
            console.log(`[GLPI Sync] Synchronisation terminée : ${processedCount} tickets.`);
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        } finally {
            await insertStmt.finalize();
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
        res.json({ success: true, count: processedCount, total: totalCount });

    } catch (error) {
        console.error('[GLPI] Erreur Sync Totale:', error.message);
        if (sessionToken && url && commonHeaders) {
            try { await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders }); } catch (e) {}
        }
        glpiSyncProgress.active = false;
        res.status(500).json({ message: `Erreur Synchronisation Totale: ${error.message}` });
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
    const { host, port, base_dn, bind_dn, bind_password } = req.body;
    
    const logMsg = `Ping AD: Tentative de liaison pour ${host}:${port} avec ${bind_dn}`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

    const client = ldap.createClient({
        url: `ldap://${host}:${port}`,
        connectTimeout: 5000,
        timeout: 5000
    });

    client.on('error', (err) => {
        console.error('LDAP Ping Client Error:', err.message);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Ping AD Erreur: ${err.message}
`);
        res.status(500).json({ success: false, message: `Impossible de contacter le serveur : ${err.message}` });
    });

    client.bind(bind_dn, bind_password, (err) => {
        if (err) {
            client.destroy();
            console.error('AD Ping Bind Error:', err.message);
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Ping AD Echec Bind: ${err.message}\n`);
            return res.status(401).json({ success: false, message: `Liaison échouée : ${err.message}` });
        }
        client.destroy();
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Ping AD Succès\n`);
        res.json({ success: true, message: 'La liaison avec l\'Active Directory a réussi !' });
    });});

// Route de test Active Directory (Outil de recherche / Lookup)
app.post('/api/auth/ad-test', authenticateAdmin, async (req, res) => {
    const { host, port, base_dn, bind_dn, bind_password, username } = req.body;
    
    const logMsg = `Lookup AD: Recherche d'infos pour ${username} via le compte technique ${bind_dn}`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

    const client = ldap.createClient({
        url: `ldap://${host}:${port}`,
        connectTimeout: 5000,
        timeout: 5000
    });

    client.on('error', (err) => {
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD Erreur: ${err.message}
`);
        res.status(500).json({ success: false, message: `Erreur client LDAP : ${err.message}` });
    });

    client.bind(bind_dn, bind_password, (err) => {
        if (err) {
            client.destroy();
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD Echec Bind: ${err.message}
`);
            return res.status(401).json({ success: false, message: `Liaison technique échouée : ${err.message}` });
        }

        const searchOptions = {
            filter: `(|(sAMAccountName=${username}*)(cn=${username}*)(mail=${username}*))`,
            scope: 'sub',
            attributes: ['dn', 'cn', 'mail', 'displayName', 'memberOf', 'title', 'department', 'sAMAccountName'],
            referrals: false,
            paged: true
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
                    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD: Utilisateur non trouvé\n`);
                    return res.status(404).json({ success: false, message: `Utilisateur "${username}" non trouvé dans l'AD.` });
                }

                // Trier pour privilégier l'exact match
                const exactMatch = entries.find(e => e.sAMAccountName && e.sAMAccountName.toLowerCase() === username.toLowerCase());
                const userEntry = exactMatch || entries[0];

                fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] Lookup AD: Succès pour ${username} (Match: ${userEntry.sAMAccountName})\n`);
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
        const logPath = path.join(__dirname, 'mouchard.log');
        if (!fs.existsSync(logPath)) return res.send("Aucun log disponible.");
        
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
    } catch (e) {}

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
                VALUES (1, 0, "10.103.130.118", 389, "DC=ivry,DC=local", "gantto", "CN=testo,OU=IRS,OU=IVRY,DC=ivry,DC=local", "")

            `);
        }
    } catch (e) {
        console.error('Erreur init ad_settings:', e);
    }

    // Recalcul au démarrage
    await recalculateAllOperations();

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
        const categories = await db.all('SELECT * FROM magapp_categories ORDER BY display_order ASC, name ASC');
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
});

app.get('/api/magapp/apps', async (req, res) => {
    try {
        const apps = await db.all('SELECT * FROM magapp_apps ORDER BY name ASC');
        res.json(apps);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching apps' });
    }
});

// Route de test de connectivité des applications
app.post('/api/magapp/health-check', async (req, res) => {
    try {
        const apps = await db.all('SELECT id, url FROM magapp_apps WHERE is_maintenance = 0');
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
        const favorites = await db.all('SELECT app_id FROM magapp_favorites WHERE username = ?', [username]);
        res.json(favorites.map(f => f.app_id));
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture favoris' });
    }
});

app.post('/api/magapp/favorites', async (req, res) => {
    const { username, app_id } = req.body;
    if (!username || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await db.run('INSERT OR IGNORE INTO magapp_favorites (username, app_id) VALUES (?, ?)', [username, app_id]);
        res.json({ message: 'Ajouté aux favoris' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur ajout favoris' });
    }
});

app.delete('/api/magapp/favorites', async (req, res) => {
    const { username, app_id } = req.query;
    if (!username || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await db.run('DELETE FROM magapp_favorites WHERE username = ? AND app_id = ?', [username, app_id]);
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
        await db.run(
            'INSERT INTO magapp_clicks (app_id, username, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [app_id, username || 'Anonyme', ip_address, user_agent]
        );
        res.json({ message: 'Click recorded' });
    } catch (error) {
        res.status(500).json({ message: 'Error recording click', error: error.message });
    }
});

app.post('/api/magapp/subscribe', async (req, res) => {
    const { app_id, email } = req.body;
    if (!app_id || !email) return res.status(400).json({ message: 'Données manquantes' });

    try {
        await db.run(
            'INSERT OR IGNORE INTO magapp_subscriptions (app_id, email) VALUES (?, ?)',
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
        const tickets = await db.all(`
            SELECT glpi_id, title, status_label, date_creation, type, status
            FROM v_tickets 
            WHERE search_email = ? OR search_username = ?
            ORDER BY glpi_id DESC
        `, [email.toLowerCase(), username]);
        res.json(tickets);
    } catch (err) {
        console.error('Erreur tickets list:', err);
        res.status(500).json({ message: 'Erreur lecture tickets' });
    }
});

app.get('/api/magapp/tickets-count', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    try {
        const username = email.split('@')[0].toLowerCase();
        const result = await db.get(`
            SELECT COUNT(*) as count 
            FROM v_tickets 
            WHERE (search_email = ? OR search_username = ?) AND status != 6
        `, [email.toLowerCase(), username]);
        res.json({ count: result.count || 0 });
    } catch (err) {
        console.error('Erreur tickets-count:', err);
        res.status(500).json({ message: 'Erreur lecture tickets' });
    }
});

app.get('/api/magapp/user-subscriptions', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    try {
        const subs = await db.all('SELECT app_id FROM magapp_subscriptions WHERE email = ?', [email]);
        res.json(subs.map(s => s.app_id));
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture abonnements' });
    }
});

app.delete('/api/magapp/user-subscriptions', async (req, res) => {
    const { email, app_id } = req.query;
    if (!email || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await db.run('DELETE FROM magapp_subscriptions WHERE email = ? AND app_id = ?', [email, app_id]);
        res.json({ message: 'Désabonné avec succès' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur désabonnement' });
    }
});

app.get('/api/magapp/user-subscriptions', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    try {
        const subs = await db.all('SELECT app_id FROM magapp_subscriptions WHERE email = ?', [email]);
        res.json(subs.map(s => s.app_id));
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture abonnements' });
    }
});

app.delete('/api/magapp/user-subscriptions', async (req, res) => {
    const { email, app_id } = req.query;
    if (!email || !app_id) return res.status(400).json({ message: 'Données manquantes' });
    try {
        await db.run('DELETE FROM magapp_subscriptions WHERE email = ? AND app_id = ?', [email, app_id]);
        res.json({ message: 'Désabonné avec succès' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur désabonnement' });
    }
});

app.get('/api/magapp/subscriptions', authenticateAdmin, async (req, res) => {
    try {
        const subs = await db.all(`
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
        await db.run('DELETE FROM magapp_subscriptions WHERE id = ?', [req.params.id]);
        res.json({ message: 'Abonnement supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression abonnement', error: error.message });
    }
});

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
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(500).json({ message: 'Erreur lors de la gestion du fichier uploadé', error: err.message });
    } else if (err) {
        // An unknown error occurred when uploading.
        const logMsg = `Unknown Error during upload: ${err.message}`;
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(500).json({ message: "Erreur inconnue lors de l'upload", error: err.message });
    }
    // If no error, proceed to the next middleware/route handler
    next();
}, upload.single('file'), async (req, res) => {
    if (!req.file) {
        const logMsg = 'No file received in /api/magapp/icons/upload';
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
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
        const stats = await db.all(`
            SELECT 
                a.id,
                a.name,
                COALESCE(total_info.total_clicks, 0) as total_clicks,
                COALESCE(today_info.today_clicks, 0) as today_clicks,
                CASE WHEN COALESCE(today_info.today_clicks, 0) > 0 THEN 1 ELSE 0 END as has_today_stats,
                ROUND(CAST(COALESCE(total_info.total_clicks, 0) AS REAL) / COALESCE(total_info.total_days, 1), 2) as avg_clicks_per_day,
                ROUND(CAST(COALESCE(total_info.unique_users_total, 0) AS REAL) / COALESCE(total_info.total_days, 1), 2) as avg_unique_users_per_day
            FROM magapp_apps a
            LEFT JOIN (
                SELECT app_id, COUNT(*) as total_clicks, COUNT(DISTINCT date(clicked_at, 'localtime')) as total_days, COUNT(DISTINCT COALESCE(username, ip_address)) as unique_users_total
                FROM magapp_clicks GROUP BY app_id
            ) total_info ON a.id = total_info.app_id
            LEFT JOIN (
                SELECT app_id, COUNT(*) as today_clicks
                FROM magapp_clicks 
                WHERE date(clicked_at, 'localtime') = date('now', 'localtime')
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
app.post('/api/magapp/categories', authenticateAdmin, async (req, res) => {
    const { name, icon, display_order } = req.body;
    try {
        const result = await db.run('INSERT INTO magapp_categories (name, icon, display_order) VALUES (?, ?, ?)', [name, icon, display_order || 0]);
        res.json({ id: result.lastID, message: 'Catégorie créée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur création', error: error.message });
    }
});

app.put('/api/magapp/categories/:id', authenticateAdmin, async (req, res) => {
    const { name, icon, display_order } = req.body;
    try {
        await db.run('UPDATE magapp_categories SET name = ?, icon = ?, display_order = ? WHERE id = ?', [name, icon, display_order || 0, req.params.id]);
        res.json({ message: 'Catégorie mise à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
    }
});

app.delete('/api/magapp/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM magapp_categories WHERE id = ?', [req.params.id]);
        res.json({ message: 'Catégorie supprimée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression', error: error.message });
    }
});

app.post('/api/magapp/apps', authenticateAdmin, async (req, res) => {
    const { category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end } = req.body;
    try {
        const result = await db.run('INSERT INTO magapp_apps (category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [category_id, name, description, url, icon, display_order || 0, is_maintenance ? 1 : 0, maintenance_start || null, maintenance_end || null]);
        res.json({ id: result.lastID, message: 'Application créée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur création', error: error.message });
    }
});

app.put('/api/magapp/apps/:id', authenticateAdmin, async (req, res) => {
    const { category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end } = req.body;
    try {
        const oldApp = await db.get('SELECT is_maintenance FROM magapp_apps WHERE id = ?', [req.params.id]);
        
        await db.run('UPDATE magapp_apps SET category_id = ?, name = ?, description = ?, url = ?, icon = ?, display_order = ?, is_maintenance = ?, maintenance_start = ?, maintenance_end = ? WHERE id = ?', [category_id, name, description, url, icon, display_order || 0, is_maintenance ? 1 : 0, maintenance_start || null, maintenance_end || null, req.params.id]);
        
        // Si on vient d'activer la maintenance, on prévient les abonnés
        if (is_maintenance && (!oldApp || !oldApp.is_maintenance)) {
            sendMaintenanceEmail(req.params.id).catch(err => console.error("Error in sendMaintenanceEmail:", err));
        }

        res.json({ message: 'Application mise à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
    }
});

app.delete('/api/magapp/apps/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM magapp_apps WHERE id = ?', [req.params.id]);
        res.json({ message: 'Application supprimée' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur suppression', error: error.message });
    }
});

// Mail API
app.get('/api/mail-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM mail_settings WHERE id = 1');
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres mail' });
    }
});

app.post('/api/mail-settings', authenticateAdmin, async (req, res) => {
    const s = req.body;
    try {
        await db.run(`
            UPDATE mail_settings SET 
                smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, 
                smtp_secure = ?, proxy_host = ?, proxy_port = ?, 
                sender_email = ?, sender_name = ?, api_key = ?, template_html = ?
            WHERE id = 1
        `, [
            s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, 
            s.smtp_secure, s.proxy_host, s.proxy_port, 
            s.sender_email, s.sender_name, s.api_key, s.template_html
        ]);
        res.json({ message: 'Paramètres mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur mise à jour paramètres mail' });
    }
});

app.post('/api/send-test-mail', authenticateAdmin, async (req, res) => {
    const { to } = req.body;
    try {
        const logMsg = `Tentative d'envoi de mail de test à: ${to}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

        await sendMail(to, "Test d'envoi DSI Hub", "<p>Ceci est un mail de test envoyé depuis le paramétrage du <strong>DSI Hub Ivry</strong>.</p><p>Si vous recevez ce message, la configuration est correcte.</p>");
        res.json({ message: 'Mail de test envoyé avec succès' });
    } catch (error) {
        const errMsg = `ÉCHEC envoi mail de test: ${error.message}`;
        console.error(errMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${errMsg}
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
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
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
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
            return res.status(500).json({ message: 'Erreur Multer', error: err.message });
        }
        next();
    });
}, async (req, res) => {
    if (!req.file) {
        const logMsg = 'No file received in /api/certificates/upload';
        console.error(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ERREUR: ${logMsg}
`);
        return res.status(400).send('No file uploaded.');
    }

    try {
        const filePath = req.file.path;
        const fileName = req.file.originalname;
        let content = '';
        
        const logMsg = `Processing file: ${filePath}`;
        console.log(logMsg);
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logMsg}
`);

        if (fileName.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            content = pdfData.text;
            const logParsed = `PDF Parsed successfully. Text length: ${content.length}`;
            console.log(logParsed);
            fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ${logParsed}
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
                } catch (e) {}
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
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] ERREUR CRITIQUE: ${logErr}
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
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), errMsg);
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
        res.json(databases);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture bases de données', error: error.message });
    }
});

app.get('/api/admin/sql/tables', authenticateAdmin, async (req, res) => {
    try {
        const dbName = typeof req.query.db === 'string' && req.query.db ? req.query.db.replace(/[^a-zA-Z0-9_]/g, '') : 'main';
        const tables = await db.all(`SELECT name, type FROM "${dbName}".sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`);
        res.json(tables);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture tables', error: error.message });
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
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ message: 'Requête SQL requise' });
    
    const startTime = Date.now();
    try {
        let records;
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA');
        
        if (isSelect) {
            records = await db.all(sql);
        } else {
            const result = await db.run(sql);
            records = [{ changes: result.changes, lastID: result.lastID }];
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
    const { username, password } = req.body;
    
    // 1. Tentative via Active Directory si activé
    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (adSettings && adSettings.is_enabled) {
            const adUser = await authenticateAD(username, password, adSettings);
            if (adUser) {
                // L'utilisateur est authentifié AD. On cherche son profil localement.
                let user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
                
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
                }            }
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
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/admin/access-requests/:id/approve', authenticateAdmin, async (req, res) => {
    try {
        const request = await db.get('SELECT * FROM access_requests WHERE id = ?', [req.params.id]);
        if (!request) return res.status(404).json({ message: 'Demande non trouvée' });

        await db.run('BEGIN TRANSACTION');
        // Approuver la demande
        await db.run('UPDATE access_requests SET status = "approved" WHERE id = ?', [req.params.id]);
        // Approuver l'utilisateur
        await db.run('UPDATE users SET is_approved = 1 WHERE id = ?', [request.user_id]);
        // Note: Ici on pourrait aussi associer les tuiles si nécessaire
        await db.run('COMMIT');

        res.json({ message: 'Demande approuvée' });
    } catch (error) {
        await db.run('ROLLBACK');
        res.status(500).json({ message: error.message });
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
    try {
        const tiles = await db.all('SELECT * FROM tiles ORDER BY sort_order');
        
        for (const tile of tiles) {
            tile.links = await db.all('SELECT * FROM tile_links WHERE tile_id = ?', [tile.id]);
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
        fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${time}] POST /api/tiers/import - 200 - par ${req.user.username}: ${msg}
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
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), logMsg);
    
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
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), logMsg);

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
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), line);
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
                } catch (e) {}
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
    const users = await db.all('SELECT id, username, role, is_approved, last_activity, service_code, service_complement FROM users');
    res.json(users);
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

        await db.run('BEGIN TRANSACTION');
        await db.run('UPDATE access_requests SET status = "approved" WHERE id = ?', [req.params.id]);
        await db.run('UPDATE users SET is_approved = 1 WHERE id = ?', [request.user_id]);
        await db.run('COMMIT');

        res.json({ message: 'Demande approuvée' });
    } catch (error) {
        await db.run('ROLLBACK');
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

        // 1. Récupérer les colonnes réelles de la source
        let realCols = [];
        try {
            const info = await db.all(pragmaSql);
            realCols = info.map(c => c.name);
        } catch (e) {}

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
});app.post('/api/column-settings/:page', authenticateAdminOrFinances, async (req, res) => {
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

    let transporter;
    
    // Si un hôte SMTP est défini, on utilise le transport SMTP classique
    if (s.smtp_host) {
        transporter = nodemailer.createTransport({
            host: s.smtp_host,
            port: s.smtp_port,
            secure: s.smtp_secure === 'ssl', // true for 465, false for other ports
            auth: {
                user: s.smtp_user,
                pass: s.smtp_pass,
            },
            tls: {
                // Do not fail on invalid certs if using internal relays
                rejectUnauthorized: false
            }
        });
    } else {
        // Fallback sur Brevo si configuré
        transporter = nodemailer.createTransport(
            new brevoTransport({
                apiKey: s.smtp_pass
            })
        );
    }

    let html = (s.template_html || '{{content}}').replace('{{content}}', content);

    // Gmail et les boites perso bloquent souvent les CID ou les pièces jointes si le relais SMTP n'est pas "propre"
    // Le logo fait 17ko, on peut l'injecter en Base64 directement dans le HTML pour une compatibilité maximale
    if (html.includes('cid:logo_dsi')) {
        const logoPath = path.join(__dirname, 'magapp_img', 'logo_dsi.png');
        if (fs.existsSync(logoPath)) {
            const logoBase64 = fs.readFileSync(logoPath).toString('base64');
            html = html.replace('cid:logo_dsi', `data:image/png;base64,${logoBase64}`);
        }
    }

    const mailOptions = {
        from: `"${s.sender_name}" <${s.sender_email}>`,
        to,
        subject,
        html,
        attachments: []
    };

    await transporter.sendMail(mailOptions);
}

    async function sendMaintenanceEmail(appId) {
    try {
        const app = await db.get('SELECT * FROM magapp_apps WHERE id = ?', [appId]);
        if (!app) return;

        const subs = await db.all('SELECT email FROM magapp_subscriptions WHERE app_id = ?', [appId]);
        if (subs.length === 0) return;

        const subject = `[DSI Hub] Maintenance en cours : ${app.name}`;
        const content = `
            <h2>Alerte Maintenance</h2>
            <p>L'application <strong>${app.name}</strong> est actuellement en maintenance.</p>
            <p><strong>Début :</strong> ${new Date(app.maintenance_start).toLocaleString('fr-FR')}</p>
            <p><strong>Fin estimée :</strong> ${new Date(app.maintenance_end).toLocaleString('fr-FR')}</p>
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