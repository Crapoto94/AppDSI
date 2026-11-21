/**
 * Registre des PROMPTS de l'IA locale utilisés par le module Entretiens.
 *
 * Chaque prompt a un texte par défaut (ci-dessous) ; un administrateur peut le modifier dans Paramétrage → IA.
 * Le texte modifié est conservé dans hub_entretiens.settings (clé `prompt:<id>`) ; « Rétablir » supprime la surcharge.
 * Les `{{variables}}` sont remplacées au moment de l'appel ; une variable inconnue est laissée telle quelle.
 *
 * Lecture synchrone depuis un cache (rafraîchi par refresh(), appelé avant chaque usage et après chaque sauvegarde).
 */
const svc = require('./entretiens.service');

const GLOSSAIRE = 'Vocabulaire fréquent dans ces comptes rendus (collectivité territoriale) : M57 (nomenclature budgétaire et comptable), M14, DGP (délai global de paiement), '
    + 'Sedit Finances, Sedit RH, RGPD, CNFPT, SIRH, GLPI, PES, DSI, DGS, DRH, CAP, VAE, Excel, Word, CACES, SST, "néant", "RAS" (rien à signaler), "1er trimestre", "2e semestre".';

const REGLES = 'Le manuscrit est écrit vite, en lettres courtes, avec des fautes et des mots peu lisibles : donne TA MEILLEURE LECTURE, en choisissant des mots français vraisemblables '
    + 'dans le contexte d’une mairie (finances, informatique, ressources humaines, services techniques). Si le cadre est vide, réponds "". N’invente jamais un texte qui n’est pas écrit. '
    + 'Un cadre peut contenir PLUSIEURS LIGNES manuscrites (deux ou trois) : lis TOUTES les lignes du cadre, de haut en bas, sans en oublier une, et réunis-les en une seule phrase. Ne recopie pas le texte imprimé du formulaire (titres, consignes) dans les réponses : seulement ce qui a été écrit à la main (sauf indication contraire). {{glossaire}}';

const FIN = '\nRéponds UNIQUEMENT par un objet JSON valide, sans commentaire. {{regles}}';
const INTRO = 'Cette image est une page d’un compte rendu d’entretien professionnel (formulaire imprimé, rempli à la main). ';

// Catégories de l'analyse des formations (clé → libellé). Modifiables via le prompt de classement (liste affichée au modèle).
const CATEGORIES_DEFAUT = [
    'concours = Préparation aux concours et examens professionnels (rédacteur, attaché, adjoint, promotion interne…)',
    'bureautique = Bureautique et outils numériques du quotidien (Word, Excel, PowerPoint, Outlook, Teams, messagerie, informatique de base)',
    'logiciels = Logiciels métier (Sedit, GLPI, logiciel de paie, état civil, SIG, GMAO, logiciel financier, etc.)',
    'obligatoires = Formations obligatoires, réglementaires et sécurité (secourisme PSC1/SST, habilitation électrique, CACES, incendie, gestes et postures, hygiène HACCP, travail en hauteur, formation d’intégration/statutaire)',
    'certifiantes = Formations certifiantes ou diplômantes (BAFA/BAFD, certiphyto, VAE, titres, diplômes, certifications)',
    'management = Formations managériales (management, encadrement, gestion d’équipe, conduite du changement, conduite de projet, gestion des conflits d’équipe, posture de manager)',
    'accueil = Accueil du public et relation aux usagers (accueil, agressivité, incivilités, communication, état civil)',
    'numerique = Numérique, cybersécurité et protection des données (RGPD, sécurité informatique, administration système, cloud)',
    'juridique_finances = Finances, marchés publics, juridique et ressources humaines (M57, comptabilité publique, commande publique, droit, paie, statut)',
    'technique = Techniques métier spécifiques (cuisine, espaces verts, bâtiment, nettoyage, animation, petite enfance, culture, police…)',
    'parcours = Parcours professionnel et développement personnel (bilan de compétences, mobilité, reconversion, expression orale, gestion du stress)',
    'autres = Autres / non classable',
].join('\n');

