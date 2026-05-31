/**
 * Module Réseau Ville — contrôleur.
 *
 * Cartographie du réseau inter-sites (fibre, WAN, opérateurs, fourreaux).
 * Schéma : hub_reseau.* — référencement des sites via site_code (= hub.sites.code_bien).
 * Géométrie stockée en JSONB GeoJSON (PostGIS indisponible).
 *
 * Lectures : pgDb (wrapper). Écritures : pool (paramétré $1… pour UUID/JSONB).
 */
const { pgDb, pool } = require('../../shared/database');

// ─── Valeurs ENUM (validation) ────────────────────────────────────
const LINK_TYPES = ['FIBRE', 'WAN', 'OPERATEUR'];
const OPERATORS = ['LINKT', 'MOJI', 'RED', 'OTHER'];
const ACCESS_TYPES = ['FIBRE', 'WAN', 'ADSL', 'SDSL', '4G'];
const DUCT_STATUS = ['LIBRE', 'OCCUPE'];

// ─── Helpers ──────────────────────────────────────────────────────
async function siteExists(code) {
    if (!code) return false;
    const row = await pgDb.get('SELECT 1 AS ok FROM hub.sites WHERE code_bien = ?', [code]);
    return !!row;
}

async function getSiteCoords(code) {
    const row = await pgDb.get('SELECT lat, lng FROM hub.sites WHERE code_bien = ?', [code]);
    if (row && row.lat != null && row.lng != null) return { lat: Number(row.lat), lng: Number(row.lng) };
    return null;
}

// Construit un GeoJSON LineString [ [lng,lat], [lng,lat] ] entre 2 sites (ou null).
async function autoGeometry(siteA, siteB) {
    const a = await getSiteCoords(siteA);
    const b = await getSiteCoords(siteB);
    if (!a || !b) return null;
    return { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] };
}

