/**
 * Compte-rendu d'entretien professionnel (CREP) — catégories A et B.
 * Structure du document papier de la DRH, dématérialisé :
 *  - champs saisis par l'évaluateur (stockés dans hub_entretiens.entretiens.crep, JSONB) ;
 *  - grille d'appréciation de la valeur professionnelle (3 niveaux) ;
 *  - rendu PDF de 4 pages (crep-pdf.service.js).
 * La même structure de critères est dupliquée côté frontend (pages/Entretiens/crep.ts).
 */

const LEVELS = [
    { key: 'S', label: 'satisfaisant / conforme' },
    { key: 'AS', label: 'Assez satisfaisant/ partiellement conforme' },
    { key: 'I', label: 'Insuffisant / non conforme' },
];

const CRITERIA_GROUPS = [
    {
        key: 'service_public', title: null,
        items: [{ key: 'service_public', label: 'Sens du service public (continuité, adaptabilité, neutralité, sens de l’intérêt général)', lead: 'Sens du service public' }],
    },
    {
        key: 'competences', title: 'Compétences professionnelles et techniques',
        items: [
            { key: 'responsabilites', label: 'Sens des responsabilités' },
            { key: 'propositions', label: 'Capacité à être force de propositions et prise d’initiatives' },
            { key: 'redaction', label: 'Qualités rédactionnelles et de synthèse' },
            { key: 'communication_orale', label: 'Qualité de la communication orale' },
            { key: 'conduite_projets', label: 'Aptitude à la conduite de projets (conception, pilotage, animation, mise en œuvre)' },
            { key: 'organisation', label: 'Savoir s’organiser et gérer les priorités' },
            { key: 'anticipation', label: 'Capacité d’anticipation et d’adaptation' },
            { key: 'actualisation', label: 'Actualisation et développement des compétences' },
            { key: 'processus', label: 'Respect des processus de travail et des procédures' },
            { key: 'organisation_collective', label: 'Implication dans l’organisation collective et le travail transversal' },
        ],
    },
    {
        key: 'relationnelles', title: 'Qualités relationnelles',
        items: [
            { key: 'partage_information', label: 'Capacité à partager l’information (ascendante et descendante)' },
            { key: 'travail_equipe', label: 'Capacité à travailler en équipe' },
            { key: 'dialogue', label: 'Sens du dialogue et de l’écoute' },
        ],
    },
    {
        key: 'encadrement', title: 'Capacité d’encadrement',
        items: [
            { key: 'decisions', label: 'Capacité à la prise de décisions' },
            { key: 'animation', label: 'Capacité à animer et mobiliser des équipes' },
            { key: 'conflits', label: 'Aptitude à prévenir, arbitrer et gérer les conflits' },
            { key: 'delegation', label: 'Capacité à déléguer, contrôler et évaluer l’activité' },
        ],
    },
];

const NB_OBJECTIFS = 4;

// ─── Modèles (un par onglet « Template_* » du classeur déposé par l'administrateur) ───
// Sans modèle connu pour l'entretien : grille historique (catégories A et B) ci-dessus.
let TEMPLATE_DEFS = {};
const setTemplateDefs = (map) => { TEMPLATE_DEFS = map && typeof map === 'object' ? map : {}; };
/** Définition du formulaire d'un modèle (nom d'onglet) ; la grille par défaut si le modèle est inconnu. */
const definitionFor = (modele) => TEMPLATE_DEFS[modele]
    || { name: modele || '', categorie: 'A&B', criteria_groups: CRITERIA_GROUPS, levels: LEVELS, flags: { objectifs_service: true } };
const groupsOf = (d) => (d && d.criteria_groups) || CRITERIA_GROUPS;
/** Sans définition précise : toutes les clés de critères connues (grille historique + modèles) sont conservées, rien n'est perdu à la normalisation. */
const allCriteria = () => {
    const out = [];
    for (const g of CRITERIA_GROUPS) out.push(...g.items);
    for (const d of Object.values(TEMPLATE_DEFS)) for (const g of d.criteria_groups || []) out.push(...g.items);
    return out;
};

const emptyCrep = () => ({
    grade: '',
    date_convocation: '', date_entretien: '', date_notification: '',
    evaluateur_nom: '',
    missions: '',
    objectifs_ecoules: Array.from({ length: NB_OBJECTIFS }, () => ({ objectif: '', observations: '', niveau: '' })),
    observations_complementaires: '',
    valeur: {},
    appreciation_generale: '',
    objectifs_service: '',
    objectifs_futurs: Array.from({ length: NB_OBJECTIFS }, () => ({ descriptif: '', moyens: '' })),
    formations: { obligatoires: '', metiers: '', parcours: '' },
    evolution: '',
    mobilite: '',
    obs_agent_conditions: '',
    obs_agent_entretien: '',
    visa_autorite: '',
    origine: '',   // 'manuscrit' : repris d'un document papier lu par l'IA (non contractuel, l'original signé fait foi)
});