const DEFS = [
    // ─── Analyse globale des demandes de formation ───
    {
        id: 'formations.categories', group: 'Demandes de formation (analyse globale)', label: 'Catégories de l’analyse (liste)',
        description: 'Une ligne par catégorie, au format « clé = libellé et exemples ». La clé (sans espace) sert au classement ; le libellé est affiché dans le résultat. Ajoutez, supprimez ou renommez des catégories librement (gardez « autres »).',
        vars: [], text: CATEGORIES_DEFAUT,
    },
    {
        id: 'formations.classement', group: 'Demandes de formation (analyse globale)', label: 'Classement des demandes par catégorie',
        description: 'Envoyé par lots (en parallèle) : l’IA classe chaque demande dans UNE catégorie. Modifiez la liste des catégories pour changer les regroupements affichés (une ligne par catégorie : clé = libellé).',
        vars: ['categories', 'lignes'],
        text: 'Voici des demandes de formation, anonymes, issues des entretiens professionnels d’une mairie. Les agents écrivent librement (pas de liste déroulante) : formulations variées, abréviations, fautes d’orthographe, mention du CNFPT, parfois plusieurs besoins dans une même ligne.\n'
            + 'Ta tâche : classer CHAQUE ligne dans UNE seule catégorie (choisis la dominante si la ligne en cite plusieurs), d’après le SUJET de la formation, jamais d’après la direction, ni l’organisme (le CNFPT est un organisme, pas un sujet).\n'
            + 'Catégories (clé = libellé) :\n{{categories}}\n\n'
            + 'Exemples : « formation management », « gestion d’equipe », « encadrment » → management ; « exel », « word excel », « bureautique » → bureautique ; « concour rédacteur », « prépa concours » → concours ; « PSC1 », « sst », « habilitation électrique » → obligatoires ; « BAFA », « certiphyto » → certifiantes.\n'
            + 'Réponds UNIQUEMENT par une ligne par demande, au format numéro:clé (exemple : 1:management), avec UNE SEULE clé par ligne (celle de la liste ci-dessus), sans aucun autre texte.\n\n{{lignes}}',
    },
    {
        id: 'formations.sousthemes', group: 'Demandes de formation (analyse globale)', label: 'Sous-thèmes d’une catégorie',
        description: 'Envoyé en parallèle, une fois par catégorie : l’IA regroupe les formulations proches en sous-thèmes (ex. « management », « gestion d’équipe », « encadrement » → « Management d’équipe »).',
        vars: ['categorie', 'lignes'],
        text: 'Voici des demandes de formation d’une même catégorie (« {{categorie}} »), issues des entretiens professionnels d’une mairie. Les formulations varient (synonymes, abréviations, fautes) : REGROUPE celles qui désignent la même formation ou le même besoin sous un SOUS-THÈME clair.\n'
            + 'Règles : 2 à 8 sous-thèmes, nommés clairement et en bon français (corrige les fautes) ; chaque ligne dans UN seul sous-thème ; ne cite aucun nom de personne ; ne mélange pas des besoins différents. '
            + 'Un sous-thème désigne un SUJET CONCRET (ex. « Secourisme (PSC1 / SST) », « Habilitation électrique », « Sécurité incendie », « Management d’équipe », « Excel ») : ne le nomme JAMAIS d’après la catégorie elle-même, ni « Formations obligatoires », « Autres demandes » ou « Formation » tout court ; sépare bien les sujets distincts.\n'
            + 'Réponds UNIQUEMENT par un JSON : {"sous_themes":[{"theme":"nom","items":[numéros]}]}\n\n{{lignes}}',
    },
    {
        id: 'formations.synthese', group: 'Demandes de formation (analyse globale)', label: 'Synthèse des besoins pour la DRH',
        description: 'Rédige la synthèse des besoins globaux à partir de la répartition calculée par l’application.',
        vars: ['repartition'],
        text: 'Voici la répartition des besoins de formation d’une mairie, issue des entretiens professionnels (données agrégées et anonymes) :\n{{repartition}}\n\n'
            + 'Rédige en 5 à 8 lignes, pour la DRH, une synthèse des BESOINS GLOBAUX : les 3 priorités, les besoins transversaux (qui pourraient être mutualisés en formation intra ou via le CNFPT), les besoins propres à certaines directions. Les catégories sont déjà classées du plus au moins demandé : respecte cet ordre pour les priorités. '
            + 'N’écris AUCUN chiffre (les chiffres sont affichés à part) ; parle de « thèmes les plus demandés ». Utilise le terme « demandes de formation ». Ne cite aucun nom de personne. Français professionnel et correct, en un seul paragraphe continu : sans titre, sans numérotation, sans liste à puces, sans mot anglais.',
    },
    // ─── Lecture des comptes rendus manuscrits ───
    {
        id: 'crep.glossaire', group: 'Lecture des CREP manuscrits', label: 'Glossaire (vocabulaire de la collectivité)',
        description: 'Aide l’IA à choisir le bon mot quand l’écriture est difficile. Inséré dans les autres prompts de lecture ({{glossaire}}).',
        vars: [], text: GLOSSAIRE,
    },
    {
        id: 'crep.regles', group: 'Lecture des CREP manuscrits', label: 'Règles générales de lecture du manuscrit',
        description: 'Consignes communes à toutes les pages ({{regles}}).', vars: ['glossaire'], text: REGLES,
    },
    {
        id: 'crep.page.volet1', group: 'Lecture des CREP manuscrits', label: 'Page « Volet 1 – bilan de l’année écoulée »',
        description: 'ATTENTION : le format JSON demandé est lu par l’application ; ne changez pas les noms de champs.', vars: ['annee', 'regles'],
        text: INTRO + 'Page « Volet 1 – bilan de l’année écoulée ». Extrais :\n'
            + '{"date_convocation": "AAAA-MM-JJ", "date_entretien": "AAAA-MM-JJ", "date_notification": "AAAA-MM-JJ" (dates des trois cases en haut ; si l’année manque, utilise {{annee}} ; "" si vide),\n'
            + ' "agent_identite": "NOM et prénom de l’agent évalué, tels qu’écrits ou imprimés en haut de la page (cadre d’identité) ; \"\" si absent",\n'
            + ' "missions": "texte du cadre « Rappel des missions de l’agent »",\n'
            + ' "objectifs_ecoules": [{"objectif": "texte imprimé de la ligne", "observations": "MANUSCRIT de la colonne Observations", "niveau": "A, PA ou NA : la lettre manuscrite de la colonne Niveau de réalisation"}] (une entrée par ligne numérotée du tableau, 4 au plus ; ligne vide = champs vides),\n'
            + ' "observations_complementaires": "MANUSCRIT du cadre « Observations complémentaires »"}' + FIN,
    },
    {
        id: 'crep.page.grille', group: 'Lecture des CREP manuscrits', label: 'Page « Appréciation de la valeur professionnelle »',
        description: 'Les cases cochées sont lues par traitement d’image ; l’IA ne lit que l’appréciation générale.', vars: ['regles'],
        text: INTRO + 'Page « Appréciation de la valeur professionnelle ». Les cases cochées sont lues par ailleurs : ne t’en occupe pas. Extrais seulement :\n'
            + '{"appreciation_generale": "MANUSCRIT du grand cadre « Appréciation générale sur l’exercice des missions »"}' + FIN,
    },
    {
        id: 'crep.page.volet2', group: 'Lecture des CREP manuscrits', label: 'Page « Volet 2 – perspectives, objectifs, formations »',
        description: 'ATTENTION : ne changez pas les noms de champs JSON.', vars: ['regles'],
        text: INTRO + 'Page « Volet 2 – échanges sur les perspectives de l’année à venir ». Extrais :\n'
            + '{"objectifs_service": "texte éventuel du cadre « rappel des objectifs du service » (souvent vide)",\n'
            + ' "objectifs_futurs": [{"descriptif": "MANUSCRIT colonne Descriptif", "moyens": "MANUSCRIT colonne Moyens et échéances"}] (une entrée par ligne numérotée, 4 au plus),\n'
            + ' "formations": {"obligatoires": "MANUSCRIT « Formations obligatoires »", "metiers": "MANUSCRIT « Autres formations métiers »", "parcours": "MANUSCRIT « Formations liées à l’accompagnement des parcours… »"}}' + FIN,
    },
    {
        id: 'crep.page.perspectives', group: 'Lecture des CREP manuscrits', label: 'Page « Perspectives d’évolution… »',
        description: 'ATTENTION : ne changez pas les noms de champs JSON.', vars: ['regles'],
        text: INTRO + 'Page « Perspectives d’évolution… », avec des cadres à remplir à la main. Extrais, cadre par cadre :\n'
            + '{"evolution": "MANUSCRIT du cadre « 1. Évolution des missions et/ou de carrière » (un mot comme « retraite », « mobilité », « néant » est possible)",\n'
            + ' "mobilite": "MANUSCRIT du cadre « 2. Mobilité »",\n'
            + ' "obs_agent_conditions": "MANUSCRIT du cadre « Observations de l’agent sur les conditions de travail et le fonctionnement du service »",\n'
            + ' "obs_agent_entretien": "MANUSCRIT du cadre « Observations de l’agent sur l’entretien »",\n'
            + ' "visa_autorite": "MANUSCRIT du cadre « Observations et visa de l’autorité territoriale » (souvent vide ; les signatures ne sont pas du texte)"}' + FIN,
    },
    {
        id: 'crep.agent', group: 'Lecture des CREP manuscrits', label: 'Mode « commentaires de l’agent » (document d’origine numérique)',
        description: 'Quand le compte rendu a été saisi dans l’outil puis imprimé : seuls les 2 commentaires manuscrits de l’agent sont lus.', vars: ['regles'],
        text: 'Cette image est la dernière page d’un compte rendu d’entretien professionnel imprimé. Seuls deux cadres ont été remplis À LA MAIN par l’agent. Extrais :\n'
            + '{"obs_agent_conditions": "MANUSCRIT du cadre « Observations de l’agent sur les conditions de travail et le fonctionnement du service »",\n'
            + ' "obs_agent_entretien": "MANUSCRIT du cadre « Observations de l’agent sur l’entretien »"}\n'
            + 'Réponds UNIQUEMENT par un objet JSON valide, sans commentaire. {{regles}}',
    },
    {
        id: 'crep.coherence', group: 'Lecture des CREP manuscrits', label: 'Contrôle de cohérence de la lecture',
        description: 'Seconde passe : l’IA relit l’ensemble avec le contexte et propose de corriger les mots manifestement mal lus (garde-fou : graphie proche uniquement).', vars: ['glossaire', 'contexte', 'transcription'],
        text: 'Tu relis la transcription automatique d’un compte rendu d’entretien professionnel écrit à la main (mairie). L’écriture est difficile : certains mots ont été mal lus. '
            + 'Ta tâche : repérer les mots ou groupes de mots MANIFESTEMENT mal lus et proposer la correction la plus vraisemblable, en t’appuyant sur le contexte (poste, service, autres rubriques : par exemple si un objectif parle de « délai global de paiement », « DGP à 28 j » est cohérent, pas « VGP ») '
            + 'et sur le vocabulaire courant. {{glossaire}}\n'
            + 'Contexte de l’agent : {{contexte}}\n'
            + 'Transcription (JSON) : {{transcription}}\n\n'
            + 'Réponds UNIQUEMENT par un JSON {"corrections":[{"avant":"texte exact tel qu’il figure dans la transcription","apres":"texte corrigé","raison":"très court"}]}. '
            + 'Règles : « avant » doit être une partie EXACTE d’une valeur ci-dessus ; « apres » remplace un mot mal lu par un mot de GRAPHIE PROCHE (jamais un synonyme ni une reformulation, jamais de mot ajouté ou retiré) ; ne corrige pas le style, les fautes d’orthographe de l’auteur ni le sens ; ne corrige pas un mot qui peut être correct ; '
            + 'au plus 12 corrections ; aucune correction = {"corrections":[]}.',
    },
    // ─── Aide à la rédaction ───
    {
        id: 'redaction.systeme', group: 'Aide à la rédaction du compte rendu', label: 'Rédaction d’une rubrique (consigne système)',
        description: 'Utilisé par le bouton de rédaction assistée de l’évaluateur.', vars: [],
        text: [
            'Tu es rédacteur RH pour une mairie. Tu rédiges le compte rendu officiel d’un entretien professionnel annuel à partir des quelques mots donnés par l’évaluateur (N+1).',
            'Écris en français correct (corrige les fautes de frappe des notes), au style professionnel, clair, factuel et bienveillant, à la troisième personne.',
            'N’ajoute aucun fait, chiffre ou date absent des notes ou du contexte. Respecte le sens et la tonalité des notes (positif, réservé, critique…).',
            'LES NOTES DE L’ÉVALUATEUR PRIMENT SUR TOUT : le texte doit en exprimer clairement le fond et la tonalité, y compris quand elle est négative (formulée alors avec tact, de façon professionnelle et non blessante). Le contexte ne sert qu’à étayer ces notes : ne le substitue jamais à elles, ne pars pas dans une autre direction et n’invente pas de pistes (formations, etc.) que l’évaluateur n’a pas évoquées.',
            'Réponds UNIQUEMENT par le texte final de la rubrique (2 à 5 phrases, sans titre, sans introduction, sans explication, sans mise en forme), placé entre «« et »».',
        ].join(' '),
    },
    {
        id: 'redaction.relecture', group: 'Aide à la rédaction du compte rendu', label: 'Relecture de cohérence (consigne système)',
        description: 'Utilisé par le bouton « relecture IA » avant validation.', vars: [],
        text: [
            'Tu es relecteur RH pour une mairie. Tu vérifies la cohérence interne d’un compte rendu d’entretien professionnel.',
            'Repère UNIQUEMENT les incohérences réelles entre les rubriques : appréciation générale qui contredit les niveaux de la grille ou des objectifs, observations qui contredisent le niveau d’un objectif, objectifs futurs sans rapport avec le bilan, etc.',
            'N’invente rien, ne reformule pas le compte rendu, ne donne pas d’avis sur la qualité du texte. Si tout est cohérent, réponds « Aucune incohérence détectée. »',
            'Réponds par une liste à puces (une incohérence par ligne, 5 au maximum, en une phrase claire), placée entre «« et »».',
        ].join(' '),
    },
];
const BY_ID = new Map(DEFS.map(d => [d.id, d]));
const KEY = (id) => `prompt:${id}`;

let cache = { at: 0, over: new Map() };

/** Recharge les textes modifiés (au plus toutes les 8 s sauf force). */
async function refresh(force) {
    if (!force && Date.now() - cache.at < 8000) return;
    const over = new Map();
    try {
        const rows = await require('../../shared/database').pgDb.all("SELECT key, value FROM hub_entretiens.settings WHERE key LIKE 'prompt:%'");
        for (const r of rows) if (r.value && r.value.trim()) over.set(r.key.slice(7), r.value);
    } catch (e) { /* aucune surcharge */ }
    cache = { at: Date.now(), over };
}

const defaultText = (id) => BY_ID.get(id)?.text || '';

/** Texte courant (modifié ou par défaut). Lecture synchrone depuis le cache. */
function get(id) { return cache.over.get(id) || defaultText(id); }

/** Texte courant avec les {{variables}} remplacées. */
function render(id, vars = {}) {
    // Les variables elles-mêmes peuvent contenir {{...}} (ex. regles → glossaire) : deux passes.
    const sub = (t) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    return sub(sub(get(id)));
}

function list() {
    return [
        ...DEFS.map(d => ({ id: d.id, group: d.group, label: d.label, description: d.description, vars: d.vars, text: get(d.id), default: d.text, modified: cache.over.has(d.id) })),
    ];
}

async function save(id, text) {
    if (!BY_ID.has(id)) throw Object.assign(new Error('Prompt inconnu.'), { status: 404 });
    const t = String(text || '');
    if (!t.trim() || t === BY_ID.get(id).text) await svc.setSetting(KEY(id), '');
    else await svc.setSetting(KEY(id), t);
    await refresh(true);
}

module.exports = { refresh, get, render, list, save, CATEGORIES_DEFAUT, DEFS };
