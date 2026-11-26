/**
 * Première analyse de la demande, par des règles fixes (sans IA).
 *
 * Ce que la question dit clairement (sections, années, regroupements, seuils, dépenses ou recettes) est repéré
 * ici et IMPOSÉ à la demande, quoi qu'en ait compris le modèle. Une suite qui ne fait que retoucher la réponse
 * précédente (« sépare fonctionnement et investissement », « par chapitre », « et en 2024 ») s'applique
 * directement à la demande précédente, sans repasser par le modèle : rien ne se perd en route.
 */
const { SOURCES } = require('./datasets');
const { reconnaitre } = require('./referentiel');
const { exclus } = require('./exclusions');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

const DIMS = [
    ['direction', /directions?/], ['service', /services?/], ['chapitre', /chapitres?/], ['nature', /natures?|articles?/], ['tiers', /tiers|fournisseurs?|entreprises?|prestataires?/],
    ['mois', /mois/], ['exercice', /ans?|annees?|exercices?/], ['budget', /budgets?/], ['fonction', /fonctions?/], ['operation', /operations?/],
    ['ligne', /lignes?(?: budgetaires?)?|imputations?/], ['section', /sections?/],
];

// Mots qui n'apportent pas de nouvelle demande : s'il ne reste qu'eux, la question retouche la réponse précédente
const FILLER = new Set(('a au aux avec cette ce ces ceux dans de des du d l la le les un une et ou en sur pour par pas puis plutot aussi alors maintenant meme chose pareil '
    + 'montre montrer affiche afficher donne donner fais faire mets mettre peux tu me moi il te plait stp svp je veux voudrais idem seulement uniquement que qu '
    + 'separe separer separes separement distingue distinguer distinct detaille detailler detail ventile ventiler ventilation repartis repartir repartition decompose regroupe regrouper classe classer '
    + 'compare comparer compares comparaison versus vs rapport face entre difference ecart ecarts histo histos couleur couleurs differente differentes different multicolore chaque sous forme courbe courbes histogramme graphique graphe diagramme camembert secteurs barres batons tableau tableaux '
    + 'fonctionnement investissement depenses depense recettes recette section sections depuis entre jusqu annee annees an ans exercice exercices derniere dernier precedente precedent passee '
    + 'direction directions dir pole service services hors sauf excepte exceptee exception dehors autres autre '
    + 'tous toutes tout ville total global globale sans filtre aucun grosses gros importants importantes eleves elevees dernieres derniers premiers '
    + 'plus moins superieur superieurs superieures inferieur inferieurs inferieures dessus dessous euros euro k').split(' '));

// Ce que l'on cherche, même mal tapé (« commanges ») : le mot décide de la source, pas le modèle
const PIECES = [['commandes', 'commandes'], ['commande', 'commandes'], ['factures', 'factures'], ['facture', 'factures'], ['engagements', 'engagements'], ['engagement', 'engagements'], ['mandats', 'mandats'], ['mandat', 'mandats'], ['titres', 'mandats']];

/** Distance d'édition (fautes de frappe), bornée. */
function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    // deux lettres voisines interverties (« factrues ») : une seule faute
    for (let i = 0; i + 1 < a.length; i++) if (a.slice(0, i) + a[i + 1] + a[i] + a.slice(i + 2) === b) return 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row;
    }
    return prev[b.length];
}

function sourceDemandee(question, ignorer) {
    const found = new Set();
    for (const raw of String(question).toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean)) {
        // « mandaté », « facturé », « engagé » sont des montants, pas des pièces
        if (/é(?:s|e|es)?$/.test(raw) || raw === 'mandate' || ignorer.includes(raw)) continue;
        const word = norm(raw);
        const hit = PIECES.find(([mot]) => word === mot) || (word.length >= 7 && PIECES.find(([mot]) => mot.length >= 7 && distance(word, mot) <= (mot.length >= 10 ? 2 : 1)));
        if (hit) found.add(hit[1]);
    }
    // Plusieurs sortes de pièces, ou le budget : on laisse le modèle juger
    return found.size === 1 && !/\bbudgets?\b/.test(norm(question)) ? [...found][0] : null;
}

function analyse(question, today = new Date()) {
    // Directions et services nommés (sigles compris), retirés avant la suite de l’analyse
    const { entites, inconnus, reste } = reconnaitre(question);
    let q = ` ${norm(reste).replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1')} `;
    const y = today.getFullYear();
    const c = {};
    if (entites.length) {
        c.entites = entites;
        // « hors DSI » : ces services sont à retirer, les autres à retenir
        const out = exclus(question, entites.map(e => e.mot));
        const kept = [...new Set(entites.filter(e => !out.has(e.mot)).flatMap(e => e.codes))];
        const removed = [...new Set(entites.filter(e => out.has(e.mot)).flatMap(e => e.codes))];
        if (kept.length) c.services = kept;
        if (removed.length) c.servicesExclus = removed;
    }
    if (inconnus.length) c.inconnus = inconnus;

    // Seuils (à retirer avant de chercher les années)
    const amount = (re) => {
        const m = q.match(re);
        if (!m) return null;
        const value = Number(m[1].replace(',', '.')) * (m[2] === 'k' ? 1000 : 1);
        const money = m[2] || m[3];
        if (!money && (value < 100 || (value >= 2000 && value <= y + 1))) return null; // « plus de 5 ans », « moins de 2024 »
        q = q.replace(m[0], ' ');
        return value;
    };
    const min = amount(/(?:plus de|superieure?s? a|au[- ]dessus de|>=?)\s*(\d+(?:[.,]\d+)?)\s*(k)?\s*(€|euros?)?/);
    const max = amount(/(?:moins de|inferieure?s? a|en[- ]dessous de|<=?)\s*(\d+(?:[.,]\d+)?)\s*(k)?\s*(€|euros?)?/);
    if (min != null) c.montant_min = min;
    if (max != null) c.montant_max = max;

    // Années
    const range = (from, to) => Array.from({ length: Math.max(0, Math.min(to - from, 15)) + 1 }, (_, i) => from + i);
    let m;
    if ((m = q.match(/\bdepuis\s+(20\d\d)\b/))) c.exercices = range(Number(m[1]), y);
    else if ((m = q.match(/\b(?:de|entre)\s+(20\d\d)\s+(?:a|et)\s+(20\d\d)\b/))) c.exercices = /\bentre\b/.test(m[0]) || / a /.test(m[0]) ? range(Number(m[1]), Number(m[2])) : [Number(m[1]), Number(m[2])];
    else if ((m = q.match(/\b(?:les|sur)\s+(\d{1,2})\s+dernier(?:e?s)?\s+(?:annees|ans|exercices)\b|\bsur\s+(\d{1,2})\s+ans\b/))) c.exercices = range(y - Number(m[1] || m[2]) + 1, y);
    else {
        const years = [...q.matchAll(/\b(20\d\d)\b/g)].map(x => Number(x[1])).filter(v => v <= y + 1);
        if (/\b(?:l )?an(?:nee)? (?:derniere?|passee?|precedente?)\b|\bexercice precedent\b/.test(q)) years.push(y - 1);
        if (/\bcette annee\b|\bexercice en cours\b|\bannee en cours\b/.test(q)) years.push(y);
        if (years.length) c.exercices = [...new Set(years)].sort();
    }

    // Sections
    const f = /\bfonctionnement\b/.test(q);
    const i = /\binvestissement\b/.test(q);
    if (f && i) c.sections = 'les_deux';
    else if (f || i) c.section = f ? 'F' : 'I';

    const dep = /\bdepenses?\b/.test(q);
    const rec = /\brecettes?\b/.test(q);
    if (rec && !dep) c.sens = 'R';
    else if (dep && !rec) c.sens = 'D';

    // Regroupements : « par chapitre », « par service et par nature »
    const dims = [];
    for (const [dim, re] of DIMS) if (new RegExp(`\\bpar\\s+(?:${re.source})\\b`).test(q)) dims.push(dim);
    if (dims.includes('section')) { c.sections = 'les_deux'; dims.splice(dims.indexOf('section'), 1); }
    if (dims.length) c.dims = dims;

    // « les 10 dernières », « les 5 plus grosses » : nombre et classement demandés
    const top = q.match(/\bles\s+(\d{1,3})\s+(dernie|derniere|plus\s+(?:gros|grosses?|importants?|importantes?|eleves?|elevees?)|premier)/);
    const last = /\b(?:les|la|le)\s+(?:\d{1,3}\s+)?(?:dernieres|derniers)\b(?!\s+(?:annees|ans|exercices))/.test(q);
    const best = q.match(/\btop\s*(\d{1,3})\b/);
    if (top) c.limite = Number(top[1]);
    else if (best) { c.limite = Number(best[1]); c.tri = 'montant'; }
    // « les mandats », « montre les factures UGAP » : on veut les pièces, pas un total
    if (/^\s*(?:liste\w*|montre\w*|affiche\w*|donne\w*|voir)?\s*(?:moi\s+)?(?:des|les)\s+(?:factures|commandes|mandats|engagements|titres)\b/.test(q) && !/\bpar\b|\btotal\b|\bmontant total\b/.test(q)) c.liste = true;
    if (last) { c.tri = 'date'; c.liste = true; } else if (top && /plus/.test(top[2])) c.tri = 'montant';

    // Levée de ce qui avait été dit plus tôt
    const reset = {
        // « budget total », « budget global », « de la ville » : sans service nommé, on revient à tout le périmètre
        services: /\b(?:tous les services|toutes les directions|toute la ville|tous services)\b/.test(q)
            || (!entites.length && /\bbudget\b.*\b(?:total|globale?)\b|\b(?:total|budget)\b.*\bde la ville\b/.test(q)),
        exercices: /\btoutes les annees\b/.test(q),
        filtres: /\b(?:toutes les (?:factures|commandes|depenses)|tous les (?:engagements|mandats|titres|etats)|sans filtre|sans aucun filtre|avec ou sans)\b/.test(q),
    };
    // Exclure sans rien retenir : on part de tous les services, pas de celui dont on parlait avant
    if (c.servicesExclus && !c.services) reset.services = true;
    if (reset.services || reset.exercices || reset.filtres) c.reset = reset;
    if (reset.exercices) c.exercices = range(y - 4, y);
    c.parleEtat = /\bservice fait\b|\brejet|\ben cours\b|\breste\b|\bsolde/.test(` ${norm(question)} `);

    // Comparaison : « compare », « par rapport à », « vs », « écart », « différence entre »
    const brut = ` ${norm(question)} `;
    if (/\bcompar\w*|\bversus\b|\bvs\b|\bpar rapport\b|\bface a\b|\becarts?\b|\bdifference entre\b/.test(brut)) {
        c.comparaison = true;
        const mesures = [['vote', /\bvote\b/], ['mandate', /\bmandate\b/], ['engage', /\bengage\b/], ['disponible', /\bdisponible\b/], ['paye', /\bpaye\b/]].filter(([, re]) => re.test(brut)).map(([k]) => k);
        if (mesures.length > 1) c.mesures = mesures;
        const entre = entites.filter(e => !(c.servicesExclus || []).some(x => e.codes.includes(x)));
        if (entre.length > 1) c.entre = entre.every(e => e.codes.length > 1 || e.codes[0].endsWith('*')) ? 'direction' : 'service';
    }

    const piece = sourceDemandee(question, entites.flatMap(e => norm(e.mot).split(' ')));
    if (piece) {
        c.source = piece;
        // Sans total, regroupement ni graphique demandé : on veut les pièces elles-mêmes
        if (!c.comparaison && !/\bpar\b|\btotal\b|\bcombien\b|\bnombre\b|\bmontant\b|\bevolution\b|\bhistogramme\b|\bcourbe\b|\bgraphique\b|\bcamembert\b|\bplus gros|\btop\b|\bsomme\b/.test(norm(question))) c.liste = true;
    }

    // Le détail par service n'est donné que si la question parle de services (« service fait » mis à part)
    c.parleService = /\bservices?\b(?!\s+fait)/.test(norm(question));

    // Reste-t-il une demande nouvelle une fois ces éléments retirés ?
    let left = q;
    for (const [, re] of DIMS) left = left.replace(new RegExp(`\\bpar\\s+(?:${re.source})\\b`, 'g'), ' ');
    const rest = left.replace(/[^a-z0-9]+/g, ' ').split(' ')
        .filter(w => w && !FILLER.has(w) && !/^\d+$/.test(w));
    c.retouche = rest.length === 0;
    return c;
}

