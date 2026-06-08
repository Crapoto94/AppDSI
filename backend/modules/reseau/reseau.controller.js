/**
 * Module Réseau Ville — contrôleur v2 (données DIP réelles).
 *
 * Schéma : hub_reseau.* — référencement des sites via site_code (= hub.sites.code_bien).
 * Géométrie stockée en JSONB GeoJSON (PostGIS indisponible).
 *
 * Lectures : pgDb (wrapper). Écritures : pool (paramétré $1… pour UUID/JSONB).
 */
const { pgDb, pool } = require('../../shared/database');

// ─── Valeurs ENUM (validation) ────────────────────────────────────
const LINK_TYPES = ['FIBRE', 'WAN', 'OPERATEUR', 'LASER'];
const OPERATORS  = ['LINKT', 'MOJI', 'RED', 'OTHER', 'SFR'];
const ACCESS_TYPES = ['FIBRE', 'WAN', 'ADSL', 'SDSL', '4G', '3G'];
const DUCT_STATUS  = ['LIBRE', 'OCCUPE'];
const EQUIP_TYPES  = ['SWITCH_L3','SWITCH_L2','ROUTEUR','FIREWALL','SWITCH_IRF_MEMBRE'];
const EQUIP_STATUT = ['PROD','BACKUP','HS'];

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

async function autoGeometry(siteA, siteB) {
    const a = await getSiteCoords(siteA);
    const b = await getSiteCoords(siteB);
    if (!a || !b) return null;
    return { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] };
}

