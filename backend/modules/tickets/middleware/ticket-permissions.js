const { pgDb } = require('../../../shared/database');

const DEFAULT_PERMISSIONS = {
    'ticket:read':            ['readonly', 'user', 'technician', 'supervisor', 'admin', 'superadmin'],
    'ticket:create':          ['user', 'technician', 'supervisor', 'admin', 'superadmin'],
    'ticket:update':          ['technician', 'supervisor', 'admin', 'superadmin'],
    'ticket:delete':          ['superadmin'],
    'ticket:assign':          ['supervisor', 'admin', 'superadmin'],
    'ticket:assign_self':     ['technician'],
    'ticket:escalate':        ['supervisor', 'admin', 'superadmin'],
    'ticket:close':           ['technician', 'supervisor', 'admin', 'superadmin'],
    'ticket:reopen':          ['user', 'technician', 'supervisor', 'admin', 'superadmin'],
    'comment:read_private':   ['technician', 'supervisor', 'admin', 'superadmin'],
    'comment:write_internal': ['technician', 'supervisor', 'admin', 'superadmin'],
    'comment:write_public':   ['user', 'technician', 'supervisor', 'admin', 'superadmin'],
    'attachment:upload':      ['user', 'technician', 'supervisor', 'admin', 'superadmin'],
    'sla:configure':          ['admin', 'superadmin'],
    'category:manage':        ['admin', 'superadmin'],
    'group:manage':           ['admin', 'superadmin'],
    'rules:manage':           ['admin', 'superadmin'],
    'admin:access':           ['admin', 'superadmin'],
    'ticket:view_all':        ['supervisor', 'admin', 'superadmin'],
    'dashboard:view_stats':   ['technician', 'supervisor', 'admin', 'superadmin'],
    'dashboard:view_kpi':     ['technician', 'supervisor', 'admin', 'superadmin'],
};

// Mutable in-memory cache — starts with defaults, refreshed from DB
let PERMISSIONS = { ...DEFAULT_PERMISSIONS };

async function loadPermissionsFromDb() {
    try {
        const rows = await pgDb.all('SELECT role, permission FROM hub_tickets.role_permissions');
        if (rows && rows.length > 0) {
            const perms = {};
            for (const row of rows) {
                if (!perms[row.permission]) perms[row.permission] = [];
                perms[row.permission].push(row.role);
            }
            PERMISSIONS = perms;
            console.log(`[PERMISSIONS] Loaded ${rows.length} entries from DB`);
        }
    } catch (e) {
        console.error('[PERMISSIONS] Failed to load from DB, using defaults:', e.message);
        PERMISSIONS = { ...DEFAULT_PERMISSIONS };
    }
}

const ROLE_MAP = {
    superadmin:   'superadmin',
    superadmins:  'superadmin',
    admin:        'admin',
    admins:       'admin',
    superviseur:  'supervisor',
    supervisor:   'supervisor',
    technicien:   'technician',
    technicienne: 'technician',
    tech:         'technician',
    technician:   'technician',
    user:         'user',
    magapp:       'user',
    readonly:     'readonly',
};

function normalizeRole(role) {
    return ROLE_MAP[role?.toLowerCase()?.trim()] || 'user';
}

async function resolveTicketRole(user) {
    if (!user) return 'user';
    const role = normalizeRole(user.role);
    // If the global role is already elevated, use it directly
    if (role !== 'user') return role;
    // Fallback: look up technician_profiles by username (direct — no PG id dependency)
    try {
        const { pgDb } = require('../../../shared/database');
        // Primary: username column (case-insensitive — AD usernames may differ in case from SQLite)
        const byUsername = await pgDb.get(
            `SELECT module_role FROM hub_tickets.technician_profiles WHERE LOWER(username) = LOWER($1)`,
            [user.username]
        );
        if (byUsername?.module_role) {
            const moduleRole = normalizeRole(byUsername.module_role);
            if (moduleRole !== 'user') return moduleRole;
        }
        // Fallback: join through hub.users (case-insensitive)
        const byHub = await pgDb.get(
            `SELECT u.role AS hub_role, tp.module_role
             FROM hub.users u
             LEFT JOIN hub_tickets.technician_profiles tp ON tp.user_id = u.id
             WHERE LOWER(u.username) = LOWER($1)`,
            [user.username]
        );
        if (byHub) {
            if (byHub.module_role) {
                const moduleRole = normalizeRole(byHub.module_role);
                if (moduleRole !== 'user') return moduleRole;
            }
            if (byHub.hub_role) {
                const hubRole = normalizeRole(byHub.hub_role);
                if (hubRole !== 'user') return hubRole;
            }
        }
    } catch (e) {
        console.error('[PERMISSIONS] resolveTicketRole lookup error:', e.message);
    }
    return role;
}

module.exports = {
    loadPermissionsFromDb,

    requireTicketPermission(action) {
        return async (req, res, next) => {
            try {
                const userRole = await resolveTicketRole(req.user);
                const allowedRoles = PERMISSIONS[action];
                if (!allowedRoles || !allowedRoles.includes(userRole)) {
                    return res.status(403).json({ message: 'Permission refusée' });
                }
                next();
            } catch (e) {
                return res.status(500).json({ message: 'Erreur de vérification des permissions' });
            }
        };
    },

    async hasPermission(user, action) {
        const userRole = await resolveTicketRole(user);
        const allowedRoles = PERMISSIONS[action];
        return allowedRoles?.includes(userRole) || false;
    },

    getPermissions() {
        return PERMISSIONS;
    },

    normalizeRole,
    resolveTicketRole,
};
