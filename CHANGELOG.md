# Changelog

Toutes les évolutions notables du projet AppDSI sont documentées ici.

## [1.6.0] - 2026-11-13

Budgets précisés et filtrables, opérations visibles par tous les accès Budget, refonte du suivi des rencontres budgétaires, bandeau d'actualité et forum de crise MagApp, SMS en masse Frizbi, PDF + assistant IA, annuaire des intervenants externes et correctifs (calendrier DSI, tickets, service fait).

### Budget
- **Budgets précisés** : la colonne « Budget » affiche « code – libellé » (ex. `00 – PRINCIPAL`) pour les **lignes budgétaires, factures, commandes et engagements (mouvements)** ; les lignes de même libellé présentes dans plusieurs budgets ne sont plus additionnées (`sedit-budget-synthese.service.js`, `sedit-engagements.service.js`, `finance.controller.js`).
- **Filtre « Budget »** à côté du bouton Budget principal / Tous les budgets : filtre lignes, factures, commandes et engagements, ce qui permet de lister les mouvements d'un budget.
- **Opérations** : suppression du filtre automatique sur le service de l'utilisateur (la liste restait vide pour les utilisateurs hors admin/finances) ; tous ceux qui ont accès à la tuile Budget voient toutes les opérations (modification toujours réservée admin/finances). Le filtre de service est conservé sur les commandes.
- **Demandes de commande** : page allégée (détails dépliables, menu d'actions, documents en pastilles), une URL par sous-menu (`/budget/commandes…`), ajout de documents ouvert à tous ; rôle compta gestionnaire des demandes et de l'envoi des commandes.
- **Service fait** : réservé compta/finances/admin ; PJ de la demande de commande associée intégrées d'office (liste, retrait, aperçu) ; contrôle d'accès sur le rôle courant (SQLite Admin → Utilisateurs et `hub.users`) même si le rôle du jeton est périmé.

### Rencontres budgétaires
- Statuts **« A arbitrer »**, **« Refusé »**, **« Validé »** (année de validation obligatoire, année en cours présélectionnée) avec changement au clic et commentaire facultatif.
- Création de **ticket DSIHUB** depuis la liste (HTML structuré, type repris, demandeur = utilisateur de référence AD) ; « + Assigner » avec recherche AD.
- **« + Projet »** : mini-projet (ou sous-projet d'un projet maître) ou association à un projet existant ; création d'une tâche pour le chef de projet avec e-mail, la validation terminant la demande.
- Fusion commentaires/suivi, charge des CP, CP pressenti, filtres par année, infobulle ; liste sobre, fiche redessinée, directions/services dédoublonnés.

### Projets
- **Journal de projet** : une réunion liée est datée de la **réunion** et non de la saisie (`lierReunion` → `ajouterJournal(..., dateEntree)`).

### Réunions
- **Annuaire des intervenants externes** (`hub_rencontres.intervenants_externes`) : fonction, organisme et e-mail mémorisés et proposés pendant la saisie du nom (création et fiche de réunion) via `GET /api/rencontres-reunions/intervenants/search` et le composant `IntervenantNameInput`.

### Calendrier DSI
- **Télétravail jamais en série** : saisie d'un jour ou d'une demi-journée unitaire (plus de date de fin, plus de « Supprimer la série » sur un TT, `deleteSeries` ignoré côté serveur pour la catégorie).
- **Correctif** : `updateEvenement` avec `updateSeries` modifiait tous les événements de l'agent de même titre (demi-journées de TT passées en journées complètes) ; la modification d'un événement supprimait aussi les jours voisins saisis séparément. Seul l'événement ciblé est désormais touché.

### Tickets
- **Correctif** : la case à cocher d'une tâche (détail d'un ticket) est mise à jour immédiatement, avec retour arrière en cas d'erreur, anti double-clic et sans écrasement par un rechargement en cours.
- Commentaires : pastille Observateur, distinction réponses du demandeur / commentaires (`is_reply_to_tech`), retours à la ligne conservés ; avertissement si demandeur sans e-mail ; tableau de bord : répartition en barres de l'âge et de l'attente.

### MagApp
- **Bandeau d'actualité** permanent paramétrable (`/admin/magapp`), **forum de crise** épinglable associé au bandeau, application mise en avant, refonte de l'onglet Paramètres.
- **Modifier un PDF** (PdfCraft) + **assistant IA** (API Ville), extraction de texte via pdfjs-dist ; utilisateurs limités à leur dernière année de demandes.

### Frizbi
- **SMS en masse** depuis un fichier Excel, avec suivi de délivrance.

### Parc
- Windows 11 : build **26300 affiché « 26H2 »** (`shared/os_version_map.js`).

### Corrections
- Erreurs de build TypeScript, erreur JSX du sélecteur d'année, suppression d'une demande refusée en 403 pour les non-superadmin.

## [1.5.0] - 2026-11-06

Version majeure depuis la 1.4.1 : signature avec clé matérielle RGS** dans le Parapheur, boîte à idées, modélisation BPMN, stagiaires, Budget en direct sur Sedit (demandes de commande, DGP, virements de crédits), chat en direct enrichi et statistiques tickets plus fines.

### Parapheur — signature avec clé matérielle RGS**
- **Signature avec une clé cryptographique RGS\*\*** (carte à puce / clé USB, ex. Certinomis + SafeNet) : signature PAdES **en deux temps**, la clé privée ne quitte jamais la clé.
- **Agent de signature local (Windows)** : installateur traditionnel (Inno Setup, ~2 Mo, sans droits administrateur), démarrage automatique à l'ouverture de session, **icône près de l'horloge** avec fenêtre de paramètres (adresses autorisées, certificats détectés, journal).
- Agent **réécrit en programme natif .NET** (42 Ko au lieu de 90 Mo, plus de PowerShell, signature plus rapide) ; confirmation à l'écran avant chaque signature, puis code PIN demandé par le pilote de la clé.
- **Test de la clé** depuis `/parapheur` et `/admin/parapheur-certificats` (validité, RSA, non-répudiation, signature, PAdES, durée de chaque étape) ; **installation guidée** de l'agent (téléchargement, détection automatique, mise à jour proposée, bouton « Démarrer l'agent »).
- Retour à l'accueil du Parapheur après signature ; plus de lien de signature en `localhost` quand l'URL publique n'est pas configurée (alerte).

