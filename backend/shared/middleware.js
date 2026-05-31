const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('./config');
const { getSqlite } = require('./database');

// ─── Role helpers ─────────────────────────────────────────────────────────────
/** "Superadmin" → sees ALL data, full system access (formerly 'admin') */
const isSuperAdmin = (user) =>
    user && (user.role === 'superadmin' || user.username?.toLowerCase() === 'admin' || user.username?.toLowerCase() === 'adminhub');

/** "Admin or superadmin" → can access /admin menu, but new 'admin' role only sees own data */
const isAdminLike = (user) =>
    isSuperAdmin(user) || (user && user.role === 'admin');

/**
 * Middleware to verify JWT token
 */
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    // Repli sur ?token= pour les ressources chargées sans header (ex: <img src>)
    const queryToken = req.query && req.query.token;
    if (!authHeader && queryToken) {
        return jwt.verify(queryToken, SECRET_KEY, (err, user) => {
            if (err) return res.status(403).json({ message: 'Session expirée ou invalide' });
            if (isAdminLike(user)) user.is_approved = 1;
            req.user = user;
            next();
        });
    }
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log(`[JWT] Token missing for ${req.path}`);
            return res.status(401).json({ message: 'Token manquant dans le header' });
        }

        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) {
                console.error(`[JWT ERROR] Verification failed for ${req.path}: ${err.message}`);
                return res.status(403).json({ message: 'Session expirée ou invalide' });
            }
            // Ensure admins are always approved
            if (isAdminLike(user)) {
                user.is_approved = 1;
            }
            req.user = user;
            console.log(`[JWT] User ${user.username} verified for ${req.path}`);
            next();
        });
    } else {
        console.log(`[JWT] Auth header missing for ${req.path}`);
        res.status(401).json({ message: 'Authentification requise' });
    }
};

/**
 * Middleware to optionally verify JWT token without blocking
 */
const tryAuthenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token) {
            jwt.verify(token, SECRET_KEY, (err, user) => {
                if (!err) {
                    if (isAdminLike(user)) {
                        user.is_approved = 1;
                    }
                    req.user = user;
                }
                next();
            });
            return;
        }
    }
    next();
};

/**
 * Middleware for SuperAdmin only (system management, sees all data)
 * Accepts: role='superadmin' OR legacy usernames 'admin'/'adminhub'
 */
const authenticateAdmin = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (isSuperAdmin(req.user)) {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : superadministrateur uniquement' });
        }
    });
};

/**
 * Middleware for Admin UI access (role='admin' OR role='superadmin')
 * The new 'admin' role can access the /admin menu but only sees own data.
 */
const authenticateAdminUI = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (isAdminLike(req.user)) {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : rôle admin requis' });
        }
    });
};

/**
 * Middleware for Internal (scheduled syncs) or Admin
 */
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

/**
 * Middleware for Admin or Finances/Compta roles
 */
const authenticateAdminOrFinances = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (req.user && (isSuperAdmin(req.user) || req.user.role === 'finances' || req.user.role === 'compta')) {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur ou finances/compta uniquement' });
        }
    });
};

/**
 * Middleware for Admin or users with MagApp Control access
 */
const authenticateMagappControl = (req, res, next) => {
    authenticateJWT(req, res, async () => {
        if (isAdminLike(req.user)) {
            return next();
        }

        try {
            const db = getSqlite();
            if (req.user && req.user.id && db) {
                const authorized = await db.get(`
                    SELECT 1 FROM user_tiles ut
                    JOIN tile_links tl ON ut.tile_id = tl.tile_id
                    WHERE ut.user_id = ? AND tl.url = '/admin/magapp'
                `, [req.user.id]);
                
                console.log(`[AUTH MAGAPP] User ${req.user.username} (ID: ${req.user.id}) tile check result:`, !!authorized);
                if (authorized) return next();
            } else {
                console.log(`[AUTH MAGAPP] Missing info: user=${!!req.user}, user.id=${req.user?.id}, db=${!!db}`);
            }
        } catch (error) {
            console.error('[AUTH MAGAPP] Error checking tile access:', error);
        }
        
        console.log(`[AUTH MAGAPP] Access denied for ${req.user?.username}`);
        res.status(403).json({ message: 'Accès refusé : administrateur ou accès Magasin d\'Apps requis' });
    });
};

