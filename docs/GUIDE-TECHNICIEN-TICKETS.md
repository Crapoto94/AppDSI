# Guide technicien — Module Tickets (`/tickets`)

> Documentation fonctionnelle à l'usage des **techniciens, superviseurs et administrateurs** du support DSI.
> Elle décrit d'où viennent les tickets, leur cycle de vie complet, et toutes les fonctionnalités de traitement avec la manière de s'en servir.

---

## Sommaire

1. [Accès et rôles](#1-accès-et-rôles)
2. [Comment un ticket entre dans le système (les canaux d'entrée)](#2-comment-un-ticket-entre-dans-le-système)
3. [Le cycle de vie d'un ticket](#3-le-cycle-de-vie-dun-ticket)
4. [La page d'accueil des tickets](#4-la-page-daccueil-des-tickets)
5. [Les vues disponibles](#5-les-vues-disponibles)
6. [Le détail d'un ticket](#6-le-détail-dun-ticket)
7. [Interactions avec les autres modules](#7-interactions-avec-les-autres-modules)
8. [Mode opératoire recommandé](#8-mode-opératoire-recommandé)
9. [Bonnes pratiques](#9-bonnes-pratiques)

---

## 1. Accès et rôles

Le module est accessible depuis le menu **Tickets**. Vos droits dépendent de votre **rôle dans le module** (distinct de votre rôle global dans l'application) :

| Rôle | Périmètre |
|---|---|
| **Technicien** | Traite les tickets qui lui sont assignés ou ceux de ses groupes : prise en charge, commentaires, tâches, résolution. |
| **Superviseur** | Tout le périmètre technicien + visibilité/gestion sur **l'ensemble** des tickets, clôture des tickets **Problème**, vues d'équipe. |
| **Admin / Super Admin** | Périmètre complet + accès à l'administration (`/admin/tickets`). |
| **Utilisateur / Lecture seule** | Voit ses propres demandes (en tant que demandeur), sans traitement. |

Votre rôle est rappelé par une **pastille colorée** en haut de page. Le rôle module est attribué par un administrateur (onglet **Équipe** de l'administration).

---

## 2. Comment un ticket entre dans le système

Un ticket peut être créé par **cinq canaux**. Quelle que soit l'origine, il rejoint la même file et suit le même cycle de vie.

### 2.1 Saisie manuelle (formulaire)
Création directe dans l'application (bouton **Nouveau ticket**). Le formulaire comporte :

- **Type de demande** *(obligatoire)* : **Incident** (quelque chose ne fonctionne pas) ou **Demande** (besoin d'un service/d'un accès).
- **Titre** *(obligatoire)* : résumé court et parlant.
- **Description** : détail de la situation (éditeur enrichi, captures possibles).
- **Priorité** et **Impact** : niveau d'urgence et ampleur (nombre d'usagers concernés).
- **Catégorie / Sous-catégorie** : qualification fonctionnelle.
- **Logiciel / Métier** : application concernée (recherche).
- **Localisation** : site/bâtiment (recherche dans le référentiel des sites).
- **VIP** : à cocher si l'usager est prioritaire.
- **Demandeur** : la personne pour qui le ticket est ouvert (utile quand un technicien saisit à la place d'un usager).
- **Observateurs** : personnes à tenir informées.

> À la création, les **règles d'affectation** (voir guide admin) peuvent automatiquement qualifier, prioriser et router le ticket vers le bon technicien ou groupe.

### 2.2 Par e-mail (Mail Collector)
Les e-mails reçus sur des boîtes O365 surveillées sont **transformés automatiquement en tickets**. Le système peut **classer** le message (Incident / Demande) et le router. Les réponses/échanges par mail sont rattachés au ticket. Idéal pour les usagers qui écrivent simplement au support.

### 2.3 Par le chat en direct (Live)
Une **session de chat** ouverte par un usager génère un ticket associé. À la fin de la conversation, le ticket est **classé (Incident / Demande)** puis clôturé. La trace de l'échange et un résumé sont conservés.

### 2.4 Par le Magasin d'applications (MagApp)
Si cette fonctionnalité est activée, les utilisateurs peuvent directement déposer une demande de support depuis le Magasin d'applications, en lien avec une application spécifique. Cela permet une meilleure contextualisation de la demande dès l'ouverture.

### 2.5 Par synchronisation GLPI (historique)
Cette méthode a été utilisée pour **récupérer la base de tickets existante** lors de la migration. **Elle n'est plus utilisée** pour les nouveaux tickets, le support étant désormais assuré directement par le module Tickets. Pour les environnements encore connectés, cette section est conservée pour des besoins de consultation d'historique.

---

## 3. Le cycle de vie d'un ticket

### 3.1 Les états

| # | Statut | Signification |
|---|---|---|
| 1 | **Nouveau** | Ticket créé, pas encore pris en charge. |
| 2 | **En cours (attribué)** | Un technicien le traite. |
| 3 | **En cours (planifié)** | Traitement programmé / en cours avec planification. |
| 4 | **En attente** | En pause : on attend une information du demandeur ou d'un tiers. **Le SLA est suspendu** pendant cet état. |
| 5 | **Résolu** | La solution a été apportée ; en attente de confirmation/clôture. |
| 6 | **Clos** | Dossier terminé et archivé. |
| 8 | **Rejeté** | Suppression logique (ticket invalide/doublon). N'est jamais réellement effacé. |

### 3.2 Le flux nominal

```
                 (règles d'affectation à la création)
   [Entrée] → Nouveau ──► En cours ──► (En attente) ──► Résolu ──► Clos
                                 ▲           │
                                 └───────────┘   (reprise quand l'info arrive)

   Résolu / Clos ──► Réouverture ──► En cours      (si le problème resurgit)
```

- **Nouveau → En cours** : vous prenez le ticket (et vous vous l'assignez si besoin).
- **En cours → En attente** : dès que la balle est dans le camp du demandeur/d'un fournisseur. **Le compteur SLA se met en pause** et le temps d'attente est décompté séparément.
- **En attente → En cours** : à la reprise, quand l'information attendue arrive.
- **En cours → Résolu** : la solution est apportée (geste recommandé : **Solutionner**, voir §6.4).
- **Résolu → Clos** : clôture. Elle peut survenir de **trois manières** :
  1. **manuellement** par un technicien/superviseur,
  2. par le **demandeur** lui-même,
  3. **automatiquement** : un ticket résolu depuis plus de N jours (par défaut **7**) est clos chaque nuit par le système.
- **Réouverture** : un ticket **Résolu** ou **Clos** peut être rouvert s'il resurgit (il repasse « En cours »). Pour les utilisateurs, la réouverture est limitée dans le temps (au-delà du délai, créer un nouveau ticket).

### 3.3 Règles particulières

- Les transitions proposées **dépendent de votre rôle** ; seuls les statuts atteignables sont affichés.
- Les tickets de type **Problème** ne peuvent être **clos que par un superviseur**.
- Lors d'une **panne collective**, la résolution peut être propagée **en cascade** aux tickets liés (groupe de tickets ou Problème commun).

---

## 4. La page d'accueil des tickets

### 4.1 Les indicateurs (KPI) cliquables
La barre de vignettes en haut est à la fois un **tableau de bord** et un **filtre rapide** : un clic filtre la liste, un second clic l'enlève.

| Vignette | Contenu | À quoi ça sert |
|---|---|---|
| **Ouverts** | Nouveaux / en cours / planifiés | Tout ce qui reste à traiter |
| **En cours** | Tickets pris en charge | Suivre l'activité courante |
| **En attente** | Tickets en pause | Relancer ce qui est bloqué |
| **Critiques** | Ouverts de priorité maximale | Prioriser l'urgent |
| **Résolus** | Résolus non clos | Contrôler avant clôture |
| **Problèmes** | Tickets de type Problème | Traiter les causes racines récurrentes |
| **SLA dépassées** | Hors délai contractuel | Rattraper les retards |

D'autres indicateurs de pilotage peuvent apparaître (âge moyen, temps d'attente, temps actif de résolution, chat live). La **sélection des KPI affichés est personnalisable** (icône de configuration).

### 4.2 Les filtres « par moi »
- **Mes tickets assignés** — ceux dont vous êtes le technicien.
- **Mes tickets** — ceux que vous avez déclarés (en tant que demandeur).
- **⭐ VIP** — les tickets des usagers prioritaires.

### 4.3 Recherche, filtres et tri
- **Recherche** plein texte (titre, contenu, demandeur…).
- **Filtres** : catégorie / sous-catégorie, **logiciel**, **groupe**, **technicien**, **type** (Incident/Demande), **email du demandeur**.
- **Tri** : clic sur un en-tête de colonne (re-clic pour inverser).

### 4.4 Afficher clos / rejetés
- Par défaut : tickets **ouverts + résolus**.
- **« 👁️ Voir clos »** ajoute les tickets **clos** (re-clic pour masquer).
- Les superviseurs/admins ont un bouton supplémentaire pour afficher les **rejetés**.

---

## 5. Les vues disponibles

| Vue | Usage |
|---|---|
| **Table** | Liste détaillée triable/filtrable : la vue de référence pour le traitement de masse. |
| **Kanban** | Colonnes par statut (Nouveau → En cours → En attente → Résolu → Clos) : on visualise le flux et on fait glisser les tickets. |
| **Inbox** | Boîte de réception à défilement continu : on enchaîne les tickets un par un, idéal au fil de l'eau. |
| **Live** | Suivi des **sessions de chat en direct** avec les usagers. |

---

## 6. Le détail d'un ticket

Cliquez sur un ticket pour ouvrir sa fiche, qui centralise toutes les actions.

### 6.1 L'en-tête
Affiche **statut**, **priorité**, **demandeur** et **technicien assigné**. Sur un ticket « En attente », le **motif d'attente** s'affiche au survol.

### 6.2 Changer le statut (workflow)
Des **boutons de transition** proposent les statuts accessibles depuis l'état courant (cf. §3). Vous y déclenchez la prise en charge, la mise en attente, la résolution, etc.

### 6.3 Assigner / Escalader
Le bouton d'**assignation** ouvre une fenêtre à deux onglets :
- **Technicien** : attribuer à une personne précise.
- **Escalade** : transférer à un **groupe** (2ᵉ niveau, expert, prestataire).

Toute (ré)assignation et escalade est **tracée dans l'historique**.

### 6.4 Commentaires et solution
La zone de commentaire (éditeur enrichi) sert aux échanges et à la documentation :
- **Commentaire** : public (visible du demandeur) ou interne selon le paramétrage.
- **CC observateurs** : possibilité de les mettre en copie du mail à l'envoi.
- **🪄 Reformuler avec l'IA** : réécrit proprement votre texte (clarté, orthographe) ; vous validez ou non la proposition.
- **✅ Solutionner** : enregistre le commentaire **comme solution** ET passe le ticket à **Résolu** en une seule action. C'est le geste recommandé : la solution est conservée, réutilisable et alimente la base de connaissances.

La **solution** s'affiche ensuite dans une section dédiée.

### 6.5 Résolution en cascade
Si le ticket fait partie d'un **groupe** (mêmes symptômes) ou est rattaché à un **Problème**, l'application propose de **résoudre d'un coup** tous les tickets liés — précieux lors d'un incident touchant plusieurs usagers.

### 6.6 Tâches
Attachez des **tâches** (actions à mener) au ticket. Le statut de chaque tâche se fait défiler d'un clic (`À faire → En cours → Terminé`). Ces tâches remontent aussi dans votre page **Mes Tâches**.

### 6.7 Pièces jointes
Consultez et ajoutez des fichiers (captures, logs, documents). Les images intégrées aux descriptions importées de GLPI sont rapatriées et visibles.

### 6.8 Observateurs
Ajoutez des **observateurs** (collègues, demandeur, hiérarchie) pour les tenir informés : ils peuvent être notifiés et mis en copie des commentaires. Recherche par nom ; retrait d'un clic.

### 6.9 Problèmes (causes racines)
Pour un incident récurrent :
- **Créer un Problème** à partir du ticket, ou **Associer** le ticket à un Problème existant.
- Le Problème porte une **méthode de résolution** et peut citer un **article de base documentaire**.
- Résoudre le Problème permet de **solder les tickets associés**. (Clôture réservée aux superviseurs.)

### 6.10 Historique
La **chronologie** retrace tous les évènements : créations, changements de statut, assignations, escalades, commentaires, tâches, dépassements SLA. C'est la mémoire complète du dossier — utile pour les reprises et les audits.

### 6.11 Satisfaction
Après résolution/clôture, le demandeur peut être invité à donner un **avis de satisfaction**. Les retours sont consultables par les superviseurs.

---

## 7. Interactions avec les autres modules

Le module Tickets n'est pas isolé : il **consomme et alimente** d'autres modules de DSI Hub. Depuis la fiche d'un ticket, vous accédez directement à ces informations.

### 7.1 Mes Tâches
Les **tâches** créées sur un ticket (§6.6) sont les mêmes objets que ceux de la page **Mes Tâches** : elles y remontent automatiquement, avec le ticket comme contexte. Inversement, faire avancer une tâche depuis Mes Tâches met à jour le ticket. Un technicien retrouve donc, au même endroit, toutes ses actions à mener, quel que soit leur ticket d'origine.

### 7.2 MagApp (applications et leurs documents)
Quand un ticket porte sur un **logiciel / une application**, la fiche fait le lien avec **MagApp** :
- l'**application** concernée est identifiée (parmi celles publiées dans MagApp) ;
- ses **documents** (notices, procédures, modes d'emploi) sont **proposés en suggestion** et peuvent être **joints au ticket** ou envoyés au demandeur en un clic.

Un ticket peut aussi **provenir** de MagApp (source « Magapp ») lorsqu'il est ouvert depuis le portail applicatif. C'est l'exemple type de la **lecture des documents MagApp associés à une application** directement dans le traitement du ticket.

### 7.3 Base documentaire (connaissances)
La fiche suggère des **articles de la base documentaire** pertinents pour le ticket (selon catégorie/logiciel). Vous pouvez les **joindre** comme solution ou les transmettre. Les Problèmes référencent eux aussi un **article de connaissance** comme méthode de résolution.

### 7.4 Parc informatique
La fiche affiche les **équipements du demandeur** issus du **Parc** (rapprochés par e-mail) : « 🖥️ N équipements parc ». Vous voyez immédiatement le matériel de l'usager (postes, périphériques…) sans quitter le ticket — utile pour qualifier un incident matériel.

### 7.5 Annuaire (Active Directory) et Sites
- La recherche de **demandeur**, d'**observateurs** et de **techniciens** s'appuie sur l'**annuaire AD**.
- Le champ **Localisation** puise dans le référentiel des **Sites** (module Ville), pour rattacher le ticket à un bâtiment connu.

### 7.6 GLPI
Selon l'environnement, les tickets, catégories et groupes sont **synchronisés depuis GLPI**, et les **images/documents** d'origine GLPI sont rapatriés et affichés. La correspondance des référentiels est assurée par les **transpositions** (voir guide admin et `/admin/glpi`).

### 7.7 Notifications / E-mail
Les évènements du ticket (création, changement de statut, clôture, réouverture…) déclenchent des **e-mails** vers les bons destinataires (demandeur, technicien, groupe, observateurs). Les commentaires peuvent être **envoyés au demandeur** et mettre les observateurs en copie.

### 7.8 Tableau de bord DSI
Les indicateurs du module (KPIs, tendance, répartition par statut/catégorie) sont disponibles sous forme de **widgets** dans le **Tableau de bord DSI**, pour un pilotage transverse.

### 7.9 Rappel : canaux d'entrée
Deux modules sont aussi des **portes d'entrée** de tickets (voir §2) : le **Mail Collector** (e-mails O365) et le **Chat Live**.

---

## 8. Mode opératoire recommandé

1. **Prendre** le ticket → **En cours** (s'assigner si nécessaire).
2. **Diagnostiquer** : commenter, demander des précisions, créer des tâches.
3. En attente d'une réponse → **En attente** (le SLA se met en pause).
4. **Traiter**, rédiger la solution, cliquer **✅ Solutionner** → **Résolu**.
5. Laisser le demandeur confirmer ; le ticket sera **Clos** (manuellement, par le demandeur, ou automatiquement après le délai configuré).
6. Panne collective → **Problème** + **résolution en cascade**.

---

## 9. Bonnes pratiques

- **Documentez la solution** via *Solutionner* : elle nourrit la base de connaissances et les réponses automatiques.
- **Utilisez « En attente »** dès que vous attendez le demandeur : vos SLA restent justes.
- **Escaladez tôt** vers le bon groupe plutôt que de laisser un ticket stagner.
- **Surveillez « Critiques » et « SLA dépassées »** en début de journée.
- **Créez un Problème** au 2ᵉ ou 3ᵉ ticket identique : vous traiterez les suivants en cascade.
- **Renseignez catégorie, logiciel et localisation** : ils conditionnent les statistiques, le routage et les SLA.

---

*Pour le paramétrage du module (catégories, SLA, règles, clôture auto, notifications…), voir le **Guide administrateur — Administration des Tickets** (`GUIDE-ADMIN-TICKETS.md`).*
