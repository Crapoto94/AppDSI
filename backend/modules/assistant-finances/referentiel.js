/**
 * Directions et services de la Ville : noms, sigles et codes des services gestionnaires Sedit.
 *
 * Établi d'après l'organigramme RH (oracle.rh_v_extract_dsi) et FI.SERVICEFI (novembre 2026). À compléter ici
 * quand l'organisation change ou qu'un sigle manque. « codes » : codes Sedit, « XX* » = tout ce qui commence par XX.
 * Ceci ne donne AUCUN droit : le périmètre de l'agent s'applique toujours ensuite.
 *
 * « noms » : fragments reconnus (sans accents, en minuscules) après les mots « direction » ou « service ».
 */
const DIRECTIONS = [
    { nom: 'Direction des Systèmes d’Information', sigles: ['DSI', 'DSIN', 'DIRSI'], codes: ['BF*'], noms: ['systemes d information', 'systeme d information', 'informatique'] },
    { nom: 'Direction de la Communication', sigles: ['DCOM', 'DIRCOM', 'DCO'], codes: ['BP*'], noms: ['communication'] },
    { nom: 'Direction des Ressources Humaines', sigles: ['DRH', 'DIRRH'], codes: ['BC*'], noms: ['ressources humaines', 'rh', 'personnel'] },
    { nom: 'Direction des Services Financiers', sigles: ['DSF', 'DF', 'DFIN', 'DIRFIN'], codes: ['BE1', 'BE2', 'BE3'], noms: ['services financiers', 'finances', 'financiere'] },
    { nom: 'Direction Générale des Services', sigles: ['DGS'], codes: ['BB1*', 'BB5', 'BB6', 'DGS'], noms: ['generale des services', 'generale'] },
    { nom: 'Direction Générale des Services Techniques', sigles: ['DGST'], codes: ['BB1DGST', 'DGA_ST'], noms: ['generale des services techniques'] },
    { nom: 'Direction de la Scolarité, des Accueils de Loisirs et de l’Éducation', sigles: ['DSALE', 'DSAL', 'DSCO', 'DASCO', 'DSE'], codes: ['BG*'], noms: ['scolarite', 'scolaire', 'education', 'accueils de loisirs', 'enseignement'] },
    { nom: 'Direction de la Culture', sigles: ['DCULT', 'DCUL', 'DC', 'DAC'], codes: ['BH*'], noms: ['culture', 'affaires culturelles', 'culturelle'] },
    { nom: 'Direction de la Santé', sigles: ['DSAN', 'DSANTE'], codes: ['BJ2', 'BJ4', 'BJ5', 'BJ7', 'BJ8'], noms: ['sante'] },
    { nom: 'Direction du CCAS', sigles: ['CCAS', 'DCCAS'], codes: ['BJ1', 'BJ12', 'BJ14', 'BJ3', 'J*'], noms: ['ccas', 'action sociale'] },
    { nom: 'Direction du Développement Urbain', sigles: ['DDU', 'DIRDU'], codes: ['BL*'], noms: ['developpement urbain', 'urbanisme'] },
    { nom: 'Direction des Bâtiments Communaux', sigles: ['DBC', 'DBAT', 'DIRBAT'], codes: ['BM*'], noms: ['batiments communaux', 'batiments', 'batiment'] },
    { nom: 'Direction des Espaces Publics', sigles: ['DEP', 'DESP'], codes: ['BN*', 'BB4'], noms: ['espaces publics', 'espace public'] },
    { nom: 'Direction Démocratie et Action Citoyenne', sigles: ['DDAC', 'DDEMOC'], codes: ['BR*'], noms: ['democratie', 'action citoyenne', 'citoyennete'] },
    { nom: 'Direction des Actions et Prestations aux Familles', sigles: ['DAPF', 'DPF', 'DFAM'], codes: ['BS*'], noms: ['actions et prestations familles', 'prestations familles', 'familles', 'famille'] },
    { nom: 'Direction des Sports', sigles: ['DS', 'DSPORT', 'DSPORTS', 'DIRSPORT'], codes: ['BT*'], noms: ['sports', 'sport'] },
    { nom: 'Direction de la Jeunesse', sigles: ['DJ', 'DJEUN', 'DJEUNESSE'], codes: ['BU*'], noms: ['jeunesse'] },
    { nom: 'Direction des Affaires Juridiques et de la Commande Publique', sigles: ['DAJCP', 'DAJ', 'DAJC', 'DCP', 'DJUR'], codes: ['DAJCP', 'AFFJUR', 'BB2', 'BB3', 'BE4', 'BE5'], noms: ['affaires juridiques', 'juridique', 'commande publique'] },
];