const authenticateGLPIControl = (req, res, next) => {
    authenticateJWT(req, res, async () => {
        if (!req.user) return res.status(401).json({ message: 'Non authentifié' });
        
        // Admins ont toujours accès
        if (isAdminLike(req.user)) {
            return next();
        }

        try {
            const db = getSqlite();
            // Vérifier si l'utilisateur a accès à la tuile d'administration GLPI
            // On cherche la tuile qui pointe vers /admin/glpi
            const authorized = await db.get(`
                SELECT 1 FROM user_tiles ut 
                JOIN tile_links tl ON ut.tile_id = tl.tile_id 
                WHERE ut.user_id = ? AND tl.url LIKE '%/admin/glpi%'
            `, [req.user.id]);

            console.log(`[AUTH GLPI] User ${req.user.username} (ID: ${req.user.id}) tile check result: ${!!authorized}`);

            if (authorized) {
                return next();
            }

            res.status(403).json({ message: 'Accès refusé : vous n\'avez pas les droits de gestion GLPI' });
        } catch (error) {
            console.error('[AUTH GLPI ERROR]', error);
            res.status(500).json({ message: 'Erreur lors de la vérification des droits GLPI' });
        }
    });
};

/**
 * Middleware for Admin or PMO users
 */
const authenticateAdminOrPMO = (req, res, next) => {
    authenticateJWT(req, res, async () => {
        if (isAdminLike(req.user)) {
            return next();
        }
        try {
            const db = getSqlite();
            if (req.user && req.user.id && db) {
                const authorized = await db.get('SELECT 1 FROM user_tiles WHERE user_id = ? AND tile_id = 24', [req.user.id]);
                if (authorized) return next();
            }
        } catch (error) {
            console.error('[AUTH PMO] Error checking PMO access:', error);
        }
        res.status(403).json({ message: 'Accès refusé : administrateur ou PMO uniquement' });
    });
};

/**
 * Middleware for Admin or Consommables management users
 * Anyone with access to ANY consommables tile gets full admin access to all consommables features
 */
const authenticateConsommablesAdmin = (req, res, next) => {
    authenticateJWT(req, res, async () => {
        console.log(`[AUTH CONSOMMABLES] Checking access for user: ${req.user?.username}, role: ${req.user?.role}`);

        if (isAdminLike(req.user)) {
            console.log(`[AUTH CONSOMMABLES] User ${req.user.username} is admin/superadmin - access granted`);
            return next();
        }

        try {
            const db = getSqlite();
            console.log(`[AUTH CONSOMMABLES] DB available: ${!!db}, user.id: ${req.user?.id}`);

            if (req.user && req.user.id && db) {
                // Check if user has access to ANY tile with "Consommable" in the title
                // This gives full admin access regardless of which specific link they're authorized for
                const authorized = await db.get(`
                    SELECT ut.tile_id, t.title FROM user_tiles ut
                    JOIN tiles t ON ut.tile_id = t.id
                    WHERE ut.user_id = ? AND t.title LIKE '%Consommable%'
                `, [req.user.id]);

                console.log(`[AUTH CONSOMMABLES] Query result for user ${req.user.username}:`, authorized);

                if (authorized) {
                    console.log(`[AUTH CONSOMMABLES] User ${req.user.username} has tile "${authorized.title}" (ID: ${authorized.tile_id}) - access GRANTED`);
                    return next();
                }

                // Also log all tiles the user has access to
                const allUserTiles = await db.all(`
                    SELECT ut.tile_id, t.title FROM user_tiles ut
                    LEFT JOIN tiles t ON ut.tile_id = t.id
                    WHERE ut.user_id = ?
                `, [req.user.id]);
                console.log(`[AUTH CONSOMMABLES] All tiles for user ${req.user.username}:`, allUserTiles);
            }
        } catch (error) {
            console.error('[AUTH CONSOMMABLES] Error checking tile access:', error);
        }

        console.log(`[AUTH CONSOMMABLES] Access DENIED for ${req.user?.username}`);
        res.status(403).json({ message: 'Accès refusé : administrateur ou accès consommables requis' });
    });
};

module.exports = {
    authenticateJWT,
    tryAuthenticateJWT,
    authenticateAdmin,
    authenticateAdminUI,
    authenticateInternalOrAdmin,
    authenticateAdminOrFinances,
    authenticateAdminOrPMO,
    authenticateMagappControl,
    authenticateGLPIControl,
    authenticateConsommablesAdmin,
    isSuperAdmin,
    isAdminLike,
};