const asRaw = (query, changes = {}) => ({ ...query, regrouper_par: query.regrouper, ...changes });

/**
 * Impose à une demande validée ce que la question dit clairement.
 * @returns {{ requetes: object[], avis: string[] }}  demandes (brutes, à revalider) et remarques pour l'agent
 */
/** Rien d'autre à comparer que le temps : la question vise deux années (l'année en cours ou la précédente complète). */
function completerAnnees(c) {
    if (!c.comparaison || c.entre || c.sections || c.mesures || (c.tiers || []).length > 1 || (c.exercices?.length ?? 0) > 1) return c;
    const y = new Date().getFullYear();
    const one = c.exercices?.[0];
    return { ...c, exercices: one && one < y ? [one, y] : [y - 1, y] };
}

function apply(queries, constats) {
    const c = completerAnnees(constats);
    const avis = [];
    const out = [];
    let list = queries;
    let { sections } = c;
    // « par service » après deux tableaux fonctionnement / investissement : un seul tableau, avec la section
    const withoutSection = (x) => JSON.stringify({ ...x, filtres: { ...x.filtres, section: null } });
    if (c.dims && !c.section && list.length === 2 && list[0].filtres.section !== list[1].filtres.section && withoutSection(list[0]) === withoutSection(list[1])) {
        list = [{ ...list[0], filtres: { ...list[0].filtres, section: null } }];
        sections = 'les_deux';
    }
    for (const query of list) {
        // La pièce nommée dans la question impose la source
        let source = c.source && SOURCES[c.source] ? c.source : query.source;
        // Le budget ne connaît ni les tiers ni les mois : ce détail se lit dans les mandats
        const dims = c.dims || [];
        if (source === 'budget' && (c.tiers || dims.some(d => d === 'tiers' || d === 'mois'))) {
            source = 'mandats';
            avis.push('Le détail par tiers ou par mois est lu dans les mandats (le budget ne le contient pas).');
        }
        const def = SOURCES[source];
        const filtres = { ...query.filtres };
        // Direction ou service nommé : ce n'est pas un mot à chercher dans les libellés
        if (c.entites) {
            const names = c.entites.map(e => norm(`${e.mot} ${e.nom}`)).join(' ');
            filtres.texte = (filtres.texte || []).filter(t => !names.includes(norm(t)));
        }
        // Fournisseur cité : filtre sur le tiers, et son nom n'est pas à chercher dans les libellés
        // Exclusions dites maintenant ; sinon celles de la demande reprise, tant qu'aucun service n'est nommé
        let servicesExclus = c.servicesExclus || (c.entites || c.reset?.services ? [] : query.services_exclus || []);
        if (c.tiersExclus) {
            filtres.tiers_exclus = c.tiersExclus;
            filtres.tiers = (filtres.tiers || []).filter(t => !c.tiersExclus.includes(t));
        }
        if (c.tiers) {
            filtres.tiers = c.tiers;
            filtres.texte = (filtres.texte || []).filter(t => !c.tiers.some(x => norm(x).includes(norm(t))));
        }
        let { mode } = query;
        let regroup = [...query.regrouper];
        let mesures = source === query.source ? query.mesures : def.defaults.mesures;

        if (c.montant_min != null) filtres.montant_min = c.montant_min;
        if (c.montant_max != null) filtres.montant_max = c.montant_max;
        if (c.sens) filtres.sens = c.sens;
        let { exercices } = query;
        // Seul un nombre dit par l'agent borne le résultat (le modèle en ajoute parfois)
        let limite = c.limite || (c.retouche ? query.limite : null);
        const tri = c.tri || query.tri;
        if (c.liste && def.list && !dims.length) mode = 'liste';
        // « les dernières » sans année dite : on remonte aux exercices précédents, pas seulement l'année en cours
        if (mode === 'liste' && c.tri === 'date' && !c.exercices && !query.annees_fixees) {
            const y = new Date().getFullYear();
            exercices = [y - 4, y - 3, y - 2, y - 1, y];
        }
        if (c.section) {
            filtres.section = c.section;
            regroup = regroup.filter(d => d !== 'section');
        }

        // Ce que l'on compare devient un axe du tableau
        const axes = [...dims];
        if (c.comparaison) {
            mode = 'synthese';
            limite = null;
            if (c.entre) axes.push(c.entre);
            if ((c.tiers || []).length > 1) axes.push('tiers');
            if (c.mesures) mesures = c.mesures.filter(x => def.measures[x]).length > 1 ? c.mesures.filter(x => def.measures[x]) : mesures;
        }
        // Comparaison sur une seule année : la colonne « exercice » n’apporte rien
        if (c.comparaison && exercices.length === 1) regroup = regroup.filter(d => d !== 'exercice');
        const supported = [...new Set(axes)].filter(d => def.dims[d]);
        for (const d of dims.filter(x => !def.dims[x])) avis.push(`Le regroupement par ${d} n’existe pas pour les ${def.label.toLowerCase()}.`);
        if (supported.length) {
            mode = 'synthese';
            // Les détails demandés remplacent les autres (le modèle en ajoute parfois) ; section et années restent
            const kept = regroup.filter(d => d === 'section' || d === 'exercice');
            regroup = [...new Set([...kept, ...supported])];
        }

        const services = c.services || (c.servicesExclus ? (c.retouche ? query.services.filter(s => !c.servicesExclus.includes(s)) : []) : query.services);
        const base = asRaw(query, { source, mode, mesures, filtres, exercices, limite, tri, annees_fixees: !!(c.exercices || query.annees_fixees), regrouper_par: regroup, services, services_exclus: servicesExclus, comparaison: !!(c.comparaison || (c.retouche && query.comparaison)), ...(c.exercices ? { exercices: c.exercices } : {}) });

        // Une direction se compte en entier : ses services sont additionnés, sauf si le détail est demandé
        if (!c.parleService && !c.entre && (c.entites || !c.retouche) && regroup.includes('service')) {
            regroup = regroup.filter(d => d !== 'service');
            base.regrouper_par = regroup;
        }

        // « fonctionnement » n'est pas la « fonction » de la nomenclature
        if ((c.section || sections) && !dims.includes('fonction')) regroup = regroup.filter(d => d !== 'fonction');

        if (sections === 'les_deux') {
            if (mode === 'synthese' && def.dims.section) {
                out.push({ ...base, filtres: { ...filtres, section: null }, regrouper_par: ['section', ...regroup.filter(d => d !== 'section')].slice(0, 3) });
            } else if (def.filters.section || def.lineFilters?.section) {
                // Liste, ou source sans colonne « section » : un tableau par section
                for (const section of ['F', 'I']) out.push({ ...base, filtres: { ...filtres, section } });
            } else {
                avis.push(`Les ${def.label.toLowerCase()} ne portent pas de section : fonctionnement et investissement ne peuvent pas être séparés.`);
                out.push(base);
            }
        } else out.push(base);
    }
    return { requetes: [...new Map(out.map(x => [JSON.stringify(x), x])).values()].slice(0, 4), avis: [...new Set(avis)] };
}

module.exports = { analyse, apply };