### Boîte à idées (nouveau)
- **Icône ampoule dans l'en-tête**, ouverte à tous les agents ; idées classées en **catégories colorées** (Cadre de vie, Efficacité, Outils & numérique, Bien-être, Ambiance, Environnement, Formation, Sécurité, Autre).
- Dépôt **avec ou sans nom** : en mode anonyme, **aucune information sur l'auteur n'est enregistrée**.
- **Votes** (un par agent), filtres et recherche, « Mes idées » ; les administrateurs changent le statut (nouvelle, en étude, retenue, réalisée, non retenue) et **répondent publiquement**.

### Backlog
- `/admin/backlog` : **choix des agents qui reçoivent un e-mail** à chaque nouvelle demande DSI Hub et à chaque nouvelle idée MagApp.

### Modélisation BPMN (nouveau)
- Tuile **Modélisation BPMN** (bpmn.io) avec bibliothèque de modèles sur le serveur et assistant IA.
- Modèles prêts à l'emploi : six processus d'**ODP Manager**, neuf processus de **VibeDélib**, modèle « Demande de tournage » complété.
- **Import de fichier BPMN** : mise en page automatique, titre repris du fichier, glisser-déposer, contrôles de format et de taille.

### RH
- Onglet **Stagiaires** : liste, calendrier sur 15 mois (pastille du nombre de stagiaires), CRUD, import Excel, maître de stage parmi les agents DSI, dépôt du CV et du rapport de stage.

