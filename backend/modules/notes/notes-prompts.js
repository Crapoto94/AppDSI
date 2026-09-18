/**
 * Prompts et réglages par défaut du module « Mes Notes ».
 *
 * Les prompts sont éditables en admin (/admin/notes) : la valeur enregistrée
 * dans SQLite `app_settings` prévaut, sinon on retombe sur ces valeurs par
 * défaut. Le rendu se fait via renderTemplate() avec des variables {{...}}.
 */

// Réglages éditables (clés app_settings) — source de vérité pour l'admin.
const NOTES_SETTING_KEYS = [
    'notes_analysis_prompt',
    'notes_task_prompt',
    'notes_classify_prompt',
    'notes_reorganize_prompt',
    'notes_wordcloud_stopwords',
    'notes_apm_model',
    'notes_auto_analyze',
    'notes_auto_classify',
    'notes_analysis_max_chars',
];

// Prompt principal : correction + reformulation + résumé + tags + classement.
const DEFAULT_ANALYSIS_PROMPT = `Tu es un assistant de prise de notes professionnel pour une direction des systèmes d'information (DSI) d'une collectivité.

Analyse la note ci-dessous et réponds UNIQUEMENT par un objet JSON valide, sans aucun texte avant ni après, sans balise de code, avec exactement ces clés :

{
  "titre": "titre court et explicite, 80 caractères maximum",
  "resume": "résumé en 1 à 3 phrases",
  "corrige": "le texte d'origine corrigé des fautes d'orthographe, de grammaire et de ponctuation, SANS reformuler et SANS retirer d'information",
  "reformule": "une version reformulée, claire, professionnelle et structurée (paragraphes, listes, titres si pertinent)",
  "tags": ["mots-clés classés du PLUS important au MOINS important (maximum 8)"],
  "carnet": "nom du carnet le plus pertinent",
  "section": "nom de la section la plus pertinente à l'intérieur de ce carnet",
  "mentions": ["noms des personnes explicitement citées dans la note"],
  "taches": [
    { "description": "action concrète à réaliser", "responsable": "personne à qui la tâche incombe (vide si non précisé)", "echeance": "échéance si mentionnée (date AAAA-MM-JJ, sinon texte tel quel, sinon vide)" }
  ]
}

Règles impératives :
- Conserve STRICTEMENT le sens et TOUTES les informations factuelles : dates, montants, numéros, noms, décisions, actions, échéances. Ne rien inventer.
- Les champs "corrige" et "reformule" peuvent contenir du HTML simple (<p>, <ul>, <ol>, <li>, <strong>, <em>) mais AUCUNE balise de style, de script ni d'attribut.
- Si la note est déjà correcte, "corrige" doit rester très proche de l'original.
- Réutilise en priorité les carnets et sections existants listés ci-dessous ; ne crée un nouveau nom que si aucun ne convient.
- "mentions" ne contient que des personnes (pas d'organisations).
- "tags" : au maximum 8, triés par importance décroissante (les 1-2 premiers doivent être les thèmes les plus significatifs). Chaque tag = 1 à 3 mots, en minuscules, sans accent, sans dièse. INTERDIT : tags génériques ou inutiles (note, info, divers, général, important, urgent, à faire, tâche, réunion, sujet, divers…), et tags redondants entre eux. Un bon tag permet de retrouver la note par la recherche ; ne mets que des termes réellement distinctifs du contenu (projet, technologie, fournisseur, lieu, personne-clé, thématique métier). S'il n'y a rien de distinctif, renvoie moins de tags (2 ou 3) plutôt que de remplir.
- "taches" : uniquement les actions RÉELLEMENT exprimées ou clairement implicites dans la note (décisions à appliquer, relances, vérifications, échéances). Ne pas inventer d'action ; laisser la liste vide si la note n'appelle aucune action. Regrouper une même action en une seule entrée. IMPORTANT : toute ligne introduite par un marqueur d'action (« Action à mener », « À faire », « Todo », « Prochaine étape », « À prévoir », « À vérifier », « Rappel », puce d'une liste d'actions…) DOIT produire exactement une tâche, avec le texte qui suit le marqueur comme description — n'en omets aucune.

Arborescence existante (carnet > sections) :
{{NOTEBOOKS}}

Métadonnées de la note — titre actuel : "{{TITLE}}", date : {{DATE}}.

Note à analyser :
"""
{{CONTENT}}
"""`;

// Prompt dédié à l'extraction de tâches (relance manuelle, sans réanalyse complète).
const DEFAULT_TASK_PROMPT = `Tu es un assistant qui transforme des notes en tâches actionnables pour une direction des systèmes d'information (DSI).

Analyse la note ci-dessous et identifie UNIQUEMENT les actions concrètes à réaliser (à faire, relancer, vérifier, décider, commander, contacter, échéance à respecter).

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{
  "taches": [
    {
      "description": "action concrète, à l'infinitif, autoportante (sans « il faut »)",
      "responsable": "prénom et nom de la personne à qui incombe la tâche (chaîne vide si non précisé)",
      "echeance": "date au format AAAA-MM-JJ si explicite, sinon le texte tel quel (« vendredi prochain », « fin du mois »), sinon chaîne vide"
    }
  ]
}

Règles :
- Ne crée AUCUNE tâche qui ne soit pas réellement exprimée ou clairement implicite dans la note. Une note purement informative → { "taches": [] }.
- IMPORTANT : chaque ligne introduite par un marqueur d'action (« Action à mener », « Actions : », « À faire », « Todo », « Prochaine étape », « À prévoir », « À vérifier », « Rappel », ou une puce d'une liste d'actions) est OBLIGATOIREMENT une tâche : prends le texte qui suit le marqueur comme description. N'en omets aucune.
- Regroupe une même action en une seule tâche ; n'invente ni responsable ni échéance.
- 0 à 15 tâches maximum.

Note à analyser :
"""
{{CONTENT}}
"""`;