const SERVICES = [
    // DSI
    { nom: 'Infrastructures, serveurs et systèmes', codes: ['BF6'], noms: ['infrastructures?', 'reseaux', 'serveurs', 'systemes et reseaux'] },
    { nom: 'Utilisateurs', codes: ['BF7'], noms: ['utilisateurs'] },
    { nom: 'Bureau des projets', codes: ['BF8'], noms: ['bureau des projets', 'projets'], seuls: ['bureau des projets'] },
    { nom: 'Déploiement et support', codes: ['BF9'], noms: ['deploiement', 'support'], seuls: ['deploiement et support'] },
    // RH, finances, juridique
    { nom: 'Rémunération et déroulement de carrière', codes: ['BC2'], noms: ['remuneration', 'paie', 'carrieres?'] },
    { nom: 'Emploi et développement des compétences', codes: ['BC3'], noms: ['emploi', 'competences', 'formation'] },
    { nom: 'Santé et prévention (RH)', codes: ['BC7'], noms: ['sante prevention', 'sante au travail'] },
    { nom: 'Études et programmation financière', codes: ['BE2'], noms: ['etudes et programmation', 'programmation financiere'] },
    { nom: 'Budget et comptabilité', codes: ['BE3'], noms: ['budget et comptabilite', 'comptabilite', 'budget comptabilite'] },
    { nom: 'Marchés publics', codes: ['BE4'], noms: ['marches publics', 'marches'], seuls: ['marches publics'] },
    { nom: 'Achats', codes: ['BE5'], noms: ['achats?'] },
    { nom: 'Conseil et contentieux', codes: ['BB2'], noms: ['conseil et contentieux', 'contentieux'] },
    { nom: 'Affaires civiles', codes: ['BB3'], noms: ['affaires civiles', 'etat civil'], seuls: ['affaires civiles', 'etat civil'] },
    // Culture, communication
    { nom: 'Cinéma Le Luxy', codes: ['BH2'], noms: ['cinema', 'luxy'], seuls: ['cinema', 'luxy'] },
    { nom: 'Médiathèques', codes: ['BH3'], noms: ['mediatheques?', 'bibliotheques?'], seuls: ['mediatheques?'] },
    { nom: 'Arts plastiques, galerie Fernand Léger', codes: ['BH4'], noms: ['arts plastiques', 'galerie'], seuls: ['arts plastiques'] },
    { nom: 'Conservatoire', codes: ['BH5'], noms: ['conservatoire'], seuls: ['conservatoire'] },
    { nom: 'Le Hangar', codes: ['BH6'], noms: ['hangar'], seuls: ['hangar'] },
    { nom: 'Relations publiques et internationales', codes: ['BP2'], noms: ['relations publiques', 'relations internationales'], seuls: ['relations publiques'] },
    { nom: 'Archives et patrimoine', codes: ['BP4'], noms: ['archives'], seuls: ['archives'] },
    { nom: 'Information', codes: ['BP5'], noms: ['information(?! et)'] },
    { nom: 'Information et communication numériques', codes: ['BP6'], noms: ['communication numeriques?', 'information et communication numeriques?'] },
    { nom: 'Gestion des relations aux usagers', codes: ['BP8'], noms: ['relations (?:aux )?usagers', 'usagers'] },
    // Santé
    { nom: 'Centre municipal de santé', codes: ['BJ4'], noms: ['centre municipal de sante', 'cms'], seuls: ['centre municipal de sante', 'cms'] },
    { nom: 'CMPP', codes: ['BJ5'], noms: ['cmpp', 'medico psycho'], seuls: ['cmpp'] },
    { nom: 'Santé publique', codes: ['BJ8'], noms: ['sante publique'], seuls: ['sante publique'] },
    // Urbanisme, bâtiments, espaces publics
    { nom: 'Urbanisme réglementaire', codes: ['BL2'], noms: ['urbanisme reglementaire'], seuls: ['urbanisme reglementaire'] },
    { nom: 'Affaires foncières, locatives et commerciales', codes: ['BL3'], noms: ['affaires foncieres', 'foncier'] },
    { nom: 'Habitat', codes: ['BL4'], noms: ['habitat'] },
    { nom: 'Études et travaux bâtiments', codes: ['BM2'], noms: ['etudes et travaux(?: batiments?)?'] },
    { nom: 'Bureau d’études', codes: ['BM5'], noms: ['bureau d etudes'], seuls: ['bureau d etudes'] },
    { nom: 'Nettoiement des bâtiments', codes: ['BM6'], noms: ['nettoiement', 'entretien des batiments'] },
    { nom: 'Énergie', codes: ['BM7'], noms: ['energie'] },
    { nom: 'Maintenance préventive du patrimoine bâti', codes: ['BM8*'], noms: ['maintenance preventive', 'patrimoine bati'] },
    { nom: 'Études et grands travaux (espaces publics)', codes: ['BN2'], noms: ['grands travaux'] },
    { nom: 'Déplacement et stationnement', codes: ['BN5'], noms: ['stationnement', 'deplacements?'] },
    { nom: 'Voirie', codes: ['BN6', 'VOIRIE'], noms: ['voirie'] },
    { nom: 'Espaces verts', codes: ['BN7', 'ESP'], noms: ['espaces verts'], seuls: ['espaces verts'] },
    { nom: 'Propreté des espaces publics', codes: ['BN8'], noms: ['proprete'] },
    { nom: 'Parc automobile', codes: ['BN9', 'BB4'], noms: ['parc auto(?:mobile)?', 'garage'], seuls: ['parc automobile'] },
    // Citoyenneté, familles, sports, jeunesse
    { nom: 'Vie des quartiers', codes: ['BR2'], noms: ['vie des quartiers', 'quartiers'], seuls: ['vie des quartiers'] },
    { nom: 'Vie associative', codes: ['BR3'], noms: ['vie associative', 'associations'], seuls: ['vie associative'] },
    { nom: 'Citoyenneté et démocratie locale', codes: ['BR4'], noms: ['democratie locale'] },
    { nom: 'Prévention et lutte contre les incivilités', codes: ['BR6'], noms: ['incivilites'] },
    { nom: 'Petite enfance', codes: ['BS2'], noms: ['petite enfance', 'creches?'], seuls: ['petite enfance'] },
    { nom: 'Vacances', codes: ['BS3'], noms: ['vacances'] },
    { nom: 'Installations sportives', codes: ['BT2'], noms: ['installations sportives'], seuls: ['installations sportives'] },
    { nom: 'Équipements nautiques', codes: ['BT3'], noms: ['equipements? (?:nautiques?|aquatiques?)', 'piscines?'], seuls: ['piscines?'] },
    { nom: 'Activités sportives municipales', codes: ['BT4'], noms: ['activites sportives'] },
    { nom: 'Accueils des temps scolaires et de loisirs', codes: ['BG2*'], noms: ['accueils?(?: des)? temps scolaires', 'accueils de loisirs'] },
    { nom: 'Enseignement', codes: ['BG3'], noms: ['enseignement'] },
    { nom: 'Restauration et logistique', codes: ['BG22'], noms: ['restauration'] },
];