### Budget
- **Demandes de commande** : séparation en *Demandes validées / Commandes envoyées / Archives* (facture Sedit mandatée), bouton « **Déjà envoyé** », **documents** ajoutés après envoi (bons de livraison…), commentaires avec réponses et @mentions, état de la commande Sedit et bon de commande cliquable, envoi des commandes aux tiers, contacts des tiers.
- **Factures et commandes lues en direct dans Sedit** ; état réel des factures (refusée, mandatée, service fait, reçue) pour « Factures à traiter » ; nom du tiers dans l'infobulle.
- **Courbe du DGP par semaine** avec bascule **DGP Global** (réception → paiement, seuil 30 j) / **DGP Ville** (réception → mandatement, seuil 20 j).
- **Demande de virement de crédits** : PDF, historique, envoi au Parapheur et à budget@, lignes Sedit en direct, minorer/majorer côte à côte, enveloppes.
- Synthèse budgétaire Sedit en direct (DSI), couleurs par direction ; page nettement plus rapide (**cache serveur** rafraîchi en arrière-plan).
- Correction : PDF scannés affichés en pages blanches en production.

### Télécom
- Factures et engagements **lus directement dans Sedit** (état SF, rapprochement, mandat, rejet), synthèse des engagements en direct, engagements fluides / non fluides.
- Analyse par ligne des factures SFR, histogramme mensuel des dépenses, pastilles de factures par opérateur, tableau unique des comptes par opérateur, compte d'une facture modifiable.

### Tickets
- **Statistiques** : évolution des **modes de soumission** en graphique empilable (12 mois par défaut ; empilé / 100 % / courbes) et **analyse détaillée des chats** (qui a répondu, délais de réponse, messages, avis, performance par technicien).
- Source **« Téléphone »** : tickets saisis dans le Hub par un demandeur non agent DSI reclassés en téléphone, et case « Ticket téléphone » à la création.
- Tickets **« Arrivée d'agent »** : affectés d'office au groupe *Support et Déploiement*, titre « arrivant (N+1 : …) ».
- Auto-fermeture des tickets résolus avec rattrapage, tuile « Clos », KPI quotidiens corrigés, âge actif / inactif, navigation au clavier, recherche de logiciel sans accents, filtre demandeur par nom, notes de tâche.
- Un ticket par demande de prêt ; checklist des comptes à créer dans le ticket d'arrivée.

### Chat en direct
- **Plusieurs messages avant la prise en charge**, **notifications du navigateur** (son et pastille) à la réponse d'un technicien ; la croix réduit le chat sans l'abandonner.
- **Coller une capture d'écran** (Ctrl+V) et **capture d'une zone** avec sélection ; images affichées dans la conversation (Hub et MagApp).
- Calendriers du support complets (jours fériés, plages, duplication), chat fermé hors horaires, message d'urgence avec alerte SMS à l'astreinte, bulle du MagApp respectant les horaires.

### MagApp
- Fonction BETA **« Recherche d'agent »** (prénom, nom, poste, service avec code, direction, matricule, mail et téléphone lu dans l'AD).
- **Accès par fonctionnalité** : quand une fonctionnalité BETA n'est pas publiée pour tous, quelques agents nommés dans chaque tuile de `/admin/magapp` y ont accès ; badge BETA masqué une fois publiée.

### Parc
- **GLPI en mode Live par défaut**, avec cache conservé et rechargé en arrière-plan.
- **Étiquettes** : logo et textes lus sur le serveur, impression d'une **série** (ex. PO20205 → PO25260) par lots.

### Tâches et projets
- Classes de tâches personnelles et d'équipe, affectation à une équipe, filtre « affectées par d'autres », recherche plein texte, panneau de statistiques, classe système « Logiciel ».
- Journal de projet étendu aux tâches terminées et aux annotations de revue ; correction des projets du bureau des projets absents du portefeuille PMO.

