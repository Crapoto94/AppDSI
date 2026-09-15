const { pool } = require('../shared/database');

const VERSION = '1.1.0';

const changes = [
  "<p><strong>Version 1.1.0</strong> — arrivée du <strong>Transcript Manager</strong> (import automatique des comptes rendus de réunion Teams, résumé IA, plan d'action et amendement collaboratif), déploiement de l'<strong>analyse IA des contrats</strong> (OCR des PDF scannés, structuration et score), création de <strong>tickets DSIHUB</strong> depuis les rencontres budgétaires, et enrichissement du <strong>tableau de bord DSI</strong> (cartes des connexions Analyse-mail).</p>",

  "### Transcript Manager (nouveau module)",
  "• Import automatique des transcripts de réunions Teams via Microsoft Graph (repli VTT, réessai), fenêtre de 30 à 730 jours, onglets de statut, participants, filtre par intervenant et déduplication des récurrences",
  "• Génération du compte rendu par IA au choix : API Ville (APM, plusieurs modèles) ou IA locale AppDSI, avec modèle et niveau de détail (sommaire / normal / détaillé) configurables",
  "• Affichage en direct du texte généré et compteur de tokens, phases et durée dans la modale de génération, délai d'appel élargi à 25 min",
  "• Régénération repartant de zéro (confirmation, purge des amendements et tâches) et mention « ANNULE ET REMPLACE » dans le mail suivant",
  "• Plan d'action : rapprochement automatique des tâches avec les agents (Active Directory), modale de validation, affectation personne ou service comme le module Tâches, et ajout de tâches manuelles",
  "• Amendement collaboratif : éditeur WYSIWYG, confirmation avant diffusion, historique coloré par auteur, verrouillage de la réécriture après le premier envoi",
  "• Diffusion par mail aux participants internes/externes via l'API Ville (participants, pièces jointes, plan d'actions, métadonnées) avec journal des envois et mail de mise à jour en mode révision",
  "• Accès agent via le Magasin d'applications (rôle dédié, en-tête magapp), connexion AD restreinte au module et lien de partage en lecture seule pour tout agent de la ville",
  "• Génération et pièces jointes en asynchrone (fin des 504), reprise automatique après coupure réseau et messages d'erreur diagnostiques",
  "• Réglages administrateur : source IA et modèle par défaut par fonctionnalité, restriction aux modèles locaux (Llama) et encart RGPD paramétrable",
  "• Correctifs mail/Outlook : espaces insécables de l'éditeur, CSS word-wrap qui figeait les espaces, tableau englobant redondant, bouton VML et retour à la ligne des listes",
  "• Correctifs de données : décalage horaire des colonnes TIMESTAMP, historique et fusion des amendements, fuseau Europe/Paris sur toutes les dates",

  "### Contrats — Analyse IA",
  "• Analyse IA d'un document de contrat et analyse « à la volée » d'un fichier PDF non rattaché à un contrat (rien n'est conservé côté serveur) : OCR automatique si document scanné, même prompt et même modèle",
  "• Prompt par défaut restructuré en 3 parties : identification, résumé, et avis (points de vigilance, recommandations, notes)",
  "• Nouvelle table hub_contrats.contrat_analyses_ia (une ligne par contrat, remplacée à chaque analyse) : extraction et structuration des champs (fournisseur, dates, montant, GTI/GTR, indice de révision, résumé, points de vigilance, score)",
  "• Seconde passe IA de structuration pour les analyses répondant en Markdown libre (le cas réel en production) : 4 nouvelles colonnes (formule de révision, pénalités, clause de résiliation, RGPD) plus json_data conservant l'intégralité des clés, y compris imprévues",
  "• Nouvelle vue globale /contrats/analyses-ia : tableau triable et filtrable (recherche libre, direction, plage de score), modale de détail en Markdown, panneau de colonnes extensible à toute clé détectée",
  "• Colonne « Score IA » (badge coloré cliquable) dans la liste des contrats ; score extrait même d'une réponse Markdown ou d'un format non numérique, avec rejet des faux positifs (placeholder non rempli)",
  "• Badge d'analyse disponible dans la liste, ouvrant l'analyse sans la relancer",
  "• Analyse IA automatique en arrière-plan à l'ajout d'un document PDF (sautée si le document est déjà une analyse, s'il n'est pas un PDF, ou si le contrat possède déjà une analyse)",
  "• Enregistrement du Markdown de l'analyse comme document du contrat (stockage unifié + hub_docs), avec confirmation avant remplacement d'une analyse existante",
  "• Progression IA en temps réel (tokens reçus) et affichage progressif du résultat au fil de l'eau dans la modale de résultat",
  "• Choix du modèle IA partout (bouton + sélecteur fusionnés), colonnes SVC/Logiciel figées dans la liste (volet Excel), rendu Markdown des réponses non structurées et des documents .md",
  "• Correctifs : analyse de contrats utilisant par défaut l'IA locale au lieu de l'API Ville, troncature des réponses locales (plafond de tokens), placeholders multiples non remplacés, corruption de prompt via les séquences $ de String.replace()",
  "• Script de traitement par lot avec option --ids pour ne relancer que des contrats ciblés sans rappeler l'IA pour le reste",

  "### Contrats — OCR et documents",
  "• Nouveau module partagé shared/ocr.js : détection des PDF raster (pdf-parse) et OCR page par page (pdfjs-dist + @napi-rs/canvas pour le rendu, tesseract.js pour la reconnaissance)",
  "• Qualité de reconnaissance améliorée : échelle de rendu 2.0 → 3.0 (~216 DPI) et DPI transmis explicitement à Tesseract ; les documents déjà océrisés doivent être relancés",
  "• Bouton « Afficher OCR » pour vérifier manuellement le texte reconnu",
  "• Vue de documents : noms de fichiers débarrassés du préfixe technique de stockage, prévisualisation à ~90 % de la fenêtre, rendu Markdown des fichiers .md",
  "• Archiver/Désarchiver et Supprimer un document directement depuis la vue de documents, plus commentaire libre par document",
  "• OCR et analyse IA passés en asynchrone (jobId + polling) pour ne plus échouer derrière un reverse-proxy",
  "• Rapprochement du dossier partagé LOGICIELS vers DSIHUB : 11 contrats manquants créés avec leur document source rattaché en GED, et synthèse du rapprochement envoyée via l'API Ville",

  "### Rencontres budgétaires",
  "• La création de ticket depuis une rencontre crée désormais un ticket DSIHUB natif (au lieu de GLPI), avec lien direct vers /tickets/{id} et vérification d'existence sur hub_tickets",
  "• Édition et suppression des demandes directement depuis le détail d'une réunion",
  "• Badge du ticket lié cliquable dans la vue par direction/service du Magasin d'applications (modale de détail et commentaires publics)",
  "• Correctif : édition d'une demande rejetée à tort pour les rôles non administrateur/finances, qui créait un ticket sans le rattacher à la demande",

  "### Tickets",
  "• Nouvelle permission ticket:change_type dans la matrice des rôles (technicien et plus par défaut), appliquée à la route et au badge de type",
  "• Édition d'un commentaire via l'éditeur riche plutôt qu'un textarea brut affichant le HTML en clair",
  "• Retrait du bouton de récupération GLPI du tableau de bord",
  "• Reformulation de commentaire : bascule indépendante API Ville / IA locale avec son propre modèle par défaut",

  "### Tableau de bord DSI",
  "• Nouveau module Analyse-mail : relais serveur vers l'API externe /api/v1/kpis, clé API lue dans hub.infra_apis et jamais exposée au front, avec test de connexion dans /admin/infra",
  "• Widget carte des connexions (monde + France) avec animations pulse/blink/acquitté, fond OpenStreetMap assombri (sans clé) et sélecteur de durée par carte (1 min à 1 semaine)",
  "• Séparation en deux widgets distincts (Monde et France) au lieu d'une carte empilée ; l'ancienne clé reste mappée vers la carte Monde pour les tableaux existants",
  "• Persistance du facteur de zoom par carte, affichage de la carte avec bandeau lorsqu'aucune connexion n'est géolocalisable, et couleurs des marqueurs (rouge suspect, orange confiance > 65, vert sinon)",
  "• Nouveau widget « Connexions en erreur — détail » : utilisateur, IP/localisation, application, code et motif d'échec, résultat MFA et réputation IP",

  "### Magasin d'applications",
  "• Bouton « Se souvenir de moi » sur la page de connexion",
  "• Icône de compte Active Directory (vert si présent, ambre sinon) et affichage du matricule pour la recherche d'agent RH Studio, avec carte non éditable de l'agent sélectionné (arrivée d'agent)",
  "• Correctif de mise en page du modal « Nouveautés » : normalisation des espaces insécables collés depuis Word",

  "### Aide",
  "• Nouvelle rubrique Aide dans le DSI Hub et le Magasin d'applications, avec le guide fonctionnel du Transcript Manager (docs/GUIDE-TRANSCRIPT-MANAGER.md)",
  "• Bouton Aide contextuel ajouté au header restreint (agent via Magasin d'applications / lien de partage)",
  "• Nouvelle page /admin/aides : aides regroupées par module, avec aperçu, édition et URL d'accès direct",
  "• Correctif : GET /api/page-help/:page ne lisait jamais hub.page_help, rendant invisible tout contenu créé depuis /admin/hub > Aide",

  "### Service fait",
  "• Bouton d'action scindé en « Lancer » et « Fait », permettant une déclaration directe sans circuit",
  "• Renommage du bouton « Fait » en « Faire » pour lever l'ambiguïté",

  "### Projets et Tâches",
  "• Journal de projet : édition et suppression ouvertes à l'auteur de l'entrée (en plus d'admin/PMO), avec édition inline",
  "• Pièce jointe du journal enregistrée dans l'espace documentaire (storage.saveFile + hub_docs) au lieu de rester invisible dans le JSON de l'entrée",
  "• Correctif : les changements de statut depuis « Mes tâches » ne persistaient pas pour les tâches liées à un projet, une rencontre ou une revue",
  "• Correctif : plus de plantage de /api/tasks sur une échéance non-date générée par l'IA",

  "### Général / Hub",
  "• Nouveau composant réutilisable SiteSelectField (chargement des sites, filtre accent-insensible, navigation clavier) remplaçant le code dupliqué dans TicketCreate, CreateTicketModal et TicketDetail",
  "• Suppression d'une clé API Groq codée en dur dans le seed SQL (exposée dans l'historique Git) — à régénérer côté Groq par précaution",
  "• Délai du reverse-proxy nginx relevé de 60 s à 1800 s pour les appels IA longs",
  "• Messages d'erreur exploitables en cas d'échec réseau vers l'API Ville, au lieu de « fetch failed »",
  "• Nettoyage des fichiers de debug/scratch à la racine du dépôt"
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