module.exports = {
    // ─── Référentiel sites (lecture seule de hub.sites) ────────────
    getSites: async (req, res) => {
        try {
            const sites = await pgDb.all(`
                SELECT code_bien AS site_code, nom, categorie, lat, lng
                FROM hub.sites
                WHERE code_bien IS NOT NULL AND code_bien <> ''
                ORDER BY code_bien
            `);
            res.json(sites);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ─── Liens réseau ──────────────────────────────────────────────
    getLinks: async (req, res) => {
        try {
            const links = await pgDb.all('SELECT * FROM hub_reseau.network_links ORDER BY created_at');
            res.json(links);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    createLink: async (req, res) => {
        try {
            const {
                site_a, site_b, type, capacity = null, operator = null,
                carries_data = true, carries_voice = false,
                is_loop = false, is_redundant = false, geometry = null,
            } = req.body || {};

            if (!site_a || !site_b) return res.status(400).json({ message: 'site_a et site_b requis' });
            if (site_a === site_b) return res.status(400).json({ message: 'Un lien doit relier deux sites différents' });
            if (!LINK_TYPES.includes(type)) return res.status(400).json({ message: `Type invalide (attendu : ${LINK_TYPES.join(', ')})` });
            if (operator && !OPERATORS.includes(operator)) return res.status(400).json({ message: `Opérateur invalide (attendu : ${OPERATORS.join(', ')})` });
            if (!(await siteExists(site_a))) return res.status(400).json({ message: `Site inconnu : ${site_a}` });
            if (!(await siteExists(site_b))) return res.status(400).json({ message: `Site inconnu : ${site_b}` });

            // Géométrie : fournie (tracé manuel) sinon auto depuis les coords des sites.
            const geom = geometry || (await autoGeometry(site_a, site_b));

            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.network_links
                    (site_a, site_b, type, capacity, operator, carries_data, carries_voice, is_loop, is_redundant, geometry)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING *`,
                [site_a, site_b, type, capacity, operator, !!carries_data, !!carries_voice, !!is_loop, !!is_redundant,
                 geom ? JSON.stringify(geom) : null]
            );
            res.status(201).json(rows[0]);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    updateLink: async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await pgDb.get('SELECT * FROM hub_reseau.network_links WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ message: 'Lien introuvable' });

            const site_a = req.body.site_a ?? existing.site_a;
            const site_b = req.body.site_b ?? existing.site_b;
            const type = req.body.type ?? existing.type;
            const operator = req.body.operator !== undefined ? req.body.operator : existing.operator;

            if (site_a === site_b) return res.status(400).json({ message: 'Un lien doit relier deux sites différents' });
            if (!LINK_TYPES.includes(type)) return res.status(400).json({ message: `Type invalide (attendu : ${LINK_TYPES.join(', ')})` });
            if (operator && !OPERATORS.includes(operator)) return res.status(400).json({ message: `Opérateur invalide` });
            if (!(await siteExists(site_a))) return res.status(400).json({ message: `Site inconnu : ${site_a}` });
            if (!(await siteExists(site_b))) return res.status(400).json({ message: `Site inconnu : ${site_b}` });

            const capacity = req.body.capacity !== undefined ? req.body.capacity : existing.capacity;
            const carries_data = req.body.carries_data !== undefined ? !!req.body.carries_data : existing.carries_data;
            const carries_voice = req.body.carries_voice !== undefined ? !!req.body.carries_voice : existing.carries_voice;
            const is_loop = req.body.is_loop !== undefined ? !!req.body.is_loop : existing.is_loop;
            const is_redundant = req.body.is_redundant !== undefined ? !!req.body.is_redundant : existing.is_redundant;
            // Géométrie : si site_a/site_b changent et pas de géométrie fournie → recalcul auto
            let geom = req.body.geometry;
            if (geom === undefined) {
                geom = (req.body.site_a || req.body.site_b) ? (await autoGeometry(site_a, site_b)) : existing.geometry;
            }

            const { rows } = await pool.query(
                `UPDATE hub_reseau.network_links
                 SET site_a=$1, site_b=$2, type=$3, capacity=$4, operator=$5,
                     carries_data=$6, carries_voice=$7, is_loop=$8, is_redundant=$9,
                     geometry=$10, updated_at=NOW()
                 WHERE id=$11 RETURNING *`,
                [site_a, site_b, type, capacity, operator, carries_data, carries_voice, is_loop, is_redundant,
                 geom ? JSON.stringify(geom) : null, id]
            );
            res.json(rows[0]);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    deleteLink: async (req, res) => {
        try {
            const { id } = req.params;
            const { rowCount } = await pool.query('DELETE FROM hub_reseau.network_links WHERE id = $1', [id]);
            if (rowCount === 0) return res.status(404).json({ message: 'Lien introuvable' });
            res.json({ deleted: true });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ─── Accès réseau ──────────────────────────────────────────────
    getAccess: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_reseau.network_access ORDER BY created_at');
            res.json(rows);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    createAccess: async (req, res) => {
        try {
            const {
                site_code, type, operator = null, mode = null, bandwidth = null,
                carries_data = true, carries_voice = false, comment = null,
            } = req.body || {};

            if (!site_code) return res.status(400).json({ message: 'site_code requis' });
            if (!ACCESS_TYPES.includes(type)) return res.status(400).json({ message: `Type d'accès invalide (attendu : ${ACCESS_TYPES.join(', ')})` });
            if (operator && !OPERATORS.includes(operator)) return res.status(400).json({ message: `Opérateur invalide` });
            if (!(await siteExists(site_code))) return res.status(400).json({ message: `Site inconnu : ${site_code}` });

            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.network_access
                    (site_code, type, operator, mode, bandwidth, carries_data, carries_voice, comment)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
                [site_code, type, operator, mode, bandwidth, !!carries_data, !!carries_voice, comment]
            );
            res.status(201).json(rows[0]);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ─── Fourreaux ─────────────────────────────────────────────────
    getDucts: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_reseau.ducts ORDER BY created_at');
            res.json(rows);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    createDuct: async (req, res) => {
        try {
            const { name = null, status, capacity = null, used_capacity = 0, geometry = null } = req.body || {};
            if (!DUCT_STATUS.includes(status)) return res.status(400).json({ message: `Statut invalide (attendu : ${DUCT_STATUS.join(', ')})` });

            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.ducts (name, status, capacity, used_capacity, geometry)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [name, status, capacity, used_capacity, geometry ? JSON.stringify(geometry) : null]
            );
            res.status(201).json(rows[0]);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
};