### Autres
- Doctrines (commentaires par section, revue administrateur), vue des autorisations par tuile, aperçu unifié des e-mails `.msg`/`.eml`, collecteur « Tâches », badge de présence RH Studio dans Param Ville, consommables modifiables à toutes les étapes, prêts avec retour le jour même.

### Corrections
- Liens de notification vers l'URL de production, repli sur la GED Alfresco pour les fichiers migrés, accès réservé aux utilisateurs de `/admin/users`.
- Ajout d'observateur en erreur (casse de colonne), marqueurs de conflit dans le module tickets, décalage de 2 h de l'activité des tâches, rappel de 8 h en erreur sur une échéance en texte libre, accès refusé aux stagiaires pour les administrateurs.

## [1.4.1] - 2026-10-01

### Projets — Explorateur de documents
- Fusion des onglets **Documents** et **Explorateur** ; dossiers, glisser-déposer par fichier, gestion des ZIP (dézipper / conserver), type de document en liste déroulante (obligatoire, devenu optionnel) et sous « tout sélectionner ».
- **Sélection multiple** de dossiers et fichiers, **copier-coller** et déplacement d'un dossier entier (typage en cascade).
- **Visionneuse enrichie** : versions, rendu Markdown (`.md`) et affichage texte brut des `.msg`.
- **Add-in OnlyOffice** : aperçu lecture seule (docx/xlsx/pptx) et **édition en ligne** (bouton Modifier, plein écran, sans panneau des versions), moteur dédié à AppDSI et proxy nginx ; collaboration au nom de l'agent connecté (plus de demande de nom).
- Ajout / suppression d'une pièce jointe en éditant une entrée du journal.

### Réunions
- Recherche de créneaux communs : **horizon réglable** (1 mois à 1 an), bouton « **5 créneaux suivants** » et option « **Strictement tous les participants** ».
- **Ajout rapide d'invités par catégorie** (DG/DGA, directeurs, responsables de service, groupes particuliers).
- Saisie de l'heure **simplifiée au quart d'heure** à la création d'une réunion.

### Tickets
- **Mentions @** avec notifications et **rappel par e-mail à 20h**.
- **Collecteur mail** : les réponses et transferts sont ajoutés en commentaire (contenu ajouté uniquement).
- **Mot de passe provisoire configurable** (réglage déplacé vers `/tickets/admin` > Paramètres) et action rapide de changement de mot de passe avec ticket auto-résolu.
- Affichage de l'**activité / timeline**, du message d'attente et des puces de listes dans la vue détail.

### Tâches
- Lien vers l'**élément d'origine** dans le mail d'assignation, notification des **tâches d'arbitrage**, liens e-mail basés sur le domaine public.

### Service fait (Sedit)
- **Date de service fait** saisie dans le formulaire (défaut : jour) et reportée dans Sedit.
- Création **atomique** avec synchronisation Sedit ; « Faire » accepte un commentaire **ou** une pièce jointe.

### Parapheur
- Liens de **signature et QR basés sur le domaine public**, expéditeur (direction), libellés « en masse » ajustés.

### MagApp
- Pastille « **maintenance à venir** » avec infobulle dans le Magasin d'applications ; refonte de la modale « Programmer une maintenance ».

