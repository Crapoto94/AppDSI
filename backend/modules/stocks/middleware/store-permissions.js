const { pgDb } = require('../../../shared/database');
const { isAdminLike } = require('../../../shared/middleware');

// Hiérarchie des rôles magasin
const ROLE_RANK = { viewer: 1, operator: 2, manager: 3 };

/**
 * Résout le rôle de l'utilisateur pour un magasin donné.
 * - Les admin/superadmin globaux obtiennent 'manager' (accès total tous magasins).
 * - Sinon, lookup par username (jamais par id) dans hub_stocks.store_members.
 * @returns {Promise<'viewer'|'operator'|'manager'|null>} null = aucun droit
 */
async function resolveStoreRole(user, storeId) {
    if (!user) return null;
    if (isAdminLike(user)) return 'manager';
    if (!storeId) return null;
    try {
        const row = await pgDb.get(
            `SELECT role FROM hub_stocks.store_members
             WHERE store_id = $1 AND LOWER(username) = LOWER($2)`,
            [storeId, user.username]
        );
        return row?.role || null;
    } catch (e) {
        console.error('[STOCKS] resolveStoreRole error:', e.message);
        return null;
    }
}

/**
 * Liste des magasins accessibles par l'utilisateur (pour les vues globales).
 * Admin global → tous les magasins actifs.
 * @returns {Promise<Array<{store_id:number, role:string}>>}
 */
async function listAccessibleStores(user) {
    if (!user) return [];
    if (isAdminLike(user)) {
        const rows = await pgDb.all(
            `SELECT id AS store_id, 'manager'::text AS role FROM hub_stocks.stores WHERE is_active = TRUE`
        );
        return rows;
    }
    return pgDb.all(
        `SELECT store_id, role FROM hub_stocks.store_members WHERE LOWER(username) = LOWER($1)`,
        [user.username]
    );
}

function hasRank(role, minRole) {
    return !!role && (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}

/**
 * Middleware exigeant un rôle minimum sur le magasin ciblé.
 * Le store_id est lu dans (ordre) : req.params.storeId, req.body.store_id, req.query.store_id.
 */
function requireStoreRole(minRole) {
    return async (req, res, next) => {
        try {
            const storeId = parseInt(
                req.params.storeId || req.body?.store_id || req.query?.store_id,
                10
            );
            if (!storeId) {
                return res.status(400).json({ message: 'store_id requis' });
            }
            const role = await resolveStoreRole(req.user, storeId);
            if (!hasRank(role, minRole)) {
                return res.status(403).json({ message: 'Permission refusée sur ce magasin' });
            }
            req.storeRole = role;
            req.storeId = storeId;
            next();
        } catch (e) {
            console.error('[STOCKS] requireStoreRole error:', e.message);
            return res.status(500).json({ message: 'Erreur de vérification des permissions' });
        }
    };
}

module.exports = {
    ROLE_RANK,
    resolveStoreRole,
    listAccessibleStores,
    hasRank,
    requireStoreRole,
};