const VALID_LEVELS = new Set(['S', 'AS', 'I']);
const VALID_NIVEAUX = new Set(['A', 'PA', 'NA']);
const str = (v, max = 8000) => (v === null || v === undefined ? '' : String(v)).slice(0, max);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

/** Normalise / assainit le contenu reçu du frontend (jamais de confiance sur la structure). */
function normalizeCrep(input, definition) {
    const src = input && typeof input === 'object' ? input : {};
    const base = emptyCrep();
    const out = { ...base };
    out.grade = str(src.grade, 200);
    out.date_convocation = isoDate(src.date_convocation);
    out.date_entretien = isoDate(src.date_entretien);
    out.date_notification = isoDate(src.date_notification);
    out.evaluateur_nom = str(src.evaluateur_nom, 200);
    out.missions = str(src.missions);
    out.objectifs_ecoules = base.objectifs_ecoules.map((_, i) => {
        const o = (Array.isArray(src.objectifs_ecoules) ? src.objectifs_ecoules[i] : null) || {};
        return { objectif: str(o.objectif), observations: str(o.observations), niveau: VALID_NIVEAUX.has(o.niveau) ? o.niveau : '' };
    });
    out.observations_complementaires = str(src.observations_complementaires);
    out.valeur = {};
    const items = definition ? groupsOf(definition).flatMap(g => g.items) : allCriteria();
    for (const it of items) {
        const v = src.valeur && src.valeur[it.key];
        if (VALID_LEVELS.has(v)) out.valeur[it.key] = v;
    }
    out.appreciation_generale = str(src.appreciation_generale);
    out.objectifs_service = str(src.objectifs_service);
    out.objectifs_futurs = base.objectifs_futurs.map((_, i) => {
        const o = (Array.isArray(src.objectifs_futurs) ? src.objectifs_futurs[i] : null) || {};
        return { descriptif: str(o.descriptif), moyens: str(o.moyens) };
    });
    const f = src.formations || {};
    out.formations = { obligatoires: str(f.obligatoires), metiers: str(f.metiers), parcours: str(f.parcours) };
    out.evolution = str(src.evolution);
    out.mobilite = str(src.mobilite);
    out.obs_agent_conditions = str(src.obs_agent_conditions);
    out.obs_agent_entretien = str(src.obs_agent_entretien);
    out.visa_autorite = str(src.visa_autorite);
    out.origine = src.origine === 'manuscrit' ? 'manuscrit' : '';
    return out;
}

/** Rubriques obligatoires non renseignées (le compte rendu ne peut être validé que s'il est complet). */
function missingFields(crep, definition) {
    const c = normalizeCrep(crep, definition);
    const empty = (v) => !String(v || '').trim();
    const out = [];
    if (empty(c.grade)) out.push('Grade actuel');
    if (empty(c.evaluateur_nom)) out.push('Nom de l’évaluateur');
    if (empty(c.missions)) out.push('Rappel des missions de l’agent');
    const objs = c.objectifs_ecoules;
    // Un objectif au minimum ; seule sa description est obligatoire (observations et niveau facultatifs).
    if (!objs.some(o => !empty(o.objectif))) out.push('Au moins un objectif de l’année écoulée (description)');
    objs.forEach((o, i) => { if (empty(o.objectif) && (!empty(o.observations) || o.niveau)) out.push(`Objectif ${i + 1} de l’année écoulée : description à renseigner`); });
    if (empty(c.observations_complementaires)) out.push('Observations complémentaires (contexte, faits marquants, acquis professionnels)');
    if (empty(c.appreciation_generale)) out.push('Appréciation générale sur l’exercice des missions');
    if ((!definition || !definition.flags || definition.flags.objectifs_service !== false) && empty(c.objectifs_service)) out.push('Rappel des objectifs du service / de la direction');
    if (!c.objectifs_futurs.some(o => !empty(o.descriptif))) out.push('Au moins un objectif de l’année à venir (descriptif)');
    c.objectifs_futurs.forEach((o, i) => { if (empty(o.descriptif) && !empty(o.moyens)) out.push(`Objectif ${i + 1} de l’année à venir : descriptif à renseigner`); });
    if (empty(c.formations.obligatoires)) out.push('Formations obligatoires (indiquer « Néant » si aucune)');
    if (empty(c.formations.metiers)) out.push('Autres formations métiers (indiquer « Néant » si aucune)');
    if (empty(c.formations.parcours)) out.push('Formations liées à l’accompagnement des parcours (indiquer « Néant » si aucune)');
    return out;
}

/** Avertissement (non bloquant) : critères de la grille d'appréciation sans réponse — ce cas arrive, la validation reste possible. */
function gridWarning(crep, definition) {
    const c = normalizeCrep(crep, definition);
    const n = groupsOf(definition).flatMap(g => g.items).filter(it => !c.valeur[it.key]).length;
    return n ? `Grille d’appréciation de la valeur professionnelle : ${n} critère(s) sans réponse` : '';
}

module.exports = { LEVELS, CRITERIA_GROUPS, NB_OBJECTIFS, emptyCrep, normalizeCrep, missingFields, setTemplateDefs, definitionFor, groupsOf, gridWarning };