// Prompt de classement d'un lot de notes : propose une arborescence cohérente.
const DEFAULT_CLASSIFY_PROMPT = `Tu es un assistant d'organisation documentaire. On te fournit une liste de notes avec leur identifiant, titre, résumé et tags.
Propose une arborescence de rangement cohérente à deux niveaux (carnets > sections) et rattache chaque note à une section.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, au format :
{
  "carnets": [
    {
      "nom": "nom du carnet",
      "description": "à quoi sert ce carnet",
      "sections": [
        { "nom": "nom de la section", "notes": [12, 15, 42] }
      ]
    }
  ]
}

Règles :
- Chaque identifiant de note doit apparaître une seule fois au total.
- Regroupe par thème métier, pas par date.
- 2 à 8 carnets maximum, 1 à 8 sections par carnet.
- Les noms doivent être courts, explicites et en français.

Notes à classer :
{{NOTES}}`;

// Prompt de réorganisation globale (peut s'appuyer sur l'arborescence actuelle).
const DEFAULT_REORGANIZE_PROMPT = `Tu es un architecte de l'information. Voici l'arborescence actuelle des carnets et sections d'un utilisateur, ainsi que ses notes.
Propose une réorganisation plus cohérente de l'arborescence (fusion, renommage, création, déplacement), en conservant les identifiants de notes.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{
  "carnets": [
    { "nom": "carnet", "description": "…", "sections": [ { "nom": "section", "notes": [1, 2] } ] }
  ]
}

Règles :
- Ne perds aucune note : chaque identifiant présent en entrée doit être classé exactement une fois.
- Conserve les noms existants lorsqu'ils sont déjà pertinents.
- Maximum 10 carnets, 12 sections par carnet.

Arborescence actuelle :
{{TREE}}

Notes :
{{NOTES}}`;

// Mots vides pour le nuage de mots (un par ligne ou séparés par des virgules).
const DEFAULT_STOPWORDS = `le,la,les,un,une,des,du,de,d,au,aux,et,ou,mais,donc,or,ni,car,que,qui,quoi,dont,ou,à,a,as,ont,est,sont,être,été,etre,suis,es,êtes,sera,seront,avoir,ai,avons,avez,avec,sans,sous,sur,dans,par,pour,vers,chez,entre,en,y,ce,cet,cette,ces,mon,ma,mes,ton,ta,tes,son,sa,ses,notre,nos,votre,vos,leur,leurs,je,tu,il,elle,on,nous,vous,ils,elles,me,te,se,lui,nous,vous,leur,mien,tien,rien,tout,tous,toute,toutes,plus,moins,très,tres,trop,peu,bien,aussi,encore,déjà,deja,alors,ainsi,comme,comment,quand,où,sans,si,ne,pas,non,oui,être,faire,fait,faites,fait,va,vont,peut,peuvent,doit,doivent,faut,il,elle,cela,ceci,celui,celle,ceux,celles,quel,quelle,quels,quelles,mes,tes,ses,notre,autre,autres,même,meme,chaque,quelque,quelques,plusieurs,nouveau,nouvelle,aujourd,hui,hier,demain,semaine,mois,année,annee,jour,journée,journee,matin,après,apres,midi,soir,note,notes,réunion,reunion,point,points,info,informatique`;

const SETTING_DEFAULTS = {
    notes_analysis_prompt: DEFAULT_ANALYSIS_PROMPT,
    notes_task_prompt: DEFAULT_TASK_PROMPT,
    notes_classify_prompt: DEFAULT_CLASSIFY_PROMPT,
    notes_reorganize_prompt: DEFAULT_REORGANIZE_PROMPT,
    notes_wordcloud_stopwords: DEFAULT_STOPWORDS,
    notes_apm_model: '',
    notes_auto_analyze: 'true',
    notes_auto_classify: 'true',
    notes_analysis_max_chars: '12000',
};

/** Remplace les variables {{CLÉ}} d'un prompt (replacer fonction → pas d'interprétation des $). */
function renderTemplate(template, vars) {
    if (!template) return '';
    let out = String(template);
    for (const [key, value] of Object.entries(vars || {})) {
        out = out.replaceAll(`{{${key}}}`, () => (value === null || value === undefined ? '' : String(value)));
    }
    return out;
}

module.exports = {
    NOTES_SETTING_KEYS,
    SETTING_DEFAULTS,
    DEFAULT_ANALYSIS_PROMPT,
    DEFAULT_TASK_PROMPT,
    DEFAULT_CLASSIFY_PROMPT,
    DEFAULT_REORGANIZE_PROMPT,
    DEFAULT_STOPWORDS,
    renderTemplate,
};
