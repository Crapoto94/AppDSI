const { pool } = require('../shared/database');

const VERSION = '1.5.0';

const changes = [
  "<p><strong>Version 1.5</strong> — signature avec clé matérielle RGS** dans le Parapheur, nouvelle boîte à idées, modélisation BPMN, stagiaires, un Budget en direct sur Sedit (demandes de commande, DGP, virements de crédits), un chat en direct enrichi, des statistiques tickets plus fines et de nombreuses améliorations.</p>",

  "### Parapheur — signature avec clé matérielle RGS**",
  "• Signature de documents avec une clé cryptographique RGS** (carte à puce / clé USB, ex. Certinomis + SafeNet) : signature PAdES en deux temps, la clé privée ne quitte jamais la clé",
  "• Agent de signature local pour Windows : installateur traditionnel (Inno Setup, environ 2 Mo, sans droits administrateur), démarrage automatique à l'ouverture de session, icône près de l'horloge avec fenêtre de paramètres (adresses autorisées, certificats détectés, journal)",
  "• Agent réécrit en programme natif .NET (42 Ko au lieu de 90 Mo, signature plus rapide) ; confirmation à l'écran avant chaque signature, puis code PIN demandé par le pilote de la clé",
  "• Test de la clé depuis /parapheur et /admin/parapheur-certificats : vérification du certificat (validité, RSA, non-répudiation), de la signature et du PAdES, durée de chaque étape ; installation guidée de l'agent (téléchargement, détection automatique, mise à jour proposée, bouton « Démarrer l'agent »)",
  "• Après une signature, retour à l'accueil du Parapheur ; plus de lien de signature en localhost quand l'URL publique n'est pas configurée (alerte)",

  "### Boîte à idées (nouveau)",
  "• Icône ampoule dans l'en-tête, ouverte à tous les agents : idées classées en catégories colorées (Cadre de vie, Efficacité, Outils & numérique, Bien-être, Ambiance, Environnement, Formation, Sécurité, Autre)",
  "• Dépôt avec ou sans nom : en mode anonyme, aucune information sur l'auteur n'est enregistrée",
  "• Soutien par vote (un par agent), filtres et recherche, « Mes idées » ; les administrateurs changent le statut (nouvelle, en étude, retenue, réalisée, non retenue) et répondent publiquement",

  "### Backlog",
  "• /admin/backlog : choix des agents qui reçoivent un e-mail à chaque nouvelle demande DSI Hub et à chaque nouvelle idée MagApp",

  "### Modélisation BPMN (nouveau)",
  "• Nouvelle tuile Modélisation BPMN (bpmn.io) avec bibliothèque de modèles sur le serveur et assistant IA",
  "• Modèles prêts à l'emploi : six processus d'ODP Manager (tournage, cycle de vie, AOT, facturation Sedit, report, tiers), neuf processus de VibeDélib, modèle « Demande de tournage » complété",
  "• Import de fichier BPMN : mise en page automatique, titre repris du fichier, glisser-déposer, contrôles de format et de taille",

  "### RH",
  "• Onglet Stagiaires : liste, calendrier sur 15 mois (pastille du nombre de stagiaires), création/modification/suppression, import Excel, maître de stage choisi parmi les agents DSI, dépôt du CV et du rapport de stage",

  "### Budget",
  "• Demandes de commande : séparation en Demandes validées / Commandes envoyées / Archives (facture Sedit mandatée), bouton « Déjà envoyé », documents ajoutés après envoi (bons de livraison…), commentaires avec réponses et @mentions, état de la commande Sedit et bon de commande cliquable, envoi des commandes aux tiers, contacts des tiers",
  "• Factures et commandes lues en direct dans Sedit ; état réel des factures (refusée, mandatée, service fait, reçue) pour « Factures à traiter » ; nom du tiers dans l'infobulle",
  "• Courbe du délai global de paiement (DGP) par semaine avec bascule DGP Global (réception → paiement, seuil 30 j) / DGP Ville (réception → mandatement, seuil 20 j)",
  "• Demande de virement de crédits : PDF, historique, envoi au Parapheur et à budget@, lignes Sedit en direct, minorer/majorer côte à côte, enveloppes",
  "• Synthèse budgétaire Sedit en direct (DSI), couleurs par direction ; page nettement plus rapide (cache serveur rafraîchi en arrière-plan)",
  "• Correction : PDF scannés affichés en pages blanches en production",

  "### Télécom",
  "• Factures et engagements lus directement dans Sedit (état SF, rapprochement, mandat, rejet), synthèse des engagements en direct, engagements fluides / non fluides",
  "• Analyse par ligne des factures SFR, histogramme mensuel des dépenses, pastilles de factures par opérateur, tableau unique des comptes par opérateur, compte d'une facture modifiable",

  "### Tickets",
  "• Statistiques : évolution des modes de soumission en graphique empilable (12 mois par défaut, 6 à 36 mois, empilé / 100 % / courbes) et analyse détaillée des chats en direct (qui a répondu, délais de réponse, messages, avis, performance par technicien)",
  "• Source « Téléphone » : tickets saisis dans le Hub par un demandeur non agent DSI reclassés en téléphone, et case « Ticket téléphone » à la création",
  "• Tickets « Arrivée d'agent » : affectés d'office au groupe Support et Déploiement, titre « arrivant (N+1 : …) »",
  "• Auto-fermeture des tickets résolus avec rattrapage, tuile « Clos », KPI quotidiens corrigés, âge actif / inactif, navigation au clavier, recherche de logiciel sans accents, filtre demandeur par nom, notes de tâche",
  "• Un ticket est créé pour chaque demande de prêt ; checklist des comptes à créer dans le ticket d'arrivée",

  "### Chat en direct",
  "• Plusieurs messages possibles avant la prise en charge, notifications du navigateur (avec son et pastille) à la réponse d'un technicien, la croix réduit le chat sans l'abandonner",
  "• Coller une capture d'écran (Ctrl+V) et capture d'une zone de l'écran avec sélection ; images affichées dans la conversation (Hub et MagApp)",
  "• Calendriers du support complets (jours fériés, plages, duplication), chat fermé hors horaires, message d'urgence avec alerte SMS à l'astreinte, bulle du MagApp respectant les horaires",

  "### MagApp",
  "• Fonction BETA « Recherche d'agent » (prénom, nom, poste, service avec code, direction, matricule, mail et téléphone lu dans l'AD)",
  "• Accès par fonctionnalité : quand une fonctionnalité BETA n'est pas publiée pour tous, quelques agents nommés dans chaque tuile de /admin/magapp y ont accès ; badge BETA masqué une fois publiée",

  "### Parc",
  "• GLPI en mode Live par défaut, avec cache conservé et rechargé en arrière-plan (plus de longue attente)",
  "• Étiquettes : logo et textes lus sur le serveur, impression d'une série (ex. PO20205 → PO25260) par lots",

  "### Tâches et projets",
  "• Classes de tâches personnelles et d'équipe, affectation à une équipe, filtre « affectées par d'autres », recherche plein texte, panneau de statistiques, classe système « Logiciel »",
  "• Journal de projet étendu aux tâches terminées et aux annotations de revue ; correction des projets du bureau des projets absents du portefeuille PMO",

  "### Autres",
  "• Doctrines : tuile avec commentaires par section et revue administrateur ; vue des autorisations par tuile (ajout/retrait d'agents) ; aperçu unifié des e-mails .msg/.eml ; collecteur « Tâches » (mail transféré → tâche) ; badge de présence RH Studio dans Param Ville ; consommables modifiables à toutes les étapes ; prêts avec retour le jour même",
  "• Stagiaires : correction de l'accès refusé pour les administrateurs",

  "### Corrections",
  "• Liens de notification vers l'URL de production (plus localhost), repli sur la GED Alfresco pour les fichiers migrés, seuls les utilisateurs de /admin/users peuvent se connecter",
  "• Ajout d'observateur en erreur (casse de colonne), marqueurs de conflit restés dans le module tickets, décalage de 2 h de l'activité des tâches, rappel de 8 h en erreur sur une échéance en texte libre",
];

(async () => {
  try {
    const releaseDate = new Date().toLocaleDateString('fr-FR');
    const existing = await pool.query('SELECT id FROM hub.changelog_versions WHERE version = $1 ORDER BY id DESC LIMIT 1', [VERSION]);
    let res;
    if (existing.rows.length > 0) {
      res = await pool.query(
        'UPDATE hub.changelog_versions SET release_date = $1, changes = $2 WHERE id = $3 RETURNING id, version, release_date',
        [releaseDate, JSON.stringify(changes), existing.rows[0].id]
      );
      console.log('Version mise à jour:', res.rows[0]);
    } else {
      res = await pool.query(
        'INSERT INTO hub.changelog_versions (version, release_date, changes) VALUES ($1, $2, $3) RETURNING id, version, release_date',
        [VERSION, releaseDate, JSON.stringify(changes)]
      );
      console.log('Version créée:', res.rows[0]);
    }
  } catch (e) {
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
