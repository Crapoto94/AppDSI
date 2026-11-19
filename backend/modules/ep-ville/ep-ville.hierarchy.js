/**
 * Hiérarchie des valideurs (cascade) : qui valide qui, vers le haut et vers le bas.
 *
 * Lien d'un valideur vers son propre valideur : la ligne `rattachements` qui le désigne comme agent, retrouvée par
 * `valideurs.rattachement_id` (sous-valideur désigné depuis la liste d'un valideur) ou, à défaut, par le matricule
 * (valideur désigné par un administrateur et lui-même agent d'un autre valideur, ex. un directeur validé par le DG).
 * Requêtes SQL seulement : aucune dépendance vers les autres modules.
 */
const { pgDb } = require('../../shared/database');

const MAX_DEPTH = 20;

/** Valideur de rang supérieur d'un valideur (id) ou null. */
async function parentOf(valideur) {
    if (!valideur) return null;
    const r = await pgDb.get(
        `SELECT valideur_id FROM hub_entretiens.rattachements
         WHERE id = ? OR (? <> '' AND agent_matricule = ?) ORDER BY (id = ?) DESC LIMIT 1`,
        [valideur.rattachement_id || 0, valideur.matricule || '', valideur.matricule || '', valideur.rattachement_id || 0]);
    return r ? r.valideur_id : null;
}

/** Chaîne des valideurs au-dessus d'un entretien : [valideur direct, son valideur, ...]. */
async function chainAbove(entretien) {
    if (!entretien || !entretien.rattachement_id) return [];
    const rat = await pgDb.get('SELECT valideur_id FROM hub_entretiens.rattachements WHERE id = ?', [entretien.rattachement_id]);
    const chain = [];
    let id = rat ? rat.valideur_id : null;
    for (let i = 0; i < MAX_DEPTH && id && !chain.includes(id); i++) {
        chain.push(id);
        const v = await pgDb.get('SELECT id, matricule, rattachement_id FROM hub_entretiens.valideurs WHERE id = ?', [id]);
        id = await parentOf(v);
    }
    return chain;
}

async function valideurOfActor(actor) {
    const clauses = []; const params = [];
    if (actor.username) { clauses.push('LOWER(username) = LOWER(?)'); params.push(actor.username); }
    if (actor.email) { clauses.push('LOWER(email) = LOWER(?)'); params.push(actor.email); }
    if (!clauses.length) return null;
    return (await pgDb.get(`SELECT * FROM hub_entretiens.valideurs WHERE ${clauses.join(' OR ')} LIMIT 1`, params)) || null;
}

const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Un directeur / DGA / DG voit tous les EP de sa direction (ou de ses directions), même ceux qui ne passent pas par sa cascade.
 * Rapprochement sur le libellé de direction de l'entretien (sans tenir compte de la casse ni des accents).
 */
function inPerimetre(valideur, entretien) {
    if (!valideur || valideur.niveau === 'sous' || !entretien) return false;
    const labels = [...(Array.isArray(valideur.perimetre_libelles) ? valideur.perimetre_libelles : []), valideur.direction_libelle]
        .map(fold).filter(Boolean);
    const d = fold(entretien.direction);
    return !!d && labels.includes(d);
}

/** L'utilisateur est-il un valideur situé AU-DESSUS de l'évaluateur direct de cet entretien (lecture seule) ? */
async function isSuperieur(actor, entretien) {
    if (!entretien) return false;
    const me = await valideurOfActor(actor);
    if (!me) return false;
    if (inPerimetre(me, entretien)) return true;
    if (!entretien.rattachement_id) return false;
    const chain = await chainAbove(entretien);
    return chain.slice(1).includes(me.id);
}

/**
 * Tout ce qui est en dessous d'un valideur : ses agents, puis ceux de ses sous-valideurs, etc.
 * Renvoie les identifiants des rattachements et les valideurs rencontrés.
 */
async function descendants(valideurId) {
    const ratIds = []; const valideurs = []; const seen = new Set();
    let level = [valideurId];
    for (let depth = 0; depth < MAX_DEPTH && level.length; depth++) {
        const next = [];
        for (const vid of level) {
            if (seen.has(vid)) continue;
            seen.add(vid);
            const rats = await pgDb.all('SELECT id, agent_matricule FROM hub_entretiens.rattachements WHERE valideur_id = ?', [vid]);
            for (const r of rats) {
                ratIds.push(r.id);
                const sub = await pgDb.get(
                    `SELECT id FROM hub_entretiens.valideurs WHERE rattachement_id = ? OR (? <> '' AND matricule = ?) LIMIT 1`,
                    [r.id, r.agent_matricule || '', r.agent_matricule || '']);
                if (sub && !seen.has(sub.id)) { next.push(sub.id); valideurs.push(sub.id); }
            }
        }
        level = next;
    }
    return { ratIds, valideurs };
}

module.exports = { inPerimetre, parentOf, chainAbove, isSuperieur, descendants, valideurOfActor };