// Sigles courants en « D… » qui ne désignent pas une direction
const PAS_UNE_DIRECTION = new Set(['DGP', 'DGF', 'DOB', 'DM', 'DETR', 'DSIL', 'DGA', 'DPGF', 'DQE', 'DCE', 'DPT', 'DEPT', 'DEC', 'DU', 'DE', 'DES']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const LINK = '(?:(?:de la|de l|des|du|de|d)\\s+)?';

/**
 * Directions et services nommés dans la question.
 * @returns {{ entites: {mot:string, nom:string, codes:string[]}[], inconnus: string[], reste: string }}
 *          « reste » : la question (sans accents, en minuscules) privée de ces noms
 */
function reconnaitre(question) {
    let text = ` ${norm(question)} `;
    const entites = [];
    const inconnus = [];
    const take = (re, entity) => {
        const m = text.match(re);
        if (!m) return false;
        entites.push({ mot: m[0].trim(), nom: entity.nom, codes: entity.codes });
        text = text.replace(m[0], ' ');
        return true;
    };

    // 1) Sigles (« DSI », « DirCom »). Les sigles très courts doivent être écrits en majuscules.
    for (const d of DIRECTIONS) {
        for (const sigle of d.sigles) {
            const strict = sigle.length <= 3 && !['DSI', 'DRH'].includes(sigle);
            if (take(new RegExp(`(?<![A-Za-z0-9_])${sigle}(?![A-Za-z0-9_])`, strict ? '' : 'i'), d)) break;
        }
    }
    // 2) « service … » puis « direction … » : le nom le plus long d'abord
    const byName = (list, prefix) => {
        const all = list.flatMap(e => e.noms.map(n => ({ e, n }))).sort((a, b) => b.n.length - a.n.length);
        for (const { e, n } of all) {
            if (entites.some(x => x.nom === e.nom)) continue;
            take(new RegExp(`\\b${prefix}\\s+${LINK}(?:${n})\\b`, 'i'), e);
        }
    };
    byName(DIRECTIONS, '(?:direction|dir\\.?|pole)');
    byName(SERVICES, 'services?');
    // 2 bis) Après « hors », « sauf »… un nom se passe de « direction » : « sauf la communication et la voirie »
    {
        const articles = '(?:(?:et|ni|ou|de|d|du|des|la|le|les|l|pour)\\s+)*';
        const all = [...DIRECTIONS, ...SERVICES].flatMap(e => e.noms.map(n => ({ e, n }))).sort((a, b) => b.n.length - a.n.length);
        for (let trouve = true; trouve;) {
            trouve = false;
            for (const { e, n } of all) {
                if (entites.some(x => x.nom === e.nom)) continue;
                const m = text.match(new RegExp(`\\b(?:hors|sauf|excepte[es]?|autres? que|a l exception d(?:e|u|es)?|en dehors d(?:e|u|es)?)\\s+(?:(?:et|ni)\\s+)*${articles}(${n})\\b`, 'i'));
                if (!m) continue;
                entites.push({ mot: m[1], nom: e.nom, codes: e.codes });
                text = text.replace(m[0], m[0].slice(0, m[0].length - m[1].length));
                trouve = true;
                break;
            }
        }
    }
    // 3) Noms assez distinctifs pour être reconnus seuls (« le conservatoire », « la piscine »)
    for (const s of SERVICES) {
        for (const n of s.seuls || []) {
            if (!entites.some(x => x.nom === s.nom)) take(new RegExp(`\\b(?:${n})\\b`, 'i'), s);
        }
    }
    // 3 bis) Préfixe d'une direction, entre parenthèses ou après « direction » : « (BF) », « direction BF ».
    // Jamais seul : « BP 2025 » désigne le budget primitif.
    for (const m of [...text.matchAll(/(?:\(\s*|\b(?:direction|dir\.?)\s+)(B[B-V])\b\s*\)?/gi)]) {
        const d = DIRECTIONS.find(x => x.codes.length === 1 && x.codes[0] === `${m[1].toUpperCase()}*`);
        if (!d) continue;
        if (!entites.some(x => x.nom === d.nom)) entites.push({ mot: m[1], nom: d.nom, codes: d.codes });
        text = text.replace(m[0], ' ');
    }
    // 4) Codes de service écrits tels quels (BF6, BP1…)
    for (const m of [...text.matchAll(/\b(B[B-V]\d{1,3})\b/gi)]) {
        const code = m[1].toUpperCase();
        entites.push({ mot: m[0], nom: `Service ${code}`, codes: [code] });
        text = text.replace(m[0], ' ');
    }
    // 5) Un sigle en « D… » inconnu désigne une direction que le référentiel ne connaît pas
    for (const m of text.matchAll(/(?<![A-Za-z0-9_])(D[A-Z]{1,6}|[Dd][Ii][Rr][A-Z][A-Za-z]{1,8})(?![A-Za-z0-9_])/g)) {
        if (!PAS_UNE_DIRECTION.has(m[1].toUpperCase()) && !/^direct/i.test(m[1])) inconnus.push(m[1]);
    }
    return { entites, inconnus, reste: text.toLowerCase() };
}

/** Nom lisible d'une liste de codes demandés (pour le titre des tableaux). */
function libelle(codes) {
    if (!codes || !codes.length) return '';
    const wanted = new Set(codes);
    const names = [];
    for (const e of [...DIRECTIONS, ...SERVICES]) {
        if (e.codes.every(c => wanted.has(c))) {
            names.push(e.nom);
            e.codes.forEach(c => wanted.delete(c));
        }
    }
    return [...names, ...wanted].join(', ');
}

module.exports = { DIRECTIONS, SERVICES, reconnaitre, libelle };