### Pièces jointes
- **Visionneuse générique** de pièces jointes et **aperçu Office en lecture seule** (Document Server OnlyOffice d'AppDSI via `hub.infra_apis`).

### Corrections
- Résolution en cascade des tickets liés (échec silencieux), upload de dossier bloqué à 30 % dans `/projets`, bascule des fichiers GED legacy vers Alfresco.
- Maintenances MagApp stockées avec un mauvais horaire (fuseau).
- Callback Azure AD : doublon `hub.users` (casse), redirection localhost et `/api/auth/me` ; crash du dashboard tickets ; `/fast` inaccessibles aux agents tickets.

## [1.2.0] - 2026-09-16

### Nouveau module — Parapheur électronique (`/parapheur`)

Signature de documents PDF par circuit séquentiel ou parallèle, 100 % interne au Hub DSI.

**Création d'un parapheur**
- Dépôt de PDF **à signer** + **annexes** (consultables par le signataire, non signées), avec aperçu miniature et comptage des pages.
- Choix des signataires (annuaire RH Studio) et, pour chacun, du mode de signature : **simple**, **vérifiée par SMS** ou **sécurisée (certificat P12)**.
- Position de signature par défaut sur la **dernière page**, ajustable dans un éditeur.
- **Titre / fonction** du signataire pré-rempli depuis le référentiel RH (`POSTE_L`), modifiable et activable.

**Signature (lien e-mail, identité vérifiée via l'annuaire)**
- **Lecture obligatoire** : le signataire doit faire défiler chaque document jusqu'à sa dernière page avant de pouvoir signer.
- Zone de dessin **tactile** (souris, Android/iOS, macOS) ; signature mémorisable.
- **Mention libre manuscrite** (« Avis favorable ») : saisie, taille réglable et **positionnement par le signataire**.
- **Simple** : compte Active Directory. **SMS** : code à 6 chiffres envoyé au portable (validité 10 min). **Sécurisé** : certificat X.509 personnel → signature cryptographique **PAdES**.
- **Délégation de date à date** : un agent désigné signe à la place du signataire (sauf P12), avec la mention « signé X par délégation de Y ».

**Après signature**
- Apposition des signatures, du nom, de la fonction et de la mention dans le PDF, avec **code QR de vérification sur toutes les pages**.
- **Sceau PAdES de fin de circuit** (autorité de certification interne) garantissant l'intégrité.
- **Page publique de vérification** (sans authentification) via le QR, et **dossier de preuves** téléchargeable (ZIP : rapport PDF, empreintes SHA-256, certificats, journal d'audit, documents signés).
- **Vérification du sceau par DSIHUB** (intégrité + chaîne de l'AC interne) ; certificats techniques par signature pour les modes simple/SMS.

**Administration**
- `/admin/parapheur-certificats` : certificats P12 (vérifiés après usage), journal des signatures (dont le **numéro SMS utilisé**), contrôle de sécurité (empreintes, PAdES), **URL publique** du QR, activation du **sceau**, gestion de l'**AC interne**.
- Relances automatiques, gestion des délégations, recherche/filtres (état, signataire, date, texte libre).

**Visionneuse PDF unifiée**
- Zoom, bandeau de signature type Acrobat (signataires, dates, délégation, certificat, mention) ; rendu **pdf.js** sur mobile et Safari (zones raster/scans supportées via les décodeurs wasm).

**Déploiement DMZ (`parapheur-dmz/`)**
- Conteneur autonome servant la page publique de vérification, avec proxy nginx restreint au seul point d'entrée `/api/parapheur/verify/` (le reste de l'API interne n'est jamais exposé).

## [1.0.1] - 2026-09-04

### Corrections
- **Tickets** : le bouton « Reprendre » d'un ticket « En attente » ne remettait pas le ticket en statut « En cours ». Il appelait uniquement l'endpoint d'affectation (`/assign`), qui ne change le statut automatiquement que depuis « Nouveau » ou « Attribué ». Le changement de statut est maintenant déclenché directement dans ce cas. ([frontend/src/pages/Tickets/TicketDetail.tsx](frontend/src/pages/Tickets/TicketDetail.tsx))
- **Tickets** : en mode édition d'un ticket, le nom du demandeur apparaissait deux fois — une seconde fois avec son email juste en dessous du champ, comme s'il fallait le resélectionner. Le champ étant pré-rempli avec le demandeur actuel, la recherche automatique se déclenchait dès l'ouverture du mode édition et réaffichait le même résultat. Cette recherche initiale est désormais ignorée tant que l'utilisateur n'a pas modifié le champ.

## [0.3.0] - antérieur
Historique non documenté dans ce fichier (voir `git log`).