module.exports = {
    // ─── Référentiel sites ─────────────────────────────────────────
    getSites: async (req, res) => {
        try {
            // Pour les bâtiments (code type S001B01), hérite des coords du site parent (S001)
            // si le bâtiment n'a pas ses propres coords.
            // Le parent est obtenu en tronquant au premier B/L/EXT.
            const { rows } = await pool.query(`
                SELECT
                    s.id,
                    s.code_bien AS site_code,
                    s.nom,
                    s.categorie,
                    COALESCE(s.lat, p.lat) AS lat,
                    COALESCE(s.lng, p.lng) AS lng,
                    s.lat AS lat_own,
                    s.lng AS lng_own,
                    COALESCE(s.geocoded_manually, false) AS geocoded_manually
                FROM hub.sites s
                LEFT JOIN hub.sites p
                  ON p.code_bien = regexp_replace(s.code_bien, '(B|L|EXT|ESP).*$', '')
                  AND p.code_bien <> s.code_bien
                WHERE s.code_bien IS NOT NULL AND s.code_bien <> ''
                ORDER BY s.code_bien
            `);
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Liens réseau ──────────────────────────────────────────────
    getLinks: async (req, res) => {
        try {
            const links = await pgDb.all('SELECT * FROM hub_reseau.network_links ORDER BY created_at');
            res.json(links);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createLink: async (req, res) => {
        try {
            const {
                site_a, site_b, type, capacity = null, operator = null,
                carries_data = true, carries_voice = false,
                is_loop = false, is_redundant = false, geometry = null,
                bag_id = null, fo_pairs = null, port_a = null, port_b = null,
                vlan_trunk = null, notes = null,
            } = req.body || {};

            if (!site_a || !site_b) return res.status(400).json({ message: 'site_a et site_b requis' });
            if (site_a === site_b) return res.status(400).json({ message: 'Un lien doit relier deux sites différents' });
            if (!LINK_TYPES.includes(type)) return res.status(400).json({ message: `Type invalide (attendu : ${LINK_TYPES.join(', ')})` });
            if (operator && !OPERATORS.includes(operator)) return res.status(400).json({ message: `Opérateur invalide` });
            if (!(await siteExists(site_a))) return res.status(400).json({ message: `Site inconnu : ${site_a}` });
            if (!(await siteExists(site_b))) return res.status(400).json({ message: `Site inconnu : ${site_b}` });

            const geom = geometry || (await autoGeometry(site_a, site_b));
            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.network_links
                    (site_a, site_b, type, capacity, operator, carries_data, carries_voice, is_loop, is_redundant, geometry,
                     bag_id, fo_pairs, port_a, port_b, vlan_trunk, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
                [site_a, site_b, type, capacity, operator, !!carries_data, !!carries_voice, !!is_loop, !!is_redundant,
                 geom ? JSON.stringify(geom) : null, bag_id, fo_pairs, port_a, port_b, vlan_trunk, notes]
            );
            res.status(201).json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    updateLink: async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await pgDb.get('SELECT * FROM hub_reseau.network_links WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ message: 'Lien introuvable' });

            const site_a = req.body.site_a ?? existing.site_a;
            const site_b = req.body.site_b ?? existing.site_b;
            const type   = req.body.type   ?? existing.type;
            const operator = req.body.operator !== undefined ? req.body.operator : existing.operator;

            if (site_a === site_b) return res.status(400).json({ message: 'Un lien doit relier deux sites différents' });
            if (!LINK_TYPES.includes(type)) return res.status(400).json({ message: `Type invalide` });
            if (operator && !OPERATORS.includes(operator)) return res.status(400).json({ message: `Opérateur invalide` });
            if (!(await siteExists(site_a))) return res.status(400).json({ message: `Site inconnu : ${site_a}` });
            if (!(await siteExists(site_b))) return res.status(400).json({ message: `Site inconnu : ${site_b}` });

            const capacity     = req.body.capacity     !== undefined ? req.body.capacity     : existing.capacity;
            const carries_data = req.body.carries_data !== undefined ? !!req.body.carries_data : existing.carries_data;
            const carries_voice = req.body.carries_voice !== undefined ? !!req.body.carries_voice : existing.carries_voice;
            const is_loop      = req.body.is_loop      !== undefined ? !!req.body.is_loop      : existing.is_loop;
            const is_redundant = req.body.is_redundant !== undefined ? !!req.body.is_redundant : existing.is_redundant;
            const bag_id       = req.body.bag_id       !== undefined ? req.body.bag_id       : existing.bag_id;
            const fo_pairs     = req.body.fo_pairs     !== undefined ? req.body.fo_pairs     : existing.fo_pairs;
            const port_a       = req.body.port_a       !== undefined ? req.body.port_a       : existing.port_a;
            const port_b       = req.body.port_b       !== undefined ? req.body.port_b       : existing.port_b;
            const vlan_trunk   = req.body.vlan_trunk   !== undefined ? req.body.vlan_trunk   : existing.vlan_trunk;
            const notes        = req.body.notes        !== undefined ? req.body.notes        : existing.notes;

            let geom = req.body.geometry;
            if (geom === undefined) {
                geom = (req.body.site_a || req.body.site_b) ? (await autoGeometry(site_a, site_b)) : existing.geometry;
            }

            const { rows } = await pool.query(
                `UPDATE hub_reseau.network_links
                 SET site_a=$1, site_b=$2, type=$3, capacity=$4, operator=$5,
                     carries_data=$6, carries_voice=$7, is_loop=$8, is_redundant=$9,
                     geometry=$10, bag_id=$11, fo_pairs=$12, port_a=$13, port_b=$14,
                     vlan_trunk=$15, notes=$16, updated_at=NOW()
                 WHERE id=$17 RETURNING *`,
                [site_a, site_b, type, capacity, operator, carries_data, carries_voice, is_loop, is_redundant,
                 geom ? JSON.stringify(geom) : null, bag_id, fo_pairs, port_a, port_b, vlan_trunk, notes, id]
            );
            res.json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    deleteLink: async (req, res) => {
        try {
            const { id } = req.params;
            const { rowCount } = await pool.query('DELETE FROM hub_reseau.network_links WHERE id = $1', [id]);
            if (rowCount === 0) return res.status(404).json({ message: 'Lien introuvable' });
            res.json({ deleted: true });
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Accès réseau ──────────────────────────────────────────────
    getAccess: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_reseau.network_access ORDER BY created_at');
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createAccess: async (req, res) => {
        try {
            const {
                site_code, type, operator = null, mode = null, bandwidth = null,
                carries_data = true, carries_voice = false, comment = null,
            } = req.body || {};

            if (!site_code) return res.status(400).json({ message: 'site_code requis' });
            if (!ACCESS_TYPES.includes(type)) return res.status(400).json({ message: `Type d'accès invalide` });
            if (operator && !OPERATORS.includes(operator)) return res.status(400).json({ message: `Opérateur invalide` });

            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.network_access
                    (site_code, type, operator, mode, bandwidth, carries_data, carries_voice, comment)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
                [site_code, type, operator, mode, bandwidth, !!carries_data, !!carries_voice, comment]
            );
            res.status(201).json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Fourreaux ─────────────────────────────────────────────────
    getDucts: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_reseau.ducts ORDER BY created_at');
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createDuct: async (req, res) => {
        try {
            const { name = null, status, capacity = null, used_capacity = 0, geometry = null } = req.body || {};
            if (!DUCT_STATUS.includes(status)) return res.status(400).json({ message: `Statut invalide` });

            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.ducts (name, status, capacity, used_capacity, geometry)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [name, status, capacity, used_capacity, geometry ? JSON.stringify(geometry) : null]
            );
            res.status(201).json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── IRF Stacks ────────────────────────────────────────────────
    getIrfStacks: async (req, res) => {
        try {
            const stacks = await pgDb.all('SELECT * FROM hub_reseau.irf_stacks ORDER BY id');
            // Pour chaque stack, récupérer les membres
            for (const s of stacks) {
                s.membres = await pgDb.all(
                    'SELECT * FROM hub_reseau.equipements WHERE irf_stack_id = ? ORDER BY irf_membre_num',
                    [s.id]
                );
            }
            res.json(stacks);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createIrfStack: async (req, res) => {
        try {
            const { nom, irf_domain, ip_management, vlan_management = 840, type_equipement, description, firmware } = req.body || {};
            if (!nom) return res.status(400).json({ message: 'nom requis' });
            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.irf_stacks (nom, irf_domain, ip_management, vlan_management, type_equipement, description, firmware)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [nom, irf_domain, ip_management, vlan_management, type_equipement, description, firmware]
            );
            res.status(201).json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    updateIrfStack: async (req, res) => {
        try {
            const { id } = req.params;
            const { nom, irf_domain, ip_management, vlan_management, type_equipement, description, firmware, actif } = req.body || {};
            const existing = await pgDb.get('SELECT * FROM hub_reseau.irf_stacks WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ message: 'IRF Stack introuvable' });
            const { rows } = await pool.query(
                `UPDATE hub_reseau.irf_stacks SET
                  nom=COALESCE($1,nom), irf_domain=COALESCE($2,irf_domain),
                  ip_management=COALESCE($3,ip_management), vlan_management=COALESCE($4,vlan_management),
                  type_equipement=COALESCE($5,type_equipement), description=COALESCE($6,description),
                  firmware=COALESCE($7,firmware), actif=COALESCE($8,actif)
                 WHERE id=$9 RETURNING *`,
                [nom, irf_domain, ip_management, vlan_management, type_equipement, description, firmware, actif, id]
            );
            res.json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Équipements ───────────────────────────────────────────────
    getEquipements: async (req, res) => {
        try {
            const { boucle, type, irf_stack_id } = req.query;
            let sql = 'SELECT e.*, s.nom AS site_nom FROM hub_reseau.equipements e LEFT JOIN hub.sites s ON s.code_bien = e.site_code WHERE 1=1';
            const params = [];
            if (boucle) { params.push(boucle); sql += ` AND e.boucle = $${params.length}`; }
            if (type)   { params.push(type);   sql += ` AND e.type = $${params.length}`; }
            if (irf_stack_id) { params.push(Number(irf_stack_id)); sql += ` AND e.irf_stack_id = $${params.length}`; }
            sql += ' ORDER BY e.boucle, e.irf_membre_num, e.nom';
            const { rows } = await pool.query(sql, params);
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createEquipement: async (req, res) => {
        try {
            const {
                site_code, nom, type, modele, reference, ip_management, numero_serie, firmware,
                irf_stack_id, irf_membre_num, boucle, localisation, statut = 'PROD', notes,
            } = req.body || {};
            if (!nom || !type) return res.status(400).json({ message: 'nom et type requis' });
            if (!EQUIP_TYPES.includes(type)) return res.status(400).json({ message: `Type équipement invalide (${EQUIP_TYPES.join(', ')})` });
            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.equipements
                  (site_code, nom, type, modele, reference, ip_management, numero_serie, firmware,
                   irf_stack_id, irf_membre_num, boucle, localisation, statut, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
                [site_code, nom, type, modele, reference, ip_management, numero_serie, firmware,
                 irf_stack_id || null, irf_membre_num || null, boucle, localisation, statut, notes]
            );
            res.status(201).json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    updateEquipement: async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await pgDb.get('SELECT * FROM hub_reseau.equipements WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ message: 'Équipement introuvable' });

            const f = req.body;
            const { rows } = await pool.query(
                `UPDATE hub_reseau.equipements SET
                  site_code=COALESCE($1,site_code), nom=COALESCE($2,nom), type=COALESCE($3,type),
                  modele=COALESCE($4,modele), reference=COALESCE($5,reference),
                  ip_management=COALESCE($6,ip_management), numero_serie=COALESCE($7,numero_serie),
                  firmware=COALESCE($8,firmware), irf_stack_id=COALESCE($9,irf_stack_id),
                  irf_membre_num=COALESCE($10,irf_membre_num), boucle=COALESCE($11,boucle),
                  localisation=COALESCE($12,localisation), statut=COALESCE($13,statut), notes=COALESCE($14,notes)
                 WHERE id=$15 RETURNING *`,
                [f.site_code, f.nom, f.type, f.modele, f.reference, f.ip_management,
                 f.numero_serie, f.firmware, f.irf_stack_id, f.irf_membre_num, f.boucle,
                 f.localisation, f.statut, f.notes, id]
            );
            res.json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    deleteEquipement: async (req, res) => {
        try {
            const { id } = req.params;
            const { rowCount } = await pool.query('DELETE FROM hub_reseau.equipements WHERE id = $1', [id]);
            if (rowCount === 0) return res.status(404).json({ message: 'Équipement introuvable' });
            res.json({ deleted: true });
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── VLANs ─────────────────────────────────────────────────────
    getVlans: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_reseau.vlans ORDER BY vlan_id');
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createVlan: async (req, res) => {
        try {
            const { vlan_id, nom, description, adresse_ip, adresse_ip2, dhcp_relay, passerelle, usage } = req.body || {};
            if (!vlan_id || !nom) return res.status(400).json({ message: 'vlan_id et nom requis' });
            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.vlans (vlan_id, nom, description, adresse_ip, adresse_ip2, dhcp_relay, passerelle, usage)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
                [vlan_id, nom, description, adresse_ip, adresse_ip2, dhcp_relay, passerelle, usage]
            );
            res.status(201).json(rows[0]);
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ message: `VLAN ${req.body.vlan_id} existe déjà` });
            res.status(500).json({ message: e.message });
        }
    },

    updateVlan: async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await pgDb.get('SELECT * FROM hub_reseau.vlans WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ message: 'VLAN introuvable' });
            const f = req.body;
            const { rows } = await pool.query(
                `UPDATE hub_reseau.vlans SET
                  nom=COALESCE($1,nom), description=COALESCE($2,description),
                  adresse_ip=COALESCE($3,adresse_ip), adresse_ip2=COALESCE($4,adresse_ip2),
                  dhcp_relay=COALESCE($5,dhcp_relay), passerelle=COALESCE($6,passerelle),
                  usage=COALESCE($7,usage), actif=COALESCE($8,actif)
                 WHERE id=$9 RETURNING *`,
                [f.nom, f.description, f.adresse_ip, f.adresse_ip2, f.dhcp_relay, f.passerelle, f.usage, f.actif, id]
            );
            res.json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Liaisons FO ───────────────────────────────────────────────
    getLiaisonsFO: async (req, res) => {
        try {
            const { boucle } = req.query;
            let sql = `SELECT l.*, sa.nom AS site_a_nom, sb.nom AS site_b_nom
                       FROM hub_reseau.liaisons_fo l
                       LEFT JOIN hub.sites sa ON sa.code_bien = l.site_a
                       LEFT JOIN hub.sites sb ON sb.code_bien = l.site_b
                       WHERE 1=1`;
            const params = [];
            if (boucle) { params.push(boucle); sql += ` AND l.boucle = $${params.length}`; }
            sql += ' ORDER BY l.boucle, l.id';
            const { rows } = await pool.query(sql, params);
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    createLiaisonFO: async (req, res) => {
        try {
            const { site_a, site_b, libelle, paires, boite_jonction, capacite, boucle, statut = 'ACTIF', notes } = req.body || {};
            if (!site_a || !site_b) return res.status(400).json({ message: 'site_a et site_b requis' });
            const { rows } = await pool.query(
                `INSERT INTO hub_reseau.liaisons_fo (site_a, site_b, libelle, paires, boite_jonction, capacite, boucle, statut, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                [site_a, site_b, libelle, paires, boite_jonction, capacite, boucle, statut, notes]
            );
            res.status(201).json(rows[0]);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Topologie enrichie (agrégat pour la vue graphique) ────────
    getTopologie: async (req, res) => {
        try {
            const [stacks, equipements, liens, acces, vlans] = await Promise.all([
                pgDb.all('SELECT * FROM hub_reseau.irf_stacks ORDER BY id'),
                pgDb.all(`SELECT e.*, s.nom AS site_nom, s.lat, s.lng
                          FROM hub_reseau.equipements e
                          LEFT JOIN hub.sites s ON s.code_bien = e.site_code
                          ORDER BY e.boucle, e.irf_membre_num`),
                pgDb.all('SELECT * FROM hub_reseau.network_links ORDER BY type, is_loop DESC'),
                pgDb.all('SELECT * FROM hub_reseau.network_access'),
                pgDb.all('SELECT * FROM hub_reseau.vlans ORDER BY vlan_id'),
            ]);
            // Attacher les membres à chaque stack
            for (const s of stacks) {
                s.membres = equipements.filter(e => e.irf_stack_id === s.id);
            }
            res.json({ stacks, equipements, liens, acces, vlans });
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Sites avec état des switchs ─────────────────────────────────
    getSitesWithSwitches: async (req, res) => {
        try {
            // Uniquement les sites racines (Sxxx, pas les sous-sites SxxxBxx, SxxxLxx, etc.)
            // Tous les équipements des sous-sites sont agrégés sous le site parent via LIKE.
            const { rows } = await pool.query(`
                SELECT
                    p.code_bien AS site_code,
                    p.nom,
                    p.categorie,
                    p.lat,
                    p.lng,
                    COUNT(e.id)::int AS total_switchs,
                    COUNT(e.id) FILTER (WHERE e.statut IN ('PROD', 'BACKUP'))::int AS switchs_ok,
                    COUNT(e.id) FILTER (WHERE e.statut = 'HS')::int AS switchs_ko
                FROM hub.sites p
                LEFT JOIN hub_reseau.equipements e
                  ON e.site_code LIKE p.code_bien || '%'
                WHERE p.code_bien IS NOT NULL
                  AND p.code_bien <> ''
                  AND p.code_bien = regexp_replace(p.code_bien, '(B|L|EXT|ESP).*$', '')
                GROUP BY p.code_bien, p.nom, p.categorie, p.lat, p.lng
                HAVING COUNT(e.id) > 0
                ORDER BY p.code_bien
            `);
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Liens switchs (alimentés par l'API Infra) ─────────────────
    getSwitchLinks: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_reseau.switch_links ORDER BY local_hostname, remote_hostname');
            res.json(rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // ─── Stats réseau ───────────────────────────────────────────────
    getStats: async (req, res) => {
        try {
            const [nb_switch_links, nb_intra, nb_inter, nb_equip, nb_vlans, nb_sites] = await Promise.all([
                pgDb.get('SELECT COUNT(*)::int AS c FROM hub_reseau.switch_links'),
                pgDb.get('SELECT COUNT(*)::int AS c FROM hub_reseau.switch_links WHERE is_intra_site = true'),
                pgDb.get('SELECT COUNT(*)::int AS c FROM hub_reseau.switch_links WHERE is_intra_site = false'),
                pgDb.get('SELECT COUNT(*)::int AS c FROM hub_reseau.equipements'),
                pgDb.get('SELECT COUNT(*)::int AS c FROM hub_reseau.vlans WHERE actif = true'),
                pgDb.get(`SELECT COUNT(*)::int AS c FROM (
                            SELECT local_site_id AS s FROM hub_reseau.switch_links WHERE local_site_id IS NOT NULL
                            UNION
                            SELECT remote_site_id AS s FROM hub_reseau.switch_links WHERE remote_site_id IS NOT NULL
                          ) q`),
            ]);
            res.json({
                liens_total: nb_switch_links.c,
                liens_intra: nb_intra.c,
                liens_inter: nb_inter.c,
                equipements: nb_equip.c,
                vlans_actifs: nb_vlans.c,
                sites_connectes: (nb_sites.c || 0),
            });
        } catch (e) { res.status(500).json({ message: e.message }); }
    },
};
