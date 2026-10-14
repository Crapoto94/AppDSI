// Traduction française de l'interface bpmn.io (palette, pavé contextuel, menus).
// Base : paquet communautaire bpmn-js-i18n, complété des libellés plus récents qu'il ne couvre pas,
// et d'infobulles détaillées sur la palette (rôle de l'outil + types disponibles).
// @ts-expect-error — paquet JS sans déclaration de types
import fr from 'bpmn-js-i18n/translations/fr';

const complements: Record<string, string> = {
  'Align elements': 'Aligner les éléments',
  'Append conditional intermediate catch event': 'Ajouter un événement intermédiaire de réception conditionnel',
  'Append message intermediate catch event': 'Ajouter un événement intermédiaire de réception de message',
  'Append receive task': 'Ajouter une tâche de réception',
  'Append signal intermediate catch event': 'Ajouter un événement intermédiaire de réception de signal',
  'Append timer intermediate catch event': 'Ajouter un événement intermédiaire de réception temporel',
  'Change element': "Changer l'élément",
  'Collection': 'Collection',
  'Create data object reference': 'Objet de données : document ou information produit ou utilisé par une tâche.',
  'Create data store reference': "Base de données : stockage persistant. Pour un logiciel du Magasin d'applications, utilisez plutôt l'outil « Application ».",
  'Distribute elements horizontally': 'Répartir les éléments horizontalement',
  'Distribute elements vertically': 'Répartir les éléments verticalement',
  'Open {element}': 'Ouvrir {element}',
  'Participant multiplicity': 'Multiplicité du participant',
  'Toggle non-interrupting': 'Basculer en non interruptif',

  // Infobulles de la palette : rôle de l'outil et liste des types disponibles (le type d'un
  // élément se change ensuite via le pavé contextuel › clé à molette « Changer l'élément »).
  'Activate hand tool': 'Main : déplace la vue en cliquant-glissant sur le fond du diagramme.',
  'Activate lasso tool': 'Sélection multiple : trace un rectangle pour sélectionner plusieurs éléments à déplacer, copier ou supprimer.',
  'Activate create/remove space tool': 'Espacement : glisse pour créer ou supprimer de la place entre des éléments (le reste du diagramme est décalé).',
  'Activate global connect tool': "Connexion : clique l'élément source puis l'élément cible pour les relier par un flux de séquence (ou une association pour un logiciel).",
  'Create start event': "Événement de début : point d'entrée du processus.\nVariantes : simple, message, minuteur, condition, signal.",
  'Create intermediate/boundary event': "Événement intermédiaire : attente ou réaction en cours de processus.\nTypes : message, minuteur, signal, condition, lien, escalade, erreur. Posé sur le bord d'une tâche, il la surveille (délai, erreur…).",
  'Create end event': 'Événement de fin : termine un chemin du processus.\nTypes : simple, message, erreur, escalade, signal, annulation, terminaison.',
  'Create gateway': 'Passerelle : décision ou parallélisme.\nTypes : exclusive (un seul chemin), parallèle (tous les chemins), inclusive (un ou plusieurs), basée sur événements, complexe.',
  'Create task': 'Tâche : une action du processus ; sa couleur indique le type.\nTypes : humaine (bleu), automatisée / service (turquoise), manuelle / physique (orange), envoi et réception de message (rose), script et règle métier (violet).\nChanger le type : clé à molette du pavé contextuel.',
  'Create expanded sub-process': "Sous-processus : regroupe plusieurs étapes dans un cadre.\nVariantes : développé, réduit, appel d'un autre processus, transaction, ad hoc.",
  'Create group': "Groupe : cadre visuel autour d'éléments liés (sans effet sur le déroulement).",
  'Create pool/participant': 'Pool / participant : conteneur représentant un acteur ou un système ; il peut être découpé en couloirs pour répartir les étapes.',

  // Pavé contextuel (survol d'un élément)
  'Append end event': 'Ajouter à la suite un événement de fin',
  'Append gateway': 'Ajouter à la suite une passerelle (exclusive, parallèle, inclusive…)',
  'Append task': 'Ajouter à la suite une tâche (humaine, automatisée, manuelle, envoi, réception, script, règle)',
  'Append intermediate/boundary event': 'Ajouter à la suite un événement intermédiaire (message, minuteur, signal…)',
};

const dictionary: Record<string, string> = { ...(fr as Record<string, string>), ...complements };

function translate(template: string, replacements?: Record<string, string>): string {
  const values = replacements || {};
  const text = dictionary[template.trim()] ?? dictionary[template] ?? template;
  return text.replace(/{([^}]+)}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

export default { translate: ['value', translate] };
