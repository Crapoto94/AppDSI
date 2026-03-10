const express = require('express');
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

/**
 * Tente d'authentifier un utilisateur via Active Directory
 * @returns {Promise<Object|null>} L'utilisateur AD ou null si échec
 */
async function authenticateAD(username, password, config) {
    return new Promise((resolve, reject) => {
        if (!config.is_enabled) return resolve(null);

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 5000,
            timeout: 5000
        });

        client.on('error', (err) => {
            console.error('LDAP Client Error:', err.message);
            resolve(null);
        });

        // 1. Liaison avec le compte technique (Bind DN)
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                console.error('AD Bind DN Error:', err.message);
                client.destroy();
                return reject(new Error('Erreur de liaison AD : ' + err.message));
            }

            // 2. Recherche de l'utilisateur par son sAMAccountName
            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['dn', 'cn', 'memberOf', 'mail', 'displayName']
            };

            client.search(config.base_dn, searchOptions, (err, res) => {
                if (err) {
                    client.destroy();
                    return reject(new Error('Erreur de recherche AD : ' + err.message));
                }

                let userEntry = null;

                res.on('searchEntry', (entry) => {
                    userEntry = entry.object;
                });

                res.on('error', (err) => {
                    client.destroy();
                    reject(new Error('Erreur lors de la recherche AD : ' + err.message));
                });

                res.on('end', (result) => {
                    if (!userEntry) {
                        client.destroy();
                        return resolve(null); // Utilisateur non trouvé
                    }

                    // 3. Vérification du mot de passe de l'utilisateur (Re-bind avec son DN)
                    const userClient = ldap.createClient({
                        url: `ldap://${config.host}:${config.port}`,
                        connectTimeout: 5000,
                        timeout: 5000
                    });

                    userClient.bind(userEntry.dn, password, (err) => {
                        userClient.destroy();
                        client.destroy();

                        if (err) {
                            return resolve(null); // Mot de passe incorrect
                        }

                        // 4. Vérification de l'appartenance au groupe si requis
                        if (config.required_group) {
                            const groups = Array.isArray(userEntry.memberOf) ? userEntry.memberOf : [userEntry.memberOf];
                            const hasGroup = groups.some(g => g && g.toLowerCase().includes(config.required_group.toLowerCase()));
                            if (!hasGroup) {
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
                    const attrs = entry.pojo ? entry.pojo.attributes : [];
                    const obj = entry.object || {};
                    const getAttr = (name) => obj[name] || attrs.find(a => a.type === name)?.values[0];

                    // Si on trouve plusieurs résultats, on prend celui qui match EXACTEMENT le login (insensible à la casse)
                    const foundSam = getAttr('sAMAccountName');
                    if (foundSam && foundSam.toLowerCase() === username.toLowerCase()) {
                        userEntry = {
                            displayName: getAttr('displayName') || getAttr('cn') || foundSam,
                            mail: getAttr('mail') || ''
                        };
                    } else if (!userEntry) {
                        // Premier résultat par défaut si pas encore de match exact
                        userEntry = {
                            displayName: getAttr('displayName') || getAttr('cn') || getAttr('sAMAccountName'),
                            mail: getAttr('mail') || ''
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
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174',
        'http://po22038:5173',
        'http://po22038:5174',
        'http://PO22038:5173',
        'http://PO22038:5174'
    ],
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
    const redirectUrl = req.query.redirect || 'http://localhost:5174';
    
    fs.appendFileSync(path.join(__dirname, 'mouchard.log'), `[${new Date().toISOString()}] SSO Redirect triggered. Detected login: ${login}
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

// Active Directory Settings API
app.get('/api/ad-settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lecture paramètres AD' });
    }
});

app.post('/api/ad-settings', authenticateAdmin, async (req, res) => {
    const { is_enabled, host, port, base_dn, required_group, bind_dn, bind_password } = req.body;
    try {
        await db.run(
            'UPDATE ad_settings SET is_enabled = ?, host = ?, port = ?, base_dn = ?, required_group = ?, bind_dn = ?, bind_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
            [is_enabled ? 1 : 0, host, port, base_dn, required_group, bind_dn, bind_password]
        );
        res.json({ message: 'Paramètres AD enregistrés' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur enregistrement paramètres AD' });
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
            filter: `(|(sAMAccountName=*${username}*)(cn=*${username}*)(displayName=*${username}*))`,
            scope: 'sub',
            attributes: ['dn', 'cn', 'mail', 'displayName', 'memberOf', 'title', 'department']
        };

        client.search(base_dn, searchOptions, (err, searchRes) => {
            if (err) {
                client.destroy();
                return res.status(500).json({ success: false, message: `Erreur recherche : ${err.message}` });
            }

            let entries = [];
            searchRes.on('searchEntry', (entry) => { 
                const attrs = entry.pojo ? entry.pojo.attributes : [];
                const obj = entry.object || {};
                
                entries.push({
                    dn: entry.pojo ? entry.pojo.objectName : entry.dn,
                    cn: obj.cn || attrs.find(a => a.type === 'cn')?.values[0],
                    sAMAccountName: obj.sAMAccountName || attrs.find(a => a.type === 'sAMAccountName')?.values[0],
                    displayName: obj.displayName || attrs.find(a => a.type === 'displayName')?.values[0],
                    mail: obj.mail || attrs.find(a => a.type === 'mail')?.values[0],
                    memberOf: obj.memberOf || attrs.find(a => a.type === 'memberOf')?.values,
                    title: obj.title || attrs.find(a => a.type === 'title')?.values[0],
                    department: obj.department || attrs.find(a => a.type === 'department')?.values[0]
                });
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
    const dir = path.join(__dirname, '../frontend/public/img');
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const files = fs.readdirSync(dir);
        res.json(files.map(f => `/img/${f}`));
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

// Auth Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // 1. Tentative via Active Directory si activé
    try {
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (adSettings && adSettings.is_enabled) {
            const adUser = await authenticateAD(username, password, adSettings);
            if (adUser) {
                // L'utilisateur est authentifié AD. On cherche son rôle localement.
                const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
                
                if (!user) {
                    return res.status(403).json({ message: "Compte AD valide, mais non autorisé dans l'application. Contactez un administrateur." });
                }

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
                        service_complement: user.service_complement 
                    } 
                });
            }
        }
    } catch (error) {
        console.error('AD Auth error during login:', error.message);
        // On continue vers l'auth locale en cas d'erreur AD (mode dégradé)
    }

    // 2. Auth locale (Fallback ou comptes locaux)
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (user && user.password && await bcrypt.compare(password, user.password)) {
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
                WHERE LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM orders)
                   OR LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM invoices)
            `;
        }
        
        query += ` ORDER BY t.nom`;
        
        const tiers = await db.all(query);

        // Global stats for the view
        const globalStats = await db.get(`
            SELECT 
                (SELECT COUNT(*) FROM orders) as total_orders,
                (SELECT COUNT(*) FROM invoices) as total_invoices,
                (SELECT COUNT(*) FROM tiers) as total_tiers_all,
                (SELECT COUNT(DISTINCT LOWER(TRIM(t.nom))) FROM tiers t WHERE LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM orders) OR LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM invoices)) as total_tiers_dsi
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
app.get('/api/tiers/:id/orders', authenticateJWT, async (req, res) => {
    console.log(`Fallback orders route called for ID: ${req.params.id}`);
    res.redirect(`/api/tiers/${req.params.id}/history`);
});

app.get('/api/tiers/:id/history', authenticateJWT, async (req, res) => {
    try {
        const tier = await db.get('SELECT nom FROM tiers WHERE id = ?', [req.params.id]);
        if (!tier) return res.status(404).json({ message: 'Tiers non trouvé' });

        const tierNom = tier.nom.trim();
        
        // Recherche robuste
        const orders = await db.all('SELECT * FROM orders WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?)) OR "Fournisseur" LIKE ?', [tierNom, `%${tierNom}%`]);
        const invoices = await db.all('SELECT * FROM invoices WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?)) OR "Fournisseur" LIKE ?', [tierNom, `%${tierNom}%`]);
        
        console.log(`Found ${orders.length} orders and ${invoices.length} invoices for ${tierNom}`);

        // Version ultra-simplifiée pour test
        const invoicesList = invoices.map(inv => ({
            number: inv['N° Facture fournisseur'] || inv['N° Facture interne'] || 'Inconnu',
            total_ttc: parseFloat(String(inv['Montant TTC']).replace(',', '.').replace(/[^\d.-]/g, '')) || 0,
            lines: [inv],
            hasFile: false,
            filePath: null
        }));

        res.json({
            orders: orders.map(o => ({ ...o, matchedInvoices: [] })),
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
        res.status(500).json({ message: "Erreur lors de l'import", error: error.message });
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
        await updateTierStats(db);
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

app.get('/api/telecom/accounts', authenticateJWT, async (req, res) => {
    try {
        const accounts = await db.all(`
            SELECT a.*, o.name as operator_name
            FROM telecom_billing_accounts a
            JOIN telecom_operators o ON a.operator_id = o.id
            ORDER BY o.name, a.account_number
        `);
        // Note: commitment_number est déjà dans a.* (telecom_billing_accounts)
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching accounts', error: error.message });
    }
});

app.post('/api/telecom/accounts', authenticateAdmin, async (req, res) => {
    const { operator_id, account_number, label } = req.body;
    try {
        const result = await db.run('INSERT INTO telecom_billing_accounts (operator_id, account_number, label) VALUES (?, ?, ?)', [operator_id, account_number, label]);
        res.json({ id: result.lastID, message: 'Compte créé' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating account', error: error.message });
    }
});

app.put('/api/telecom/accounts/:id', authenticateAdmin, async (req, res) => {
    const { operator_id, account_number, label } = req.body;
    try {
        await db.run('UPDATE telecom_billing_accounts SET operator_id = ?, account_number = ?, label = ? WHERE id = ?', [operator_id, account_number, label, req.params.id]);
        res.json({ message: 'Compte mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating account', error: error.message });
    }
});

app.delete('/api/telecom/accounts/:id', authenticateAdmin, async (req, res) => {
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
    const { commitment_number, operator_id, billing_account_id, label, amount_ttc, start_date, end_date } = req.body;
    try {
        const result = await db.run('INSERT INTO telecom_commitments (commitment_number, operator_id, billing_account_id, label, amount_ttc, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)', [commitment_number, operator_id, billing_account_id, label, amount_ttc, start_date, end_date]);
        res.json({ id: result.lastID, message: 'Engagement créé' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating commitment', error: error.message });
    }
});

app.put('/api/telecom/commitments/:id', authenticateAdmin, async (req, res) => {
    const { commitment_number, operator_id, billing_account_id, label, amount_ttc, start_date, end_date } = req.body;
    try {
        await db.run('UPDATE telecom_commitments SET commitment_number = ?, operator_id = ?, billing_account_id = ?, label = ?, amount_ttc = ?, start_date = ?, end_date = ? WHERE id = ?', [commitment_number, operator_id, billing_account_id, label, amount_ttc, start_date, end_date, req.params.id]);
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
        // Map common aliases
        let dbPage = page;
        if (page === 'lines') dbPage = 'budget_lines';
        
        const settings = await db.all('SELECT * FROM column_settings WHERE page = ? ORDER BY display_order', [dbPage]);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching column settings' });
    }
});

app.post('/api/column-settings/:page', authenticateAdminOrFinances, async (req, res) => {
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
        const relativePath = req.file.path.replace(__dirname + path.sep, '').replace(/\\/g, '/');
        
        // Supprimer l'ancien fichier s'il existe (remplacement)
        const existing = await db.get('SELECT file_path FROM attachments WHERE target_type = ? AND target_id = ?', [target_type, target_id]);
        if (existing) {
            const oldPath = path.join(__dirname, existing.file_path);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            await db.run('DELETE FROM attachments WHERE target_type = ? AND target_id = ?', [target_type, target_id]);
        }

        await db.run(
            'INSERT INTO attachments (target_type, target_id, file_path, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?, ?)',
            [target_type, target_id, relativePath, req.file.originalname, req.file.mimetype, req.file.size]
        );
        res.json({ message: 'Upload réussi' });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading attachment', error: error.message });
    }
});

// Helper Mail
async function sendMail(to, subject, content) {
    const s = await db.get('SELECT * FROM mail_settings WHERE id = 1');
    if (!s) throw new Error("Paramètres mail non configurés");

    const transporter = nodemailer.createTransport(
        new brevoTransport({
            apiKey: s.smtp_pass
        })
    );

    const html = s.template_html.replace('{{content}}', content);

    await transporter.sendMail({
        from: `"${s.sender_name}" <${s.sender_email}>`,
        to,
        subject,
        html
    });
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