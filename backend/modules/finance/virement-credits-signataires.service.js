const { pgDb, pool } = require('../../shared/database');
const encadrantsController = require('../rh/encadrants.controller');

// Signataires d'une demande de virement de crédits (MagApp) : responsable de service puis directeur.
//
// - Par défaut : ceux de l'agent connecté, déduits du référentiel RH (matricule → SERVICE / DIRECTION) et de la liste des
//   encadrants de /admin/ville (`encadrants.controller.getEncadrants` : rôles `responsable_service` / `directeur`, avec e-mail).
// - Au changement : on ne propose QUE les responsables des services (et les directeurs des directions) pour lesquels
//   l'agent a un droit de modification dans SEDIT (couples budget × service, cf. sedit-droits.service.js). Le code service
//   SEDIT (FI.SERVICEFI.CLEACCES) est identique au code service RH ; la direction est le code DIRECTION RH de ce service.

const CACHE_MS = 15 * 60 * 1000; // l'appel d'encadrants déclenche des recherches AD/LDAP
let cache = { list: null, expiresAt: 0 };

async function getEncadrants() {
    if (cache.list && Date.now() < cache.expiresAt) return cache.list;
    let raw = [];
    await new Promise((resolve) => {
        const fakeRes = { status: () => fakeRes, json: (d) => { raw = Array.isArray(d) ? d : []; resolve(); } };
        Promise.resolve(encadrantsController.getEncadrants({}, fakeRes)).catch(() => resolve());
    });
    cache = { list: raw, expiresAt: Date.now() + CACHE_MS };
    return raw;
}

const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();

// Code service / direction de l'agent dans le référentiel RH (par matricule RH Studio, repli : nom + prénom).
async function rhPlacement(user) {
    let email = String(user.email || '').trim();
    try {
        // user.id (SQLite) ≠ hub.users.id : jointure par username
        const r = await pool.query('SELECT email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [user.username || '']);
        if (r.rows[0] && r.rows[0].email) email = String(r.rows[0].email).trim();
    } catch { /* repli JWT */ }
    let matricule = '';
    try {
        const rhStudio = require('../../shared/rh_studio');
        const agent = email ? await rhStudio.findAgentByEmail(email) : null;
        matricule = agent && agent.matricule ? String(agent.matricule).trim() : '';
    } catch { /* RH Studio indisponible */ }
    if (!matricule) return null;
    const row = await pgDb.get(
        `SELECT "NOM", "PRENOM", "SERVICE", "SERVICE_L", "DIRECTION", "DIRECTION_L"
           FROM oracle.rh_v_extract_dsi WHERE TRIM("MATRICULE") = ? LIMIT 1`, [matricule]);
    if (!row) return null;
    return {
        matricule,
        nom: row.NOM, prenom: row.PRENOM,
        service_code: norm(row.SERVICE), service_label: String(row.SERVICE_L || '').trim(),
        direction_code: norm(row.DIRECTION), direction_label: String(row.DIRECTION_L || '').trim(),
    };
}

// Direction RH d'un code service (SERVICE → DIRECTION), repli : 2 premiers caractères (BF6 → BF).
async function directionsOfServices(codes) {
    const out = new Map();
    if (!codes.length) return out;
    try {
        const rows = await pgDb.all(
            `SELECT DISTINCT TRIM("SERVICE") AS s, TRIM("DIRECTION") AS d FROM oracle.rh_v_extract_dsi
              WHERE TRIM("SERVICE") IN (${codes.map(() => '?').join(',')})`, codes);
        for (const r of rows) if (r.s && r.d && !out.has(norm(r.s))) out.set(norm(r.s), norm(r.d));
    } catch { /* repli ci-dessous */ }
    for (const c of codes) if (!out.has(c)) out.set(c, c.slice(0, 2));
    return out;
}

const pick = (e) => ({
    matricule: e.matricule, nom: e.nom, prenom: e.prenom, email: e.email,
    role: e.role === 'directeur' ? 'directeur' : 'responsable_service',
    service_code: e.service_code, service_label: e.service_label,
    direction_code: e.direction_code, direction_label: e.direction_label,
});

/**
 * @param {object} user     utilisateur JWT
 * @param {Array}  services services SEDIT modifiables ([{ service }] — sedit-droits.getModifiableServices)
 */
async function getSignataires(user, services) {
    const [placement, encadrants] = await Promise.all([rhPlacement(user), getEncadrants()]);
    const allowedServices = new Set((services || []).map(s => norm(s.service)).filter(Boolean));
    const dirOf = await directionsOfServices([...allowedServices]);
    const allowedDirections = new Set(dirOf.values());
    // Les services/directions de l'agent lui-même restent proposés (ses propres signataires par défaut)
    if (placement) {
        if (placement.service_code) allowedServices.add(placement.service_code);
        if (placement.direction_code) allowedDirections.add(placement.direction_code);
    }

    const withMail = encadrants.filter(e => e.email && String(e.email).includes('@'));
    const responsables = withMail
        .filter(e => e.role === 'responsable_service' && allowedServices.has(norm(e.service_code)))
        .map(pick);
    const directeurs = withMail
        .filter(e => e.role === 'directeur' && allowedDirections.has(norm(e.direction_code)))
        .map(pick);

    // Par défaut : responsable du service de l'agent (le service d'accueil d'une direction n'en a pas : le directeur) et
    // directeur de sa direction.
    const defaultResp = placement && placement.service_code
        ? responsables.find(e => norm(e.service_code) === placement.service_code) || null : null;
    const defaultDir = placement && placement.direction_code
        ? directeurs.find(e => norm(e.direction_code) === placement.direction_code) || null : null;

    return { me: placement, responsables, directeurs, defaults: { responsable: defaultResp, directeur: defaultDir } };
}

module.exports = { getSignataires };
