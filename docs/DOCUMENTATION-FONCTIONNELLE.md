# DSI Hub — Documentation fonctionnelle

> **Objet** : documentation fonctionnelle de l'ensemble des modules du portail « DSI Hub ».
> Chaque module est décrit selon le **même gabarit** : accès · à quoi ça sert · comment ça marche ·
> indicateurs / KPI · options & fonctionnalités · paramétrage · interactions avec les autres modules · emplacements réservés aux captures d'écran.
>
> **Convention captures d'écran** : déposer les images dans `docs/captures/<module>/` et remplacer les balises `[insérer capture]` par un lien Markdown (`![libellé](captures/<module>/<fichier>.png)`).

---

## Sommaire

1. [Socle & portail](#1-socle--portail)
   1.1 Authentification & comptes · 1.2 Portail d'accueil (tuiles) · 1.3 Demandes d'accès · 1.4 Messagerie interne · 1.5 Aide contextuelle (bouton « ? ») · 1.6 WhatsNew & backlog · 1.7 Demande d'évolution · 1.8 Actions rapides (/fast) · 1.9 Profil · 1.10 Notes & doctrines · 1.11 MagApp (portail applicatif) · 1.12 Automatisation e-mail & templates · 1.13 GED & Documents (socle transverse)
2. [Support & Helpdesk](#2-support--helpdesk)
   2.1 Tickets · 2.2 Collecteur de mails O365 · 2.3 Auto-résolution (relances) · 2.4 Chat Live · 2.5 Chat École · 2.6 Réponse publique par lien e-mail
3. [Parc, mobilité & infrastructure](#3-parc-mobilité--infrastructure)
   3.1 Parc informatique · 3.2 Mobilité (téléphones/tablettes) · 3.3 Lignes mobiles · 3.4 Vols · 3.5 Copieurs (+ KPI) · 3.6 Consommables · 3.7 Stocks · 3.8 Réseau · 3.9 Inventaire & sécurité des postes (admin)
4. [Télécom & finances](#4-télécom--finances)
   4.1 Télécom · 4.2 Suivi budgétaire & commandes (/budget) · 4.3 Préparation budgétaire · 4.4 Rencontres budgétaires · 4.5 Contrats · 4.6 Tiers
5. [Projets & pilotage](#5-projets--pilotage)
   5.1 Portefeuille projets · 5.2 Fiche projet · 5.3 Revue de projets · 5.4 Planning général · 5.5 Journal global des projets · 5.6 Mes réunions · 5.7 Transcript Manager · 5.8 Mes tâches · 5.9 Calendrier DSI & Agents DSI · 5.10 Tableau de bord DSI (kiosque)
6. [Référentiels & RH](#6-référentiels--rh)
   6.1 RH & synchronisation AD/Azure · 6.2 Param Ville · 6.3 Certificats
7. [Administration & intégrations](#7-administration--intégrations)
   7.1 Administration générale · 7.2 Clés d'API · 7.3 APIs externes & présence agents · 7.4 Oracle (imports) · 7.5 GLPI (legacy)
8. [Annexes](#8-annexes)

---

## Conventions générales

- **Rôles globaux** (JWT, table `hub.users`) : `superadmin`, `admin`, `user`, `magapp`, `readonly` (+ rôles fonctionnels `finances`/`compta` sur certaines routes).
- **Rôles module** (tickets notamment) : résolus par *username* via `hub_tickets.technician_profiles` — `superadmin`, `admin`, `supervisor`, `technician`. Ne jamais utiliser le `id` SQLite du JWT pour interroger PostgreSQL : joindre par `username`.
- **Stockage fichiers** : service unifié (`backend/shared/storage.js`), racine configurable (`storage.root_path`), chemins en base préfixés `storage/…` servis par la route `/storage/*`. Les pièces jointes métier sont en général aussi référencées dans la GED centrale (`hub_docs`).
- **Bases** : SQLite (config legacy : AD, mail, messages, tuiles…) + PostgreSQL multi-schémas (`hub`, `hub_tickets`, `hub_consommables`, `hub_contrats`, `hub_copieurs`, `hub_rencontres`, `hub_calendrier`, `hub_stocks`, `hub_parc`, `hub_telecom`, `hub_vols`, `hub_reseau`, `hub_docs`, `glpi`, `magapp`, `projets`, `transcript`, `oracle`, …).
- **Aide intégrée** : bouton « ? » du Header → panneau d'aide Markdown par page (voir § 1.5).

### Où se trouvent les anciens fichiers d'aide du module /tickets ?

Les guides rédigés pour `/tickets` existent toujours, sous forme de fichiers Markdown dans le dépôt :

| Fichier | Page associée |
|---|---|
| `docs/GUIDE-TECHNICIEN-TICKETS.md` | `/tickets` |
| `docs/GUIDE-STATISTIQUES-TICKETS.md` | `/tickets/stats` |
| `docs/GUIDE-ADMIN-TICKETS.md` | `/tickets/admin` |

Le bouton d'aide du Header appelle `GET /api/page-help/<page>` : si aucune entrée n'existe en base (`hub.page_help`) pour la page, le backend retombe automatiquement sur ces fichiers mappés en dur (voir `backend/modules/page-help/routes.js`). Ils sont donc affichables à tout moment depuis l'application.

---

# 1. Socle & portail

## 1.1 Authentification & comptes

- **Accès / API** : `/login`, `/request-access` — API `POST /api/login`, `GET /api/auth/me`, Azure : `GET /api/auth/azure/login|callback`, `POST /api/change-password`.
- **À quoi ça sert** : authentifier les agents de la DSI via trois modes en cascade (bypass mot de passe MagApp → Active Directory → compte local bcrypt) et délivrer un JWT sans expiration `{ id, username, displayName, role, is_approved, service_code, service_complement, email, source }`.
- **Comment ça marche** : au login AD l'utilisateur est cherché/créé dans SQLite puis miroité dans `magapp.users` ; le rôle élevé est revérifié dans `hub.users` **par username**. Azure AD = flux OAuth (redirect Microsoft → callback → lookup/création). Le rôle module tickets est résolu séparément (§ 2.1).
- **Indicateurs / KPI** : stats utilisateurs dans l'admin (nb admins/superadmins).
- **Options & fonctionnalités** : test/ping AD, recherche d'ordinateurs AD, changement de mot de passe local, syncs AD/Azure pilotées depuis RH avec barres de progression.
- **Paramétrage** : écrans Admin onglets AD/Azure (`/admin/ad`) ; tables SQLite `ad_settings`, `azure_ad_settings`.
- **Interactions** : tous les modules (JWT), RH Studio (présence), MagApp (comptes miroirs), demandes d'accès.

> **📷 Captures d'écran** *(à insérer)*
> 1. Page de login — `[insérer capture]`
> 2. Onglet admin paramètres AD — `[insérer capture]`

## 1.2 Portail d'accueil (tuiles)

- **Accès / API** : `/` — API `GET /api/tiles`, CRUD admin `/api/tiles(/:id)`, ordre perso `POST /api/user-tile-order`, colonnes `PATCH /api/user-prefs/dashboard-columns`, visibilité modules `PUT /api/admin/modules/:key`.
- **À quoi ça sert** : grille d'accueil cliquable vers chaque module métier, personnalisable par l'utilisateur et administrable (tuiles, liens, statuts actif/maintenance/bientôt, visibilité).
- **Comment ça marche** : tuiles stockées en SQLite (`tiles`, `tile_links`), flag public ou attribution individuelle (`user_tiles`), filtrage global par `hub.module_settings.is_visible`. Le dashboard enrichit certaines tuiles de badges KPI.
- **Indicateurs / KPI** (badges sur tuiles) : consommables en attente, certificats à renouveler, contrats expirés/à échéance, tâches en retard/en cours, vols déclarés.
- **Options & fonctionnalités** : drag & drop persisté, nombre de colonnes (3-5), libellés adaptés superadmin, chef de projet MagApp affiché sur la tuile.
- **Paramétrage** : Admin → onglet « Tuiles » (CRUD + liens internes/externes) ; visibilité par module.
- **Interactions** : tous les modules (chaque tuile pointe vers eux), demandes d'accès, MagApp.

> **📷 Captures d'écran**
> 1. Dashboard tuiles — `[insérer capture]`
> 2. Admin édition d'une tuile — `[insérer capture]`

## 1.3 Demandes d'accès aux tuiles

- **Accès / API** : `/request-access` — API `POST /api/access-requests`, admin `GET /api/admin/access-requests`, `POST .../:id/approve|reject`.
- **À quoi ça sert** : permettre à un agent non approuvé de demander l'accès aux briques applicatives et à l'admin de valider.
- **Comment ça marche** : liste des tuiles non publiques, cochage des modules souhaités ; création du compte (`is_approved=0`) et demande `pending` ; l'approbation active le compte et insère les `user_tiles`.
- **Indicateurs / KPI** : badge « demandes en attente » côté superadmin.
- **Options & fonctionnalités** : pré-sélection via `?preselect=tileId`, message d'instruction personnalisable, écran « Accès restreint » floutant le dashboard tant que non approuvé.
- **Paramétrage** : tables SQLite `access_requests`, `user_tiles` ; textes via messages système (`demandeacces`, `nologin`).
- **Interactions** : dashboard/tuiles, messagerie interne.

> **📷 Captures d'écran**
> 1. Formulaire de demande d'accès — `[insérer capture]`
> 2. Validation admin — `[insérer capture]`

## 1.4 Messagerie interne (messages système)

- **Accès / API** : `/admin/messages` — API `GET|POST /api/messages`, `PUT|DELETE /api/messages/:id`, lecture publique `GET /api/messages/code/:code`.
- **À quoi ça sert** : diffuser des textes paramétrables identifiés par un code (messages d'instruction/avertissement affichés ailleurs dans l'app).
- **Comment ça marche** : table SQLite `messages (code, libelle, content)` ; codes utilisés : `nologin` (compte non approuvé), `demandeacces` (consignes).
- **Indicateurs / KPI** : aucun.
- **Options & fonctionnalités** : CRUD inline trié par code.
- **Paramétrage** : c'est l'écran lui-même.
- **Interactions** : dashboard (message « accès restreint »), demande d'accès (consignes).

> **📷 Captures d'écran**
> 1. Liste des messages système — `[insérer capture]`

## 1.5 Aide contextuelle (bouton « ? » du Header)

- **Accès / API** : présent dans le Header de toutes les pages — API `GET /api/page-help/:page` (public), `PUT|DELETE /api/page-help/:page` (admin, texte ou fichier `.md` ≤ 5 Mo), admin : onglet Aide de `/admin/hub`.
- **À quoi ça sert** : afficher une aide Markdown contextuelle propre à chaque page, rédigée par les administrateurs, dans un panneau latéral plein écran.
- **Comment ça marche** : contenu prioritaire en base (`hub.page_help`, rendu HTML via `marked`) ; repli sur les fichiers `docs/GUIDE-*.md` mappés en dur pour les pages tickets (§ Annexe B). Le Header teste le chemin exact puis le préfixe de premier niveau (`/tickets/123` → `/tickets`).
- **Indicateurs / KPI** : aucun. Bouton pulsant affiché seulement si une aide existe.
- **Options & fonctionnalités** : rendu Markdown stylé (titres, tableaux zébrés, code), moteur de recherche dans l'aide, import de fichier `.md`, aperçu HTML, suppression.
- **Paramétrage** : table `hub.page_help`.
- **Interactions** : toutes les pages du Hub.

> **📷 Captures d'écran**
> 1. Panneau d'aide ouvert sur /tickets — `[insérer capture]`
> 2. Onglet admin Aide (édition/import .md) — `[insérer capture]`

## 1.6 WhatsNew & backlog

- **Accès / API** : `/whats-new` — API `GET|POST /api/backlog` (multipart ≤ 5 PJ), `PUT|DELETE /api/backlog/:id` (admin), releases `POST /api/release-from-backlog`, changelog public `GET /api/changelog`.
- **À quoi ça sert** : vitrine des demandes d'évolution/bugs soumises par les utilisateurs, suivies par l'équipe, alimentant le changelog des versions.
- **Comment ça marche** : items de backlog avec catégorie (Bug / Amélioration / Nouvelle fonctionnalité / Graphisme) et statut workflow (open → in_progress/discussion → accepted/rejected → completed) ; PJ servies sous `/uploads/backlog_attachments/` ; transformation « prêtes pour release » en version.
- **Indicateurs / KPI** : compteurs par filtre catégorie/statut.
- **Options & fonctionnalités** : filtres, tri par avancement, création rapide, téléchargement des PJ.
- **Paramétrage** : statuts codés en dur.
- **Interactions** : RequestFeature (création), Header (changelog + todos).

> **📷 Captures d'écran**
> 1. Vue WhatsNew — `[insérer capture]`

## 1.7 Demande d'évolution (/request-feature)

- **Accès / API** : `/request-feature` — API `POST /api/backlog` (multipart), `GET /api/tiles`.
- **À quoi ça sert** : formulaire utilisateur pour proposer une amélioration, signaler un bug ou demander une fonctionnalité, rattachée optionnellement à un module.
- **Comment ça marche** : choix du module/tuile concerné, catégorie, titre (255 car.), description, jusqu'à 5 PJ de 25 Mo → item de backlog `open` attribué à l'auteur.
- **Indicateurs / KPI** : compteur de caractères du titre.
- **Options & fonctionnalités** : sélection visuelle de catégorie, gestion des fichiers avant envoi, confirmation.
- **Paramétrage** : aucun.
- **Interactions** : backlog/WhatsNew, tuiles Hub.

> **📷 Captures d'écran**
> 1. Formulaire de demande — `[insérer capture]`

## 1.8 Actions rapides (/fast)

- **Accès / API** : `/fast` (mobile-first) — API `GET /api/tickets/my-role`, recherche tickets lite, auto-actions `/api/tickets/auto-actions/*` (password-sms, ad-search, ad-user-toggle/unlock/force-pwd-change…), création de tâche `/api/tasks`.
- **À quoi ça sert** : accès mobile rapide aux gestes fréquents : créer/rechercher un ticket, créer une tâche, renouveler un mot de passe par SMS, gérer un compte AD.
- **Comment ça marche** : rôle résolu via my-role pour autoriser les actions auto. Flux SMS en 3 étapes : génération mot de passe fort → changement AD + envoi SMS (template `{PRENOM}/{MOT_DE_PASSE}/{LIEN}`) → synchro Azure AD Connect. Gestion AD : statut détaillé, activation/désactivation, déverrouillage, forçage changement mdp.
- **Indicateurs / KPI** : progression pas-à-pas (AD ✓ / SMS ✓ / synchro ✓), statut ACTIF/DÉSACTIVÉ/VERROUILLÉ.
- **Options & fonctionnalités** : recherche ticket debouncée, template SMS/lien tuto configurables inline, retour d'état AD/O365 après envoi.
- **Paramétrage** : settings auto-actions persistés via l'API (dont `ad_sync_url`).
- **Interactions** : Tickets (rôles), AD/Azure, Frizbi (SMS), Mes tâches.

> **📷 Captures d'écran**
> 1. Accueil actions rapides (mobile) — `[insérer capture]`
> 2. Flux mot de passe par SMS — `[insérer capture]`

## 1.9 Profil

- **Accès / API** : `/profile` — API `POST /api/change-password`.
- **À quoi ça sert** : changer son mot de passe local (vérification de l'ancien hash bcrypt).
- **Comment ça marche** : formulaire actuel/nouveau/confirmation, mise à jour SQLite `users.password`.
- **Indicateurs / KPI** : message succès/erreur inline.
- **Options & fonctionnalités** : validation de confirmation, état de chargement.
- **Paramétrage** : aucun.
- **Interactions** : AuthContext (utilisateur lu du JWT/localStorage).

> **📷 Captures d'écran**
> 1. Page profil — `[insérer capture]`

## 1.10 Notes & doctrines

- **Accès / API** : `/doctrines` — API `GET|POST /api/doctrines`, `GET|PUT|DELETE /api/doctrines/:id` (tout agent connecté).
- **À quoi ça sert** : publier et consulter les notes de service et doctrines internes de la DSI (textes riches classés par catégorie, datés).
- **Comment ça marche** : table `hub.doctrines` (titre, contenu HTML Quill, catégorie libre, date, auteur) ; affichage cartes + recherche instantanée.
- **Indicateurs / KPI** : compteur de résultats de recherche.
- **Options & fonctionnalités** : CRUD complet, éditeur WYSIWYG, recherche plein texte (titre/catégorie/contenu).
- **Paramétrage** : aucun (catégories libres).
- **Interactions** : aucune dépendance technique (tuile portail).

> **📷 Captures d'écran**
> 1. Liste des doctrines — `[insérer capture]`
> 2. Éditeur d'une note — `[insérer capture]`

## 1.11 MagApp (portail applicatif & idées)

- **Accès / API** : `/admin/magapp` (administration) ; portail agent dédié `magapp-frontend` (port 5174) — API `/api/magapp/*` (categories, apps, favorites, clicks, subscribe, versions, docs, settings…) et `/api/admin/magapp/*`.
- **À quoi ça sert** : catalogue des applications métier présenté aux agents (favoris, docs, abonnements, maintenances planifiées) + boîte à idées modérée ; alimente le portail simplifié grand public.
- **Comment ça marche** : schéma `magapp.*` (`magapp_apps` avec url/url_test/icône/maintenance/chef de projet/flags mercator-onboard-dsi_only, catégories, favoris, clics timeline, abonnés e-mail, docs PDF/Youtube/liens, maintenances, idées) ; jointures temps réel vers `hub_tickets.tickets` (incidents par appli) et `oracle.oracle_links` (Mercator).
- **Indicateurs / KPI** : stats par appli (utilisateurs, docs, maintenances), timeline des clics, nb tickets par appli.
- **Options & fonctionnalités** : CRUD applis/catégories/icônes, versions, docs avec upload, maintenances planifiées (PJ), abonnements, favoris, droits par application (recherche AD), modération des idées, paramètres du portail.
- **Paramétrage** : `magapp.settings`, écran `/admin/magapp`, postgres-settings.
- **Interactions** : Tickets (stats/incidents), Contrats/Tiers, Oracle/Mercator, Hub (tuile-module), magapp-frontend (consommateur principal).

> **📷 Captures d'écran**
> 1. Catalogue MagApp (magapp-frontend) — `[insérer capture]`
> 2. Admin applications — `[insérer capture]`
> 3. Boîte à idées / modération — `[insérer capture]`

## 1.12 Automatisation e-mail & templates

- **Accès / API** : `/admin/email-automation` et `/admin/email-templates` — API `/api/admin/email-automation` (CRUD automations, destinataires, exécution, logs, alertes-tâches) et `/api/email-templates`.
- **À quoi ça sert** : créer des envois d'e-mails planifiés (ex. « calendrier DSI du jour ») vers des listes de destinataires, et gérer le catalogue de templates e-mail réutilisés par les autres modules.
- **Comment ça marche** : `hub.email_automations` (fréquence type `daily:08:00`, content_type `calendar_daily` ou URL, sujet avec `{{date}}`, condition d'envoi), destinataires manuels ou via recherche AD, logs d'envoi par destinataire. Templates avec variables `{{app_name}}`, `{{username}}`, etc.
- **Indicateurs / KPI** : dernière exécution, sent/failed, journaux.
- **Options & fonctionnalités** : activation/désactivation, exécution manuelle, import destinataires AD, consultation centralisée des mails envoyés.
- **Paramétrage** : dépend du SMTP global (§ 7.1 MailSettings : table `mail_settings`, kill-switch, mail de test) ; O365 Graph mutualisé (`o365_settings`, § 7.1).
- **Interactions** : Calendrier DSI (contenu quotidien), AD (destinataires), Consommables/Certificats/Contrats (templates transactionnels).

> **📷 Captures d'écran**
> 1. Liste des automatisations — `[insérer capture]`
> 2. Templates e-mail — `[insérer capture]`
> 3. Paramètres SMTP + kill-switch — `[insérer capture]`

## 1.13 GED & Documents (socle transverse)

- **Accès / API** : viewer `/documents` — API `/api/documents` (upload, versions, contenu, `.msg`, by-entity/by-module, soft-delete/purge) ; administration `/admin/ged` — API `/api/ged` (stockage filesystem/SMB, Alfresco, explorateurs, migration).
- **À quoi ça sert** : (a) GED centralisée versionnée où chaque module rattache ses fichiers ; (b) administration du stockage derrière cette GED (SMB et/ou Alfresco).
- **Comment ça marche** : `hub_docs.documents` (module + entité + version courante + JSONB + soft delete) et `document_versions` (fichier, mimetype, taille, backend, storage_ref, is_missing). Lecture avec auth header **ou** `?token=` (visionneuses/iframes). Prévisualisation structurée des e-mails Outlook `.msg` avec extraction des PJ embarquées. Côté admin : config Alfresco (`alfresco.url/username/password`), explorateur de nœuds, migration one-shot legacy (dryRun possible), récupération des fichiers mal rangés.
- **Indicateurs / KPI** : documents par module/version ; rapports de migration (migrés/manquants/erreurs).
- **Options & fonctionnalités** : versionning, suppression douce vs purge, listing par entité/module, tests de connexion Alfresco/SMB détaillés.
- **Paramétrage** : `/admin/ged` (stockage + Alfresco) ; `app_settings` (`alfresco.*`, `storage.*`).
- **Interactions** : Certificats (double écriture), Vols, Télécom (duplicatas), Stocks (signatures/gabarits), Backup (export fichiers).

> **📷 Captures d'écran**
> 1. Viewer documents — `[insérer capture]`
> 2. Admin GED : stockage & explorateur — `[insérer capture]`

---

# 2. Support & Helpdesk

## 2.1 Tickets (helpdesk)

> 📚 **Guides détaillés intégrés** : `docs/GUIDE-TECHNICIEN-TICKETS.md`, `docs/GUIDE-ADMIN-TICKETS.md`, `docs/GUIDE-STATISTIQUES-TICKETS.md` (accessibles aussi via le bouton « ? »).

- **Accès / API** : `/tickets` (traitement), `/tickets/stats`, `/admin/tickets` — API `/api/tickets`.
- **À quoi ça sert** : cœur du support DSI : réception, qualification, routage, traitement, clôture et mesure des demandes usagers.
- **Comment ça marche** :
  - Statuts : 1 Nouveau → 2 En cours (attribué) → 3 En cours (planifié) → 4 En attente (**SLA suspendu**) → 5 Résolu → 6 Clos ; 8 Rejeté = suppression logique ; clôture auto des Résolus après N jours (défaut 7, cron minuit).
  - Types Incident/Demande, priorités Très basse → Très haute (« Critique »), flag VIP.
  - Rôles module indépendants du rôle global : technicien, superviseur (vue globale + clôture des Problèmes), admin/superadmin ; l'utilisateur simple voit ses demandes.
  - Canaux d'entrée : saisie manuelle, Mail Collector (O365), Chat Live, MagApp, import GLPI (historique).
  - Commentaires publics/privés, observateurs, reformulation IA, « ✅ Solutionner » (solution documentée → base de connaissances), Problèmes + résolution en cascade, satisfaction.
- **Indicateurs / KPI** : vignettes-filtres (ouverts, en cours, en attente, critiques, résolus, problèmes, SLA dépassées) ; page stats : 6 cartes comparées au global + ~19 graphiques (tendance créés/résolus/backlog, SLA, charge technicien, âge backlog, heures de pointe, top demandeurs/logiciels, réouvertures…). Résolution moyenne exprimée en **temps ouvré**.
- **Options & fonctionnalités** : vues Table/Kanban/Inbox/Live, recherche plein texte + filtres riches, assignation/escalade tracée, tâches liées, PJ (images inline re-réécrites), réponses types, base documentaire.
- **Paramétrage** : tout dans `/admin/tickets` — catégories, transpositions GLPI, SLA (définitions/calendriers/dépassements), règles d'affectation (set_vip, boost_priority…), VIP, groupes, escalade, permissions, templates × déclencheurs, Live, résolution auto.
- **Interactions** : Mes tâches, Parc (équipements du demandeur par email), MagApp (documents suggérés), Mail Collector, Live, Auto-résolution, notifications e-mail, DSI Dashboard.

> **📷 Captures d'écran**
> 1. Dashboard tickets (vignettes + liste) — `[insérer capture]`
> 2. Fiche ticket (fil + panneau latéral) — `[insérer capture]`
> 3. Vue Kanban — `[insérer capture]`
> 4. Administration (règles SLA/affectation) — `[insérer capture]`
> 5. Statistiques helpdesk — `[insérer capture]`

## 2.2 Collecteur de mails O365 (Mail Collector)

- **Accès / API** : admin onglet **Collecteur** de `/admin/mail` (boîtes / règles de classification / logs) — API `/api/mail-collector` ; prérequis : O365 (`Mail.Read`, `Mail.Read.Shared`) configuré dans `/admin/o365-mail`.
- **À quoi ça sert** : transformer automatiquement les e-mails reçus sur des boîtes O365 surveillées en tickets (et les réponses en commentaires).
- **Comment ça marche** : `hub_tickets.mail_collectors` (fréquence every_15_min/hourly/4_hours/daily/manual), `mail_rules`, `mail_collector_logs`, déduplication par `email_message_id`. Flux : récupération depuis last_run → filtre domaine → si `RE:`/`In-Reply-To` = commentaire sur le ticket d'origine, sinon création de ticket (source « mail », classification par règles mots-clés). Destinataires To/Cc ajoutés comme observateurs ; PJ téléchargées (max 20/mail, whitelist MIME). **Images inline** : rapatriées même quand `hasAttachments=false` (test `cid:` dans le corps) et références `cid:` réécrites vers `/api/tickets/{id}/attachments/{attId}`.
- **Indicateurs / KPI** : par boîte (exécutions, emails, tickets créés, commentaires, dernière collecte) ; par run (reçus/importés/ignorés/échoués, PJ, erreurs).
- **Options & fonctionnalités** : collecte manuelle, purge des logs, ré-import des PJ d'un ticket existant (`POST /reprocess-ticket/:ticket_id`), purge tickets invalides, reset règles (jeux par défaut semés).
- **Paramétrage** : boîtes + fréquences + règles dans `/admin/mail` ; O365 mutualisé avec copieurs.
- **Interactions** : Tickets (canal n°1), Azure AD/O365 (Graph), templates de notification, hub.users.

> **📷 Captures d'écran**
> 1. Boîtes surveillées — `[insérer capture]`
> 2. Règles de classification — `[insérer capture]`
> 3. Logs d'import — `[insérer capture]`

## 2.3 Auto-résolution (relances d'inactivité & clôture auto)

- **Accès / API** : admin onglet **🤖 Résolution auto** de `/admin/tickets` (Réglages / Logs / Tickets en attente / Test) — API `/api/auto-resolution` ; page publique `/auto-resolution/keep-alive/:token`.
- **À quoi ça sert** : traiter les **tickets sans nouvelles du demandeur** : relance régulière (« toujours d'actualité ? »), confirmation en un clic, puis clôture automatique faute de réponse.
- **Comment ça marche** : réglages (singleton `hub_tickets.auto_resolution_settings`) : jours d'inactivité, max de relances (défaut 3), fréquence entre relances (défaut 7 j), notification observateurs, messages personnalisables. Cron quotidien 2 h : relance au seuil d'inactivité, puis espacée jusqu'au max → clôture auto (statut 7 « Fermé », historique, mail). Le mail contient un lien unique signé (jeton usage unique) ; la confirmation exige un commentaire (ajouté publiquement, **priorité +1**, sortie du processus, mail de remerciement).
- **Indicateurs / KPI** : relances envoyées / clôturés / confirmés / erreurs ; tickets en attente avec nb de relances ; journal (`reminder_sent`/`keep_alive`/`closed`).
- **Options & fonctionnalités** : exécution manuelle immédiate, simulation ciblée sur un email, copies aux observateurs.
- **Paramétrage** : onglet dédié (droits `authenticateTicketAdmin`) ; URL des liens via `app_base_url`.
- **Interactions** : Tickets (statuts/priorités/commentaires/observateurs), Mail, page publique.

> **📷 Captures d'écran**
> 1. Réglages auto-résolution — `[insérer capture]`
> 2. E-mail de relance reçu par l'usager — `[insérer capture]`
> 3. Page publique keep-alive — `[insérer capture]`

## 2.4 Chat Live (support temps réel)

- **Accès / API** : widget usager intégré + panneau techniciens (vues Tickets/Live) — API `/api/live` + Socket.IO.
- **À quoi ça sert** : messagerie instantanée entre usagers (agents, écoles) et techniciens DSI : chaque conversation crée automatiquement un ticket lié, se fait prendre en charge, et se clôt avec transcript par mail + satisfaction.
- **Comment ça marche** : authentification souple (invité, AD, OTP mail, token SMS JWT 5 min pour liens reçus par SMS) ; session créée avec ticket (`is_live=true`, titre « 💬 Live – … », statut waiting) → notification Socket.IO aux techniciens → claim → chat temps réel (rooms, repli REST) → close (transcript HTML + mail résumé) → note de satisfaction. Canaux `ville` et `ecole` (alerte SMS Frizbi au groupe « Ecoles »). Ouverture conditionnée par horaires (calendrier SLA partagé).
- **Indicateurs / KPI** : sessions total/aujourd'hui/semaine/mois, actives, **durée moyenne**, **délai moyen de prise en charge**, top 10 techniciens, volume 30 j, satisfaction.
- **Options & fonctionnalités** : PJ (20 Mo), dictée vocale, emojis, reformulation IA, message d'urgence, classification Incident/Demande imposée avant clôture, rejet de session, personnalisation widget (nom/logo/couleurs), intégration WhatsApp.
- **Paramétrage** : `hub_tickets.module_config` (`live_enabled`, `live_use_schedule`, `live_calendar_id`, `live_closing_message`, `chat_*`, `whatsapp_*`) — onglet Live de `/admin/tickets`.
- **Interactions** : Tickets (ticket lié, calendriers SLA, groupes), Chat École, Frizbi, Mail, AD.

> **📷 Captures d'écran**
> 1. Widget chat usager — `[insérer capture]`
> 2. Panneau technicien sessions Live — `[insérer capture]`
> 3. Réglages Live (admin) — `[insérer capture]`

## 2.5 Chat École (console techniciens)

- **Accès / API** : `/chatecole` (routée sous /tickets) — s'appuie sur le module Live (`chat_type='ecole'`).
- **À quoi ça sert** : console dédiée aux techniciens pour prendre en charge les chats initiés par les écoles (directeurs), souvent ouverts depuis le lien reçu par SMS.
- **Comment ça marche** : connexion socket `tech_watch` → nouvelle session notifiée en direct → prise en charge (claim, force possible) → conversation temps réel adossée à un **ticket lié**. Ouverture par lien SMS `?st=<token>` → JWT court → reprise de la session en attente.
- **Indicateurs / KPI** : sessions en attente/actives, badge présence de l'interlocuteur.
- **Options & fonctionnalités** : PJ, dictée vocale, emojis, reformulation IA, classification Incident/Demande avant clôture, rejet, clôture avec transcript/résumé à l'usager, vue responsive mobile.
- **Paramétrage** : réglages Live + groupe techniciens destinataires SMS « Ecoles ».
- **Interactions** : Live, Tickets, Frizbi, AD.

> **📷 Captures d'écran**
> 1. Console Chat École — `[insérer capture]`

## 2.6 Réponse publique par lien e-mail

- **Accès / API** : page publique `/repondre/:token` (sans authentification) — API `GET|POST /api/public/reply/:token`.
- **À quoi ça sert** : permettre au demandeur de répondre au technicien directement depuis l'e-mail de notification, sans compte Hub.
- **Comment ça marche** : jeton `base64url(ticketId|email|timestamp)` signé HMAC-SHA256 injecté dans `{{reply_url}}` du template `ticket_comment_reply` quand un technicien envoie son commentaire par e-mail. Le GET affiche ticket + dernier message public ; le POST ajoute la réponse comme commentaire public au nom du demandeur.
- **Indicateurs / KPI** : aucun (la réponse apparaît dans le fil du ticket).
- **Options & fonctionnalités** : aperçu repliable de la description, encart « Message du technicien », états erreur/expiration lisibles.
- **Paramétrage** : template `ticket_comment_reply` (onglet Templates de `/admin/tickets`).
- **Interactions** : Tickets (commentaires, SLA première réponse), Mail.

> **📷 Captures d'écran**
> 1. Page de réponse publique — `[insérer capture]`

---

# 3. Parc, mobilité & infrastructure

## 3.1 Parc informatique

- **Accès / API** : `/parc` — API `/api/parc` (deux sources commutables : `live` GLPI 10 direct / `hub` synchronisé, cache 5 min) + `/api/deploiements` (onglet Déploiements).
- **À quoi ça sert** : inventaire complet du matériel issu de GLPI 10 enrichi AD : qualité des données, valeur du parc, vues stock/usagers/géo, déploiements, postes AD, étiquettes.
- **Comment ça marche** : synchro items+infocom+OS+réseau+documents vers `hub_parc.items` (JSONB raw) ; enrichissements croisés AD (dernier contact coloré <30j/30-90j/>90j), correction contact usager via lookup AD, fusion des doublons de série. Onglets : dashboard | list | stock | usagers | geo | deploiements | ad | lignes | etiquette. L'onglet Déploiements exploite les fiches NAS (KPIs, correspondances/conflits, fusion installateurs).
- **Indicateurs / KPI** : total parc et valeur € ; taux d'affectation ; qualité de données (série/inventaire/lieu, doublons) ; âge moyen + machines ≥ 5 ans (pyramide) ; répartitions statut/groupe/lieu/fabricant/modèle/OS ; ajouts vs déploiements par an ; ratios écrans/PC.
- **Options & fonctionnalités** : filtres très riches (lieu, statut, fabricant, fournisseur, affecté, fraîcheur AD/GLPI…), tri, pagination, vue Stock groupée, vue Usagers drill-down, vue Geo, import ordinateurs AD planifié, étiquettes imprimables (logo configurable).
- **Paramétrage** : credentials GLPI 10, `ad_settings`, logo étiquettes (clé `etiquette.logo_path`).
- **Interactions** : **Tickets** (« équipements du demandeur » via `/api/parc/hub/by-email`), **Stocks** (catalogue = `hub_parc.items`), **Mobilité/Lignes mobiles/Vols** (mêmes tables), Déploiements, AD/RH.

> **📷 Captures d'écran**
> 1. Dashboard parc — `[insérer capture]`
> 2. Liste filtrable — `[insérer capture]`
> 3. Vue géographique — `[insérer capture]`
> 4. Onglet Déploiements — `[insérer capture]`

## 3.2 Mobilité (téléphones & tablettes)

- **Accès / API** : onglet « Téléphones et tablettes » de `/parc` — API `/api/mobilite`.
- **À quoi ça sert** : cycle de vie des terminaux mobiles : entrée en stock, attribution en deux phases avec fiche PDF signée, retour rapide/formalisé, rebut, historique événementiel.
- **Comment ça marche** : `hub_parc.mobilite_devices` (dernier état, clé IMEI/STOCK) + `mobilite_events`. Entrée en stock via une **réception Stocks** → saisie IMEI → attribution phase 1 (Dotation/Mise à disposition/Prêt/Cession, agent **ou service** organigramme, état, ligne, retour si prêt) → phase 2 remise (signature tactile ou fiche scannée ; PDF depuis gabarits Stocks) → attribué/sorti → retour 1-clic ou riche. Permissions par rôle magasin (viewer/operator/manager via Stocks). Import Excel destructif (manager).
- **Indicateurs / KPI** : total/actifs/inactifs, familles, SIM/MDM/ligne, retours cumulés, cadence mensuelle 12 mois (dotations, prêts, retours, vols), top modèles.
- **Options & fonctionnalités** : filtres/tris/pagination, buckets Stock/Rebut, prêts avec échéance, fiches PDF, édition descriptifs.
- **Paramétrage** : bootstrap idempotent — magasin **DSI-MOB « DSI - Mobilité »** (`hub_stocks.stores`), fond PDF et gabarits Remise/Retour (modifiables dans `/stocks/admin` > Modèles).
- **Interactions** : Stocks (réceptions, serial_items, gabarits), Lignes mobiles (réconciliation), RH/organigramme Oracle, Vols (recherche appareils).

> **📷 Captures d'écran**
> 1. Liste appareils — `[insérer capture]`
> 2. Attribution phase 1 / signature phase 2 — `[insérer capture]`

## 3.3 Lignes mobiles (forfaits / SIM)

- **Accès / API** : onglet du parc (vue lignes | reco) — API `/api/lignes-mobiles` (list, kpis, reconciliation, import).
- **À quoi ça sert** : référentiel des lignes mobiles SFR (forfaits, SIM, titulaires, engagements) importé de l'export opérateur, et **rapprochement automatique** lignes ↔ appareils Mobilité.
- **Comment ça marche** : import Excel **remplace intégralement** `hub_parc.lignes_mobiles` (TRUNCATE + insert transactionnel, raw_data conservé). La réconciliation croise par IMEI puis numéro et produit des désalignements typés avec gravité/action recommandée (ligne sans appareil, IMEI divergent, titulaire divergent, appareil sans ligne…).
- **Indicateurs / KPI** : total lignes, répartition par statut, dernier import ; réconciliation : appareils rapprochés, désalignements par type/gravité.
- **Options & fonctionnalités** : recherche plein texte, filtre statut, import avec confirmation destructive, vue anomalies.
- **Paramétrage** : aucun.
- **Interactions** : Mobilité (contrepartie), RH Encadrants (téléphones proposés).

> **📷 Captures d'écran**
> 1. Liste lignes mobiles — `[insérer capture]`
> 2. Rapport de réconciliation — `[insérer capture]`

## 3.4 Vols (dossiers vol / perte / casse)

- **Accès / API** : `/vols` — API `/api/vols` (CRUD, `/:id/dpd`, documents, commentaires).
- **À quoi ça sert** : suivi des dossiers d'incident matériel : déclaration circonstanciée, PJ administratives (déclaration de vol/perte, récépissé de plainte…), avancement jusqu'au remboursement/clôture, indicateur DPD informé.
- **Comment ça marche** : `hub_vols.thefts` (+ documents, commentaires) ; lien optionnel vers un bien du parc/mobilité (prérempli via assistant de recherche) ; workflow `declare → plainte_deposee → en_cours → rembourse/classe_sans_suite/clos` ; documents stockés + enregistrés en GED.
- **Indicateurs / KPI** : compteurs par type, évolution mensuelle (nombre + montant), compteurs de statut.
- **Options & fonctionnalités** : toggle « DPD informé », filtres/tri, documents typés, commentaires horodatés, numéros de ticket cliquables.
- **Paramétrage** : aucun.
- **Interactions** : Parc, Mobilité, Tickets, GED/storage.

> **📷 Captures d'écran**
> 1. Liste des dossiers — `[insérer capture]`
> 2. Dossier détaillé (PJ + statut) — `[insérer capture]`

## 3.5 Copieurs (+ KPI)

- **Accès / API** : `/copieurs` et `/copieurs/kpi` — API `/api/copieurs`.
- **À quoi ça sert** : parc des copieurs/multifonctions Ville & écoles : fiche machine, relevés de compteurs (N&B/couleur) et coûts facturés, interventions SAV, visites terrain, carte Leaflet.
- **Comment ça marche** : `hub_copieurs.*` (copieurs, visites + photos, relevés trimestriels, compteur_codes + tarifs datés). Import Excel annuel ou **collecte SNMP** (test unitaire, walk, collecte globale async avec progression, cron interne) → deltas entre relevés → coût = delta × tarif applicable. Import des e-mails SAV du mainteneur via Graph → interventions par copieur. Ping en masse, géocodage api-adresse.data.gouv.fr.
- **Indicateurs / KPI** (page KPI) : totaux pages/coûts, ratio couleur/NB, évolution annuelle + projection, répartition par direction/code compteur, Top 10 volume, Top croissance/décroissance %, alertes « sans relevé récent » et « compteur décroissant » (anomalie SNMP).
- **Options & fonctionnalités** : imports Excel (parc, archives, relevés, PaperCut, Kpax), historique déménagements, visites photo (≤10), relevés trimestriels CRUD, carte + boundary.
- **Paramétrage** : écran intégré codes compteur/tarifs ; O365 pour e-mails SAV (`o365_settings`).
- **Interactions** : O365/Graph, storage (photos), DSI Dashboard (widgets copieurs), arbitrages contrats.

> **📷 Captures d'écran**
> 1. Liste copieurs — `[insérer capture]`
> 2. Fiche copieur (relevés + SAV) — `[insérer capture]`
> 3. Carte Leaflet — `[insérer capture]`
> 4. Page KPI — `[insérer capture]`

## 3.6 Consommables

- **Accès / API** : `/consommables` — API `/api/consumable` (badge `pending-count`).
- **À quoi ça sert** : portail de commande de consommables (toners…) : catalogue navigable + panier persistant, puis cycle de vie des demandes (à valider → validée → commandée → archivée) avec e-mails automatiques.
- **Comment ça marche** : `hub_consommables.consumable_types/catalog/requests/request_articles/designation_images`. Formulaire guidé 5 étapes (infos demandeur issues de l'organigramme RH ou écoles → type → imprimante → articles → récap). Droits : tous commandent ; admin consommables = rôle admin **ou** `/consommables` dans authorized_urls. Templates transactionnels SQLite (`consumable_confirmation/validated/ordered/modified`).
- **Indicateurs / KPI** : badge en attente sur le dashboard ; onglet Récap (cumuls année/mois, nb commandes, montants TTC mensuels).
- **Options & fonctionnalités** : panier localStorage, onglets admin (à valider/commander/commandées/archivées), modification quantités, import catalogue Excel, ajout unitaire/en masse, anti-suppression article utilisé, images par désignation (`DesignationImagesManager`).
- **Paramétrage** : onglet Catalogue, onglet Images, templates e-mail.
- **Interactions** : organigramme RH + écoles, mail commun, presence badges, storage.

> **📷 Captures d'écran**
> 1. Catalogue + panier — `[insérer capture]`
> 2. File de validation admin — `[insérer capture]`
> 3. Récap budgétaire — `[insérer capture]`

## 3.7 Stocks

- **Accès / API** : `/stocks` (+ `/stocks/admin`, `/stocks/reception`, `/stocks/series`, `/stocks/sortie`, `/stocks/prets`) — API `/api/stocks` (architecture routes/controller/services/repositories/middleware).
- **À quoi ça sert** : stocks multi-magasins d'équipements IT : seuils d'alerte, mouvements traçés, réceptions avec scan code-barres, sorties avec BL PDF signé, prêts, numéros de série, prévision de rupture.
- **Comment ça marche** : `hub_stocks.*` (stores, store_members, locations, stock_levels séparés normal/prêt, movements in/out/transfer/adjust/loan_*, receptions(+lines), serial_items, deliveries, loans, bl_templates). Droits par magasin via `resolveStoreRole` : viewer < operator < manager (admin global = manager partout), lookup par username. Workflows : Réception (scan EAN → validation = entrée + items sérialisés) ; Sortie (BL préparé → signature → mouvement out + PDF) ; Prêt (sortie stock dédié + signature, retour = inverse).
- **Indicateurs / KPI** : quantités par article, seuils mini franchis (alertes rouges), derniers mouvements ; prévision : conso moyenne/jour, jours avant rupture, sévérité ok/warning/critical/rupture.
- **Options & fonctionnalités** : scan caméra, lookup EAN UPCitemdb (cache 24 h), gabarits BL uploadés + designer de zones variables (pdf-lib), signature tactile, bénéficiaire AD avec badge présence, association aux commandes budgétaires (proxy finance).
- **Paramétrage** : `/stocks/admin` (Magasins/Lieux/Membres/Modèles BL), seuils mini éditables.
- **Interactions** : Parc (catalogue `hub_parc.items`), Finance/Budget, GED (signatures, gabarits), Mobilité (magasin DSI-MOB).

> **📷 Captures d'écran**
> 1. Dashboard stocks (alertes seuils) — `[insérer capture]`
> 2. Réception avec scan — `[insérer capture]`
> 3. Sortie + signature BL — `[insérer capture]`
> 4. Admin magasins/membres — `[insérer capture]`

## 3.8 Réseau

- **Accès / API** : `/reseau` — API `/api/network` (+ plans `/api/maps/dxf/*`).
- **À quoi ça sert** : cartographie du réseau inter-sites (liens fibre/WAN/opérateur/laser, fourreaux, stacks IRF, équipements, VLANs, liaisons FO) en carte Leaflet ou graphe de topologie, avec superposition des plans DXF.
- **Comment ça marche** : `hub_reseau.*` (network_links, network_access, ducts, irf_stacks, equipements, vlans, liaisons_fo, switch_links) ; sites référencés par `hub.sites.code_bien` (GeoJSON, tracé auto). Lecture pour tous ; écritures réservées admin. Synchro partielle depuis l'API Infra externe (`infra_apis` clé `reseau_links`) : purge/réinjection manuelle ou cron quotidien.
- **Indicateurs / KPI** : nb liens switchs (total/intra/inter-sites), équipements, VLANs actifs, sites connectés ; état switchs par site (PROD-BACKUP ok/HS).
- **Options & fonctionnalités** : onglets Carte (layers, dessin de lien en 2 clics)/Liens/IRF/Équipements/VLANs/FO/Sites/Stats, topologie graphique alternative, import DXF avec calques/styles persistés, filtres recherche.
- **Paramétrage** : API source `reseau_links` dans `/admin/infra` ; enums contrôleur (opérateurs LINKT/MOJI/RED/SFR, statuts PROD/BACKUP/HS).
- **Interactions** : Infra (synchro), hub.sites (référentiel partagé copieurs/cartes), plans DXF.

> **📷 Captures d'écran**
> 1. Carte réseau — `[insérer capture]`
> 2. Topologie — `[insérer capture]`
> 3. Onglet VLANs/FO — `[insérer capture]`

## 3.9 Inventaire & sécurité des postes (admin)

- **Accès / API** : `/admin/inventaire` — proxy `/api/admin/inventaire/*` vers une API externe « Inventaire IRS » (configurée par `inventaire_ip`/`inventaire_key`).
- **À quoi ça sert** : supervision lecture seule : postes (hardware + logiciels), hôtes réseau, alertes, incidents, vulnérabilités CVE/CVSS, événements SIEM.
- **Comment ça marche** : proxy générique transférant vers l'API externe ; frontend en onglets Postes/Hôtes/Alertes/Incidents/Vulnérabilités/SIEM avec fiche poste en 3 volets (infos, hardware, packages).
- **Indicateurs / KPI** : badges de sévérité, statuts en ligne/hors ligne/patché, dernière seen.
- **Options & fonctionnalités** : recherche/filtres, tableaux génériques, aucune écriture (pur monitoring).
- **Paramétrage** : clés `inventaire_ip`/`inventaire_key` dans `/admin/settings` (`app_settings`).
- **Interactions** : complément du Parc (vue sécurité temps réel vs inventaire GLPI).

> **📷 Captures d'écran**
> 1. Onglet Postes — `[insérer capture]`
> 2. Vulnérabilités — `[insérer capture]`

---

# 4. Télécom & finances

## 4.1 Télécom

- **Accès / API** : `/telecom` (7 onglets) — API `/api/telecom`.
- **À quoi ça sert** : pilotage des coûts télécom : opérateurs/comptes, factures **rapprochées en direct** avec le budget Oracle, inventaire lignes fixes/internet (fin du cuivre), coûts mobiles issus des exports SFR. Finalité : optimisation (lignes dormantes, résiliées encore facturées, hors inventaire).
- **Comment ça marche** : `hub_telecom.*` (operators liés tiers Oracle, billing_accounts, invoices + rejected_invoices, lines MID/NDI, line_billing, billing_trend 13 mois, invoice_files PDF). Factures : import Excel « suivi » ou rattachement en un clic depuis les factures proposées par le budget Oracle (match code tiers + libellés) ; montants recalculés en direct sur Oracle (LEFT JOIN LATERAL). Mobile : import ZIP SFR Business (CSV synthese/lmdetail/13mois, parseur dédié) → remplacement de période ; duplicatas PDF indexés.
- **Indicateurs / KPI** : total HT/mois, estimation annuelle, coût mobile vs fixe/data, **lignes dormantes** (coût + ancienneté sans conso), top 15 lignes chères, coût par site/liste, tendance 13 mois ; lignes fixes : total/fixe/internet/en service/résiliation/à migrer cuivre ; rapprochement : résiliées facturées, non facturées, hors inventaire.
- **Options & fonctionnalités** : CRUD opérateurs/comptes/factures, commentaire mensuel par compte, rejet motivé définitif, engagements nature **6262** lus dynamiquement, fiche ligne avec historique 12 mois glissants.
- **Paramétrage** : structure issue des imports + référentiel Oracle ; écritures réservées admin.
- **Interactions** : Oracle (gf_oracle_facture, gf_oracle_tiers, budget_engagements), Budget (atterrissage 6262 partagé), GED (PDF), DSI Dashboard.

> **📷 Captures d'écran**
> 1. Synthèse coûts — `[insérer capture]`
> 2. Rapprochement factures — `[insérer capture]`
> 3. Inventaire lignes fixes — `[insérer capture]`

## 4.2 Suivi budgétaire & commandes (/budget)

- **Accès / API** : `/budget` (onglets synthèse, lignes, engagements, opérations, gestion, préparation, tiers, commandes) — API `/api/budget/operations`, import Excel → `oracle.budget_lines` (export SEDIT), field-mapping `/api/finance/field-mapping/*`.
- **À quoi ça sert** : suivre l'exécution budgétaire annuelle (voté, engagements, bons de commande, factures, paiements) par section F/I, service et nature ; centraliser le rapprochement commandes/factures SEDIT/Oracle.
- **Comment ça marche** : données d'un import Excel + flux comptables Oracle ; classement F/I via règle M57 (nature commençant par 2 = Investissement). Moteur de **rubriques mappées** : toute table PG exposable comme tableau configurable (variables champ simple ou expression SQL whitelistée, jointures, types d'affichage) — composant générique réutilisable.
- **Indicateurs / KPI** : budget alloué total, total commandé/facturé TTC, voté F/I, disponible après reports ; engagements sans BC, reports/rattachements, soldés/partiels ; réalisé F/I vs prévu + taux de consommation ; ventilation factures (états 10/20/30, suspendues).
- **Options & fonctionnalités** : sélecteur d'année fiscale, bascule périmètre « Ville », modale Plan M57 (par nature/fonction), exports, filtres, tableaux de rubriques mappées.
- **Paramétrage** : écran admin Finance (rubriques : schéma/table/colonne année/liens SEDIT ; variables : expression SQL guidée, aperçu avant enregistrement).
- **Interactions** : Budget-préparation (onglet), Contrats (liaison commandes), Tiers (rubrique mappée), MagApp (affectation d'applications aux lignes).

> **📷 Captures d'écran**
> 1. Synthèse budgétaire — `[insérer capture]`
> 2. Engagements — `[insérer capture]`
> 3. Admin rubriques/variables — `[insérer capture]`

## 4.3 Préparation budgétaire

- **Accès / API** : onglet « Préparation » de `/budget` — API `/api/budget-prep/*` (facets, data, line-detail, imports ; import Excel ≤ 20 Mo réservé Finances/admin).
- **À quoi ça sert** : construire le budget N+1 par service en important une proposition Excel et en la comparant au réalisé courant ; une proposition unique par service/année.
- **Comment ça marche** : `hub_budget_prep.imports` + `facts` (chapitre, fonction, article, dépenses/recettes…) ; cas particulier nature télécom **6262** projetée depuis l'atterrissage annuel Télécom (pas depuis les contrats).
- **Indicateurs / KPI** : montants proposés par service/chapitre/fonction/article, comparaison proposition vs réalisé, nb de lignes importées.
- **Options & fonctionnalités** : import/remplacement de proposition, facettes filtrables, détail de ligne, historique des imports.
- **Paramétrage** : aucun écran dédié.
- **Interactions** : lit `hub_contrats.contrats` (reconductions), Télécom (6262), Finance (utilitaires).

> **📷 Captures d'écran**
> 1. Proposition budgétaire par facette — `[insérer capture]`

## 4.4 Rencontres budgétaires

- **Accès / API** : `/rencontres-budgetaires` (token accepté en query string pour ouvrir les liens des mails) — API `/api/rencontres-budgetaires` (+ stats directions/années, réunions, directions-services, direction-emails).
- **À quoi ça sert** : gérer les demandes soumises aux rencontres budgétaires annuelles (arbitrage DSI/métiers) et organiser les réunions associées : convocation, événement Outlook/Teams, compte-rendu diffusé, suivi des décisions.
- **Comment ça marche** : `rencontres_budgetaires` (type incident/demande/projet/autre, coût TTC, arbitrage, responsable DSI, ticket lié, statut demandée→planifiée→effectuée), `rencontres_reunions` (participants métier/DSI, présents/excusés, event id Outlook, Teams), `reunion_attachments`, `direction_emails`. Workflow : import Excel ou création → génération de réunions → participants via AD → invitation Outlook/Teams → compte-rendu par mail avec PJ → reprogrammation notifiée. Scoping automatique : chaque utilisateur ne voit que ses directions attribuées.
- **Indicateurs / KPI** : stats par direction et par année, compteurs d'emails par direction.
- **Options & fonctionnalités** : filtres direction/année/statut/arbitrage, colonnes configurables, création d'un ticket depuis une demande, invitations/compte-rendus, badges présence.
- **Paramétrage** : modale « Emails par direction » (mapping direction/service ↔ emails, unitaire ou par lot).
- **Interactions** : Tickets, Outlook/O365, AD, RH Studio (présence).

> **📷 Captures d'écran**
> 1. Liste des demandes — `[insérer capture]`
> 2. Détail réunion (participants + CR) — `[insérer capture]`

## 4.5 Contrats

- **Accès / API** : `/contrats` — API `/api/contrats` (badge `expiry-count`, import/export Excel, documents, renouvellement, liaison commandes, vues sauvegardées).
- **À quoi ça sert** : parc de contrats (maintenance, licences, prestations) : échéances, montants annuels/prévisions, reconductions, SLA, pièces contractuelles ; alertes expirés/à échéance ; liaison aux engagements/commandes budgétaires.
- **Comment ça marche** : SQLite `contrats`, `contrat_documents`. Un contrat porte fournisseur (tiers), application liée, dates/durée/reconductions, montants 2022→2029, GTI/GTR/pénalités, niveaux SLA (JSON), statuts actif/archivé + renouvellement avec successeur. Documents via storage + double enregistrement `hub_docs`. Modification réservée admin ou rôle « contrats ».
- **Indicateurs / KPI** : compteur contrats expirés (badge rouge filtrant), échéances ≤ 90 j (orange), état d'engagement 2026 (engagés/non engagés).
- **Options & fonctionnalités** : formulaire complet (SLA, reconduction), archivage, PJ multiples avec document principal, liaison BC (pastille → fiche SEDIT), colonnes personnalisables persistantes, vues partagées, filtres direction/type/ligne.
- **Paramétrage** : aucun écran dédié ; rôle « contrats », import initial admin.
- **Interactions** : Tableau de bord (badges), Budget-préparation (montants/projections), Finance/SEDIT, Tiers, MagApp.

> **📷 Captures d'écran**
> 1. Grille contrats avec badges — `[insérer capture]`
> 2. Fiche contrat (SLA + PJ) — `[insérer capture]`

## 4.6 Tiers (référentiel fournisseurs)

- **Accès / API** : `/tiers` (mode embarqué possible) — API `/api/tiers` (recherche paginée sur `oracle.gf_oracle_tiers`), contacts et historique par tier.
- **À quoi ça sert** : consulter le référentiel fournisseurs Oracle : identification (code, SIRET, nature juridique), contacts locaux, historique commandes/factures. Base de désignation du fournisseur pour Contrats/Achats.
- **Comment ça marche** : interrogation directe d'Oracle (lecture seule) ; contacts gérés localement (CRUD, flag « destinataire des commandes ») ; historique groupé par commande avec factures rapprochées consultables.
- **Indicateurs / KPI** : compteurs implicites (résultats, contacts, commandes/factures).
- **Options & fonctionnalités** : recherche multi-champs paginée, fiche détaillée, carnet de contacts, historique, configuration des colonnes (visibilité/ordre/style).
- **Paramétrage** : aucun.
- **Interactions** : Contrats, Finance/Budget, achats SEDIT.

> **📷 Captures d'écran**
> 1. Recherche tiers — `[insérer capture]`
> 2. Fiche + contacts — `[insérer capture]`

---

# 5. Projets & pilotage

## 5.1 Portefeuille projets

- **Accès / API** : `/portefeuille-projets` — API `/api/projets` (stats, mes-projets, favoris, journal-global, planning-global).
- **À quoi ça sert** : vue d'ensemble centralisée : idées, demandes initiales, études, projets en cours/clôturés ; point d'entrée vers fiche détaillée, planning et journal globaux.
- **Comment ça marche** : `projets.projets` (code auto, statut, niveau, service pilote, priorité, avancement, météo, parent/mini-projets). Cycle : idée → demande_initiale → etude_dsi → arbitrage → planification → en_cours → en_recette → en_cloture → cloture (+ refuse), transitions contrôlées par les étapes actives (`projet_etapes`) et la complétude documentaire. Droits : admins = tout ; sinon projets où l'on intervient (`projet_roles`) ou partagés (`projet_visibilite`) ; **PMO** (tuile 24) scopés services/secteurs/directions (`pmo_assignments`, `chef_projet_services`).
- **Indicateurs / KPI** : total projets, score moyen, alertes documentaires, alertes retard ; répartitions par statut/service/niveau/priorité ; score coloré (≥50 vert / ≥30 orange / rouge), barres d'avancement, infobulle ⚠️ tâches/jalons en retard.
- **Options & fonctionnalités** : recherche, filtres, tri, favoris, création (modale), administration scoring/types documentaires/registre chefs de projet, gestion PMO (périmètres, agents), badges présence.
- **Paramétrage** : écrans intégrés ; tables `projet_scoring_config` (10 critères pondérés seedés), `projet_types_documentaires`, `chef_projet_services`, `pmo_assignments`, `projet_etapes`.
- **Interactions** : Revue de projets, Planning général, Log projets, Mes tâches, Mes réunions/Transcript, DSI Dashboard.

> **📷 Captures d'écran**
> 1. Portefeuille (cartes KPI + tableau) — `[insérer capture]`
> 2. Création projet — `[insérer capture]`

## 5.2 Fiche projet

- **Accès / API** : `/projets/:id` — API complète (transitions, contrôles, rôles, visibilité, documents/versions, réunions, revues, tâches, jalons, groupes, dépendances, scores, indicateurs, journal).
- **À quoi ça sert** : outil quotidien du chef de projet : identification, acteurs, planning, documents, réunions, revues, tâches, scoring, indicateurs.
- **Comment ça marche** : 10 onglets. Transitions de phase proposées selon `projet_etapes` + checklist documentaire, exigent un commentaire et sont journalisées. Rôles projet (chef de projet, commanditaire, responsable DSI, représentant métier, DPO, équipe) ; édition réservée chef de projet/PMO/admins. Gantt par projet avec jalons, groupes colorés, dépendances vérifiées automatiquement. Toggle « inclure les sous-projets ».
- **Indicateurs / KPI** : score /100 recalculé (Σ note/5 × poids), checklist documentaire ✅/⚠️, indicateurs saisis, avancement, météo, retards.
- **Options & fonctionnalités** : Gantt complet, documents typés versionnés + import vrac, réunions, revues avec commentaire, tableau des tâches, journal horodaté.
- **Paramétrage** : onglet Admin (rôles, types documentaires attendus par phase) ; tables `projets.projet_roles/_visibilite/_transitions/_documents/_versions_document/_scores/_indicateurs/_taches/_jalons/_groupes_taches/_dependances`.
- **Interactions** : Log projets, Mes tâches, Mes réunions, Transcript Manager, Revues.

> **📷 Captures d'écran**
> 1. Vue générale fiche — `[insérer capture]`
> 2. Gantt projet — `[insérer capture]`
> 3. Documents versionnés — `[insérer capture]`

## 5.3 Revue de projets

- **Accès / API** : `/revue-de-projets` — API `/api/revues` (+ projets, commentaires, tâches).
- **À quoi ça sert** : préparer et animer les revues périodiques du portefeuille : sélection des projets, commentaire par projet, tâches de suivi ; convocations e-mail HTML.
- **Comment ça marche** : `hub_rencontres.revues`, `revue_projets` (commentaire), `revue_taches`. Création/modif réservée PMO (tuile 24) et admins ; commentaires de la revue précédente reprposables ; tâche dupliquable dans `projets.projet_taches`.
- **Indicateurs / KPI** : nb projets convoqués, nb tâches générées.
- **Options & fonctionnalités** : titre/date/participants/observateurs, sélection projets + éditeur riche, liste tâches responsable/échéance, envoi convocations.
- **Paramétrage** : aucun écran dédié.
- **Interactions** : Portefeuille, Mes tâches (source `revue`), service mail.

> **📷 Captures d'écran**
> 1. Préparation d'une revue — `[insérer capture]`

## 5.4 Planning général

- **Accès / API** : `/planning-general` — API `GET /api/projets/planning-global`.
- **À quoi ça sert** : Gantt consolidé des tâches/jalons de tous les projets visibles : charge, chevauchements. Lecture seule.
- **Comment ça marche** : agrégation serveur des tâches/jalons (titre/code projet), rendu horizontal ~4 px/jour, groupé par projet, barres colorées par statut, jalons en losanges.
- **Indicateurs / KPI** : position temporelle, durée, couleur (a_faire gris, en_cours bleu, terminee vert, bloquee rouge).
- **Options & fonctionnalités** : filtre par projet, masquer les terminées, axe temporel auto.
- **Paramétrage** : aucun.
- **Interactions** : mêmes données que l'onglet Planning de la fiche ; reflets des changements de statut.

> **📷 Captures d'écran**
> 1. Gantt général — `[insérer capture]`

## 5.5 Journal global des projets

- **Accès / API** : `/projets-log` — API `GET /api/projets/journal-global`.
- **À quoi ça sert** : fil chronologique de tout ce qui se passe sur le portefeuille (créations, transitions, documents, scores, réunions, tâches…).
- **Comment ça marche** : chaque action écrit dans `projets.projet_journal` (type, message, détails JSON, auteur) ; endpoint global enrichi (code/titre projet, auteur), tri desc, filtré par visibilité.
- **Indicateurs / KPI** : aucun ; entrées colorées par type.
- **Options & fonctionnalités** : filtres par type, recherche texte, liens vers fiche/document.
- **Paramétrage** : aucun.
- **Interactions** : reflète tous les sous-modules projets.

> **📷 Captures d'écran**
> 1. Journal global — `[insérer capture]`

## 5.6 Mes réunions

- **Accès / API** : `/mes-reunions` — API inline `GET /api/mes-reunions` + composants partagés CreateReunionModal/ReunionDetailModal.
- **À quoi ça sert** : lister les réunions auxquelles on participe (toutes pour admins), avec lieu, description, statut, participants, PJ ; liaison possible projet/transcription.
- **Comment ça marche** : `hub_rencontres.rencontres_reunions` + `reunion_participants` ; visibilité par email/username sauf superadmin.
- **Indicateurs / KPI** : nb participants/PJ par réunion, regroupement par année.
- **Options & fonctionnalités** : création, détail (participants, ordre du jour, PJ, tâches `liste_taches`, liens projet/transcription).
- **Paramétrage** : aucun.
- **Interactions** : Projets, Transcript Manager, Mes tâches.

> **📷 Captures d'écran**
> 1. Liste des réunions — `[insérer capture]`
> 2. Détail réunion — `[insérer capture]`

## 5.7 Transcript Manager

- **Accès / API** : `/transcriptmanager` (+ `/meeting/:id`) — API `/api/transcriptmanager` (meetings, search, upload async + status, summarize IA, tasks CRUD).
- **À quoi ça sert** : importer/exploiter les transcriptions de réunions (VTT/TXT Teams) : relecture, recherche globale, synthèse IA, extraction des tâches décidées.
- **Comment ça marche** : parsing en cues (timecodes/texte) ; locuteurs rapprochés de l'AD (username/email) ; synthèse LLM (résumé exécutif, points, décisions + bloc JSON de tâches `{what, who, req, when}` importées). Tables SQLite `transcript_meetings` (+ cues, tasks) ; flags partage direction/service ; lien réunion possible.
- **Indicateurs / KPI** : locuteurs, durée, volume de texte, présence d'un résumé ; résultats de recherche avec extraits.
- **Options & fonctionnalités** : upload avec progression, recherche globale, timeline de cues avec badges locuteurs, régénération IA, édition, partage, suppression, tâches cochables (visibles dans Mes tâches).
- **Paramétrage** : endpoint LLM côté serveur ; `ad_settings`.
- **Interactions** : Mes réunions, Mes tâches (source transcript).

> **📷 Captures d'écran**
> 1. Liste des transcriptions — `[insérer capture]`
> 2. Détail + synthèse IA + tâches — `[insérer capture]`

## 5.8 Mes tâches

- **Accès / API** : `/mes-taches` — API `/api/tasks` (agrégat multi-sources UNION ALL, count badge, kpi-history, alert-prefs, todo-sync MS To Do, by-context, PATCH personal).
- **À quoi ça sert** : boîte de réception unifiée de toutes les tâches assignées : personnelles, transcripts, projets, réunions budgétaires, revues, réunions, tickets, MS To Do.
- **Comment ça marche** : grand UNION ALL sur `hub.user_tasks`, `transcript.tasks`, `projets.projet_taches(_standalone)`, `rencontres_suivi`, `revue_taches`, `liste_taches` JSON des réunions, To Do, tickets des groupes — appariement username OU nom d'affichage. Cycle `a_faire` → `en_cours` → `terminé` (+ `refuse` motivé pour les tâches d'équipe) ; le changement de statut est **répercuté dans la table d'origine**. Tri : retards d'abord.
- **Indicateurs / KPI** : 4 cartes-filtres (En retard, En cours, À faire, Terminées aujourd'hui) + graphe d'historique KPI.
- **Options & fonctionnalités** : toggles 🔔 avertissement mail à l'affectation, 📋 rappel 8 h (+ Tester), sync MS To Do ; vue « tâches que j'ai affectées » ; filtres par source ; favori ★, publique/privée, prise en charge/refus d'équipe, priorité, échéance, notes + PJ.
- **Paramétrage** : préférences utilisateur backend ; aucune config admin.
- **Interactions** : agrège Projets, Revues, Rencontres, Réunions, Transcript, Tickets, MS To Do ; badge utilisé par le portail.

> **📷 Captures d'écran**
> 1. Boîte Mes tâches (cartes + liste) — `[insérer capture]`

## 5.9 Calendrier DSI & Agents DSI

- **Accès / API** : `/calendrier-dsi` et `/calendrier-dsi/agents` — API `/api/calendrier-dsi/*` (evenements, cumul-teletravail, send-daily, agents, hotline) + agendas O365 `/api/o365-calendar`.
- **À quoi ça sert** : agenda opérationnel de la DSI : absences, télétravail, déplacements, hotline, maintenances applicatives, déploiements — consolidant saisies manuelles, RH Demabs, plannings fixes et O365 ; e-mail « calendrier du jour » automatisable.
- **Comment ça marche** : `buildRangeEvents()` agrège événements saisis (`hub_calendrier.evenements`), TT fixes/absences permanentes des agents, absences Demabs (validées ⏳/en attente), maintenances MagApp, événements O365, créneaux hotline (jour/semaine paire-impaire + overrides ponctuels). Catégories/couleurs : absence, teletravail, deplacement, deploiement, reunion, hotline, maintenance. Périodes matin/après-midi déduites des codes typejour.
- **Indicateurs / KPI** : compteurs par catégorie, mail quotidien groupé avec badges Validé/En attente, cumul télétravail mensuel par agent/service (graphique).
- **Options & fonctionnalités** : vues semaine (5 j)/7 j/mois, filtres catégories, création/édition (agent via AD), hotline paires matin/après-midi, envoi mail d'une date choisie, impression, page Agents DSI (ajout via recherche AD, absences permanentes, TT fixes, liaison matricule RH, sync Demabs).
- **Paramétrage** : tables `hub_calendrier.agents_dsi/evenements/agents_tt_days/absences_permanentes/hotline_overrides/agents_hotline_defaults` ; mapping types RH → catégories ; calendriers O365 (token client_credentials).
- **Interactions** : O365, MagApp (maintenances), RH/Demabs, DSI Dashboard, service mail.

> **📷 Captures d'écran**
> 1. Vue semaine calendrier — `[insérer capture]`
> 2. Modale événement — `[insérer capture]`
> 3. Page Agents DSI — `[insérer capture]`
> 4. Cumul télétravail — `[insérer capture]`

## 5.10 Tableau de bord DSI (kiosque)

- **Accès / API** : `/dsi-dashboard` (accès admin/superadmin/dsi_kiosk **ou PMO**) — API `/api/dsi-dashboard/*` (dashboards CRUD, widgets, abonnements, send-now, jetons kiosque).
- **À qui ça sert** : tableau de bord direction entièrement personnalisable : mosaïque de widgets (~35 disponibles) couvrant tickets, budget, copieurs, parc, télécom, réseau, MagApp, calendrier, sauvegardes… Rotation en diaporama (kiosque) et envoi périodique par e-mail.
- **Comment ça marche** : dashboards par utilisateur (`hub.dsi_dashboards` : défaut, rotation seconds/order, filtres rotation) ; grille drag & drop persistée ; contexte de filtres partagés (période, groupe) appliqué à tous les widgets ; jetons kiosque cryptographiques pour affichage public sans session.
- **Indicateurs / KPI** (widgets) : Tickets (11 : KPIs, tendance 90 j, donut statuts, top catégories, techniciens, SLA, âge backlog…), Budget (commandé/facturé/à traiter, dépenses cumulées), Calendrier DSI, Copieurs, MagApp, Parc (pyramide âges PC, OS), compteurs (consommables, certificats, contrats, tâches, projets), sites réseau, Télécom, état sauvegarde auto.
- **Options & fonctionnalités** : plusieurs dashboards/utilisateur, redimensionnement, mode diaporama/kiosque, abonnement e-mail hebdo (7 h lundi) + envoi immédiat.
- **Paramétrage** : écran intégré (dashboards, widgets, abonnements, kiosques) ; middleware `authenticateAdminOrPMO`.
- **Interactions** : consomme presque tous les modules — vitrine de pilotage agrégée.

> **📷 Captures d'écran**
> 1. Dashboard en mode édition — `[insérer capture]`
> 2. Mode kiosque — `[insérer capture]`

---

# 6. Référentiels & RH

## 6.1 RH & synchronisation AD/Azure

- **Accès / API** : `/rh` (onglet Contractuels), onglets Organisation/Encadrants de ParamVille, `/admin/ad` — API `/api/admin/rh/*` (stats, hierarchy, organisation-chart, onboarding, agents, positions, alignments, sync, sync-ad/sync-azure + progress, ad-proposals, contracts).
- **À quoi ça sert** : référentiel agents issu d'Oracle RH enrichi, synchronisation/liens AD et Azure AD, organigramme Direction>Service>Secteur avec responsables déduits, onboarding des arrivants, annuaire des encadrants (emails/téléphones), renouvellements de contrats des contractuels avec relances automatiques.
- **Comment ça marche** :
  - Référentiel : SQLite `rh.referentiel_agents` (copie enrichie de V_EXTRACT_DSI : ad_username, azure_id/licence, dates arrivée/départ).
  - Sync AD : LDAP paginé, matching matricule/employeeID/displayName avec scoring ; Sync Azure : Graph (licences E5>E3>E1…), progressions temps réel.
  - Organigramme : `oracle.rh_siim_organigramme(_v2)` + responsables déduits de l'extraction (heuristiques d'intitulé), postes vacants signalés.
  - Encadrants : DG/directeurs/responsables actifs (exclusions configurables), email via employeeID, téléphone dans `hub.encadrants`, propositions depuis Mobilité + Lignes mobiles (priorité voix, exclusion MultiSIM).
  - Contractuels : `hub.contract_renewals`, **relance auto J+7** (fenêtre J‑1/J+7, non‑CDI, tag `contract-renewal-auto`).
- **Indicateurs / KPI** : agents total/actifs/partis/arrivées futures, comptes liés/non liés ; onboarding non démarré/en cours/complet ; contractuels : reconductions < 90 j, relances imminentes/en retard.
- **Options & fonctionnalités** : arborescence, alignement AD massif, suppression de lien, application en masse des téléphones, export CSV, relances manuelles, marquage « fait », import Excel.
- **Paramétrage** : `app_settings` (`rh_active_positions`), mappings AD, réglages LDAP/Azure (`ad_settings`, `azure_ad_settings` via `/admin/ad`).
- **Interactions** : Oracle RH, AD/Azure, Mobilité + Lignes mobiles, Mail, ParamVille (onglets embarqués), AgentPresenceBadge (via RH Studio, cf. § 7.3).

> **📷 Captures d'écran**
> 1. Organigramme — `[insérer capture]`
> 2. Sync AD en cours (progression) — `[insérer capture]`
> 3. Encadrants — `[insérer capture]`
> 4. Contractuels + relances — `[insérer capture]`

## 6.2 Param Ville (référentiel collectivité)

- **Accès / API** : `/admin/param-ville` (7 onglets) — API `/api/ville` (config, élus, sites + géocodage, écoles ; lecture admin **ou clé API scope `ville`**).
- **À quoi ça sert** : socle de contexte : nom de ville, annuaire des élus, patrimoine bâti hiérarchique (site > bâtiment > niveau > local), écoles, carte interactive des sites géocodés (+ onglets RH Organisation/Encadrants embarqués).
- **Comment ça marche** : `hub.ville_config/elus/sites/ecoles` ; imports Excel (élus : remplacement total ; patrimoine : upsert par code_bien, texte barré = désactivé) ; arborescence des codes bien ; carte react-leaflet avec repositionnement manuel admin.
- **Indicateurs / KPI** : sites actifs/localisés, onglets RH : DG/directeurs/responsables, absents AD, sans téléphone.
- **Options & fonctionnalités** : CRUD élus/écoles, export CSV, vues liste/arbre, carte interactive, re-géocodage.
- **Paramétrage** : c'est l'écran de paramétrage lui-même.
- **Interactions** : RH (embarqué), API Keys (scope ville), tout module consommant sites/géo (Réseau, Copieurs…).

> **📷 Captures d'écran**
> 1. Arbre du patrimoine — `[insérer capture]`
> 2. Carte des sites — `[insérer capture]`

## 6.3 Certificats

- **Accès / API** : `/certif` — API `/api/certificates` (CRUD, renewal-count, uploads unitaire/multiple/Excel, renewal, expiry).
- **À quoi ça sert** : suivi des certificats électroniques (G2, dématérialisation, SSL…) : commande, bénéficiaire, validité, n° SEDET, PDF officiel, alertes d'expiration, pilotage des renouvellements.
- **Comment ça marche** : `hub.certificates` ; **import PDF** (pdf-parse) extrait n° commande BDxxxx, date, email, code produit OE2*/OP2* → durée 2/3 ans → date d'expiration calculée (provisoire +15 j si indéterminée) ; upsert conservateur par n° de commande. Suivi de renouvellement : en_cours / renouvelé / non_renouvelé (+ motif).
- **Indicateurs / KPI** : compteurs périmés et expirant sous 3 mois, compteur global « à renouveler » (widget dashboard).
- **Options & fonctionnalités** : upload par lot (20 PDF, rapport), import Excel FR/EN, visionneuse intégrée, recherche/tri, bascule archives, badges présence.
- **Paramétrage** : aucun écran dédié ; storage `<root>/certificats/<id>/` + double écriture GED.
- **Interactions** : GED/Documents (dual-write), DSI Dashboard, RH Studio (présence).

> **📷 Captures d'écran**
> 1. Liste certificats avec alertes — `[insérer capture]`
> 2. Suivi de renouvellement — `[insérer capture]`

---

# 7. Administration & intégrations

## 7.1 Administration générale

- **Accès / API** : menu `/admin/*` — Utilisateurs, Configuration Hub (tuiles), Modules, SQL, Organisation, Sécurité/Backup, Bases de données (GLPI/Oracle/MariaDB/Finance), Messageries (`/admin/mail` incl. Collecteur + Email automation, `/admin/o365-mail`, `/admin/frizbi`), Paramètres (`/admin/settings`), Aide, Demandes d'accès.
- **À quoi ça sert** : exploitation transverse : comptes et habilitations, exécution SQL sécurisée, exploration des bases, cartographie organisationnelle, sauvegarde/restauration du socle, messageries (SMTP, O365, SMS Frizbi), paramètres clé/valeur.
- **Comment ça marche** :
  - Utilisateurs : création, rôle, approbation, service_code/complement, affectation de tuiles, toggles PMO/Manager.
  - Visibilité modules : `hub.module_settings` (masquage global d'une tuile-module).
  - SQL : requêtes libres admin/finances + explorateur multi-bases.
  - Sécurité/Backup : export/import zip (SQLite, PostgreSQL dump maison, fichiers), sélection de schémas (glpi exclu par défaut), planification cron (daily/weekly/monthly) avec rétention, destination SMB `_backups`, alertes e-mail si retard.
  - Messageries : SMTP/API HTTP + kill-switch + mail de test (`mail_settings`) ; O365 Graph tenant/client/mailbox (`o365_settings`) ; Frizbi SMS (api_url, sender, logs).
- **Indicateurs / KPI** : tailles bases, connexions, dernière exécution backup + statut, stats utilisateurs.
- **Options & fonctionnalités** : voir ci-dessus ; organisation : organigramme Direction/Secteur/Service avec vacants.
- **Paramétrage** : SQLite `app_settings` (dont `backup.auto_config`, `backup.schemas`, `storage.*`, `alfresco.*`, `inventaire_*`), tables `mail_settings`, `o365_settings`, `frizbi_settings`.
- **Interactions** : tous les modules ; stockage SMB ; gate API keys.

> **📷 Captures d'écran**
> 1. Menu admin — `[insérer capture]`
> 2. Gestion utilisateurs — `[insérer capture]`
> 3. Sauvegardes (planification) — `[insérer capture]`
> 4. Paramètres mail SMTP — `[insérer capture]`

## 7.2 Clés d'API

- **Accès / API** : `/admin/api-keys` — API `/api/admin/api-keys` (list/create/PATCH/delete).
- **À quoi ça sert** : accès machine-to-machine en lecture REST à certains périmètres sans compte utilisateur.
- **Comment ça marche** : clé `dsk_<16 hex><secret>` ; seul le secret est hashé bcrypt en base (`hub.api_keys` : key_hash, key_prefix, scope défaut `'*'`, expires_at, last_used_at) ; secret affiché **une seule fois**. Middleware `authenticateAdminOrApiKey(scope)` (utilisé par Ville).
- **Indicateurs / KPI** : liste (préfixe, scope, expiration, actif, dernière utilisation).
- **Options & fonctionnalités** : création, mise à jour, révocation.
- **Paramétrage** : écran admin ; table `hub.api_keys`.
- **Interactions** : modules exposant des routes « admin ou clé API » (Ville ; extensible).

> **📷 Captures d'écran**
> 1. Liste + création de clé — `[insérer capture]`

## 7.3 APIs externes & présence agents

- **Accès / API** : `/admin/infra` — API `/api/infra` (registre `hub.infra_apis`, test, sync réseau) ; proxifie aussi `GET /api/infra/agents/presence` (RH Studio).
- **À quoi ça sert** : registre central des APIs externes consommées : **RH Studio** (`rh_studio_presence` : présence agents ⭐ présent / ❌ parti / ⏳ pas encore arrivé / ❓ inconnu) et **API Infra réseau** (`reseau_links`). Alimente le composant `<AgentPresenceBadge>` à afficher partout où un agent est nommé.
- **Comment ça marche** : chaque entrée : label, base_url, endpoint, api_key masquée, header d'auth, enabled, méta dernière synchro. Test de connexion (nb résultats), sync réseau manuelle (purge/réinjection switchs + liens) ou cron quotidien.
- **Indicateurs / KPI** : résultat du test, nb switchs/liens importés, date/nombre dernière synchro.
- **Options & fonctionnalités** : activation par API, masquage clé, confirmation destructive avant sync.
- **Paramétrage** : table `hub.infra_apis` entièrement éditable ici.
- **Interactions** : Réseau, tous modules affichant un agent (/certif, /tickets, consommables, stocks, parc…).

> **📷 Captures d'écran**
> 1. Cartes des APIs externes — `[insérer capture]`
> 2. Exemple de badge de présence — `[insérer capture]`

## 7.4 Oracle (imports RH / Finances)

- **Accès / API** : `/admin/oracle` — API `/api/oracle/*` (settings, test-connection, check-tables, preview, sync-config, import-tables) et `/api/oracle-automation` (config, exec-sync, logs).
- **À quoi ça sert** : moteur générique configurable d'import de tables Oracle vers PostgreSQL (`oracle.*`) pour deux flux : **RH** (agents, organigramme) et **FINANCES** (factures, tiers, engagements). Source de vérité de Télécom, Budget/Tiers, RH, Mobilité.
- **Comment ça marche** : config SQLite `oracle_settings` (connexion par type) + `oracle_sync_config` (table, WHERE, colonnes, PK, jointures/substitutions). Exécution : SELECT construit, conversion types Oracle→PG, éclatement des colonnes `*_EXTRACT` (\x01), TRUNCATE + INSERT par lots de 500. Ordonnanceur node-cron piloté par PG `oracle_automation_config` (every_10_minutes/hourly/daily 2 h/weekly/monthly) journalisé `oracle_sync_logs`.
- **Indicateurs / KPI** : rapport SUCCESS/FAILED par table + nb enregistrements, durées, prochaine exécution.
- **Options & fonctionnalités** : aperçu de table, test de jointure, choix colonnes/PK/WHERE, automation par flux, sync manuelle de test.
- **Paramétrage** : écran AdminDatabases onglet Oracle.
- **Interactions** : Télécom, Budget/Tiers, RH, Mobilité, Finance.

> **📷 Captures d'écran**
> 1. Config import Oracle — `[insérer capture]`
> 2. Automatisation + logs — `[insérer capture]`

## 7.5 GLPI (legacy)

- **Accès / API** : `/admin/glpi` — API `/api/glpi` (settings + test GLPI/GLPI 10, jobs de sync historiques, comptages, proxy documents/images CID, scheduled-syncs, sync-logs).
- **À quoi ça sert** : module **legacy** : GLPI n'est plus connecté, l'application est autonome. Subsiste pour l'historique : relance d'imports, cache local des images des anciens tickets, syncs planifiées vers le miroir `glpi.*` (les tickets référencent encore `glpi_id`).
- **Comment ça marche** : connexion REST (app_token/user_token), machines à états de jobs en mémoire, écriture dans `glpi.*`.
- **Indicateurs / KPI** : comptages tickets, progression des jobs, logs de sync.
- **Options & fonctionnalités** : sync complète ou « récents », import massif d'images, proxy documents. L'onglet GLPI 10 pilote aussi les resynchronisations du **Parc** (infocoms/usagers).
- **Paramétrage** : URL + tokens dans AdminDatabases.
- **Interactions** : Tickets (miroir), Parc, Documents. À considérer comme vestige maintenu.

> **📷 Captures d'écran**
> 1. Onglet admin GLPI — `[insérer capture]`

---

# 8. Annexes

## Annexe A — Gabarit type d'une fiche module

Toute nouvelle fiche doit suivre cette structure :

```markdown
## X.Y <Nom du module>

- **Accès / API** : route(s) frontend — préfixe(s) API backend.
- **À quoi ça sert** : 2 à 4 phrases.
- **Comment ça marche** : entités principales, workflow, rôles/droits.
- **Indicateurs / KPI** : ce qui est affiché/mesuré.
- **Options & fonctionnalités** : liste à puces.
- **Paramétrage** : écrans admin, tables/clés de configuration.
- **Interactions avec les autres modules** : dépendances et points de jonction.

> **📷 Captures d'écran** *(à insérer)*
> 1. Vue principale — `[insérer capture]`
```

## Annexe B — Aide intégrée : fichiers existants

| Fichier | Rendu sur la page | Via |
|---|---|---|
| `docs/GUIDE-TECHNICIEN-TICKETS.md` | `/tickets` | Bouton « ? » (fallback DB `hub.page_help`) |
| `docs/GUIDE-STATISTIQUES-TICKETS.md` | `/tickets/stats` | idem |
| `docs/GUIDE-ADMIN-TICKETS.md` | `/tickets/admin` | idem |
| `docs/ARCHITECTURE-TICKETS.md` | — (documentation technique interne) | dépôt |
| `docs/CAHIER-DES-CHARGES-TICKETS.md` | — (documentation technique interne) | dépôt |

Pour ajouter une aide sur **n'importe quelle autre page** : Administration → onglet **Aide** (ou `PUT /api/page-help/<chemin_de_la_page>`), contenu Markdown ou fichier `.md`.

## Annexe C — Services frontends

| Service | Port | Contenu |
|---|---|---|
| Backend API | 3001 | Express, CommonJS, monolithe `server.js` + `modules/*` |
| Frontend DSI Hub | 5173 | React 19 + TS, Vite, React Router v7 (toutes les pages ci-dessus) |
| magapp-frontend | 5174 | Portail agent simplifié : catalogue MagApp, favoris, « mes tickets », incidents clos, abonnements |
