# Guide opérationnel — Module GED & Documents (`/documents`)

> Documentation fonctionnelle et technique à l'usage des **agents utilisateurs, gestionnaires documentaires et administrateurs système**.
> Ce guide décrit la Gestion Électronique des Documents (GED) transverse de l'application, le visualiseur multi-formats intégré, le versioning, ainsi que l'administration du stockage (SMB / Alfresco ECM) et les outils de migration (`/admin/ged`).

---

## Sommaire

1. [Rôle et principes de la GED transverse](#1-rôle-et-principes-de-la-ged-transverse)
2. [Consultation et recherche centralisée (`/documents`)](#2-consultation-et-recherche-centralisée-documents)
3. [Visualiseur de documents intégré (DocumentViewer)](#3-visualiseur-de-documents-intégré-documentviewer)
4. [Prise en charge avancée des courriels Outlook (`.msg`)](#4-prise-en-charge-avancée-des-courriels-outlook-msg)
5. [Versioning et cycle de vie documentaire](#5-versioning-et-cycle-de-vie-documentaire)
6. [Administration du stockage et connecteurs (`/admin/ged`)](#6-administration-du-stockage-et-connecteurs-adminged)
7. [Explorateur Alfresco ECM et partage de fichiers](#7-explorateur-alfresco-ecm-et-partage-de-fichiers)
8. [Outils de migration et récupération de fichiers](#8-outils-de-migration-et-récupération-de-fichiers)
9. [Interactions avec les autres modules applicatifs](#9-interactions-avec-les-autres-modules-applicatifs)
10. [Règles de conservation et bonnes pratiques](#10-règles-de-conservation-et-bonnes-pratiques)

---

## 1. Rôle et principes de la GED transverse

Contrairement à un simple dossier de partage réseau, la GED du Hub DSI (`hub_docs`) est le **socle d'archivage unifié** commun à tous les modules métiers de l'application (Contrats, Tickets, Projets, Télécom, Certificats, Stocks, Vols).

### 1.1 Avantages clés
- **Indexation unifiée** : chaque document est rattaché à son module d'origine (`module`) et à son entité parente (`entity_type` et `entity_id`).
- **Indépendance vis-à-vis du stockage physique** : que le fichier réside sur le disque du serveur, un partage SMB/Windows ou un coffre-fort documentaire Alfresco, son accès est transparent pour l'usager.
- **Sécurité et droits d'accès** : lecture sécurisée par jeton d'authentification JWT ou jeton temporaire signé pour les prévisualisations iframe.
- **Conservation de l'intégrité** : interdiction de suppression physique silencieuse (suppression douce par défaut).

---

## 2. Consultation et recherche centralisée (`/documents`)

La page `/documents` offre un point d'accès transverse à l'ensemble du patrimoine documentaire de la DSI :

### 2.1 Filtres et navigation
- **Filtrage par module applicatif** : bascule entre *Certificats*, *Projets*, *Contrats*, *Tickets*, *Télécom*, *Rencontres*, *Tâches*, *Live*.
- **Recherche plein texte instantanée** : recherche par titre de document, nom de fichier d'origine ou identifiant métier.
- **Métadonnées affichées** : Titre, Module d'origine, Entité liée, Version courante, Auteur du dépôt, Date de téléversement et date de dernière modification.
- **Action de consultation** : ouverture d'un clic dans le visualiseur intégré sans avoir besoin de télécharger le fichier sur son poste de travail.

---

## 3. Visualiseur de documents intégré (DocumentViewer)

Le composant `DocumentViewer` permet de consulter instantanément les pièces jointes dans le navigateur :

- **Fichiers PDF** : visionneuse interactive avec zoom, pagination, rotation et recherche de texte interne.
- **Images (PNG, JPG, SVG, GIF, WebP)** : affichage haute définition avec zoom et contraste adapté.
- **Documents bureautiques (Word, Excel, PowerPoint)** : aperçu ou téléchargement direct sécurisé.
- **Fichiers texte et logs (TXT, CSV, JSON, Markdown, XML)** : coloration syntaxique et défilement fluide.

---

## 4. Prise en charge avancée des courriels Outlook (`.msg`)

Une innovation majeure du module réside dans le traitement natif des fichiers `.msg` (exports d'e-mails Outlook) :

- **Rendu visuel fidèle** : affichage de l'en-tête complet (De, À, Cc, Date d'envoi, Objet) et du corps du message en HTML mis en forme.
- **Extraction automatique des pièces jointes embarquées** : les fichiers contenus à l'intérieur du courriel Outlook (PDF, tableurs, images) sont détectés, listés au bas du message et téléchargeables unitairement sans devoir ouvrir Outlook.

---

## 5. Versioning et cycle de vie documentaire

Chaque document dans `hub_docs` dispose d'un historique de versions rigoureux :

1. **Création (Version 1)** : téléversement initial depuis le formulaire du module métier concerné.
2. **Nouvelle version (V2, V3...)** : le dépôt d'une mise à jour ne remplace pas le fichier existant. Une nouvelle ligne est créée dans `document_versions`, incrémentant le numéro de version courante.
3. **Traçabilité des révisions** : consultation possible de n'importe quelle version antérieure avec indication de l'auteur et de l'horodatage.
4. **Suppression douce (*Soft-delete*) vs Purge** :
   - *Suppression douce* (accessible aux gestionnaires) : masque le document de l'interface usager tout en conservant les fichiers pour conformité légale (`is_deleted = true`).
   - *Purge définitive* (réservée aux super-administrateurs) : effacement physique irréversible du fichier sur le stockage sous-jacent.

---

## 6. Administration du stockage et connecteurs (`/admin/ged`)

Accessible aux administrateurs depuis la barre latérale (`/admin/ged`), cet écran supervise les couches de stockage physique :

### 6.1 Configuration des backends de stockage
- **Stockage local / SMB** : chemin racine du partage de fichiers (`storage.root_path`), permissions de lecture/écriture, quotas d'espace disque disponible.
- **Connecteur Alfresco ECM** :
  - URL du serveur Alfresco (REST API v1).
  - Identifiants de service (`alfresco.username`, `alfresco.password`).
  - Indicateur de statut de connexion temps réel (🟢 Opérationnel, 🔴 Erreur de liaison, 🟡 En cours de test).

---

## 7. Explorateur Alfresco ECM et partage de fichiers

L'écran d'administration intègre un explorateur de nœuds Alfresco complet :

- **Navigation arborescente (Breadcrumb)** : parcours des espaces documentaires, dossiers et sous-dossiers municipaux.
- **Gestion des nœuds** : création de répertoires, téléversement direct de fichiers, téléchargement et suppression.
- **Visualisation des métadonnées ECM** : identifiant unique de nœud (UUID), type MIME, taille exacte en octets, dernier modificateur.

---

## 8. Outils de migration et récupération de fichiers

Pour garantir la pérennité lors des montées de version ou du changement de serveur :

### 8.1 Assistant de migration (Legacy → GED moderne)
- Permet de basculer les anciens documents éparpillés dans l'arborescence historique vers le schéma structuré `hub_docs`.
- **Mode simulation (*Dry-Run*)** : analyse l'ensemble des fichiers sans déplacer un seul octet et génère un rapport prévisionnel (fichiers prêts à migrer, fichiers déjà conformes, fichiers manquants ou orphelins).
- **Exécution contrôlée** : migration transactionnelle avec rapport détaillé de succès et d'échecs.

### 8.2 Outil de récupération des fichiers orphelins (*Recover*)
- Scanne les anciens répertoires temporaires pour repérer les fichiers physiques orphelins et propose leur réaffectation vers le chemin canonique de stockage.

---

## 9. Interactions avec les autres modules applicatifs

| Module émetteur | Types de documents stockés et indexés en GED |
|---|---|
| **Contrats** (`/contrats`) | Actes d'engagement, CCTP, BPU, avenants, courriers de reconduction. |
| **Certificats** (`/certif`) | Bons de commande SEDET, fichiers PDF officiels de certificat. |
| **Vols et Pertes** (`/vols`) | Déclarations de sinistre, récépissés de dépôt de plainte, constats de police. |
| **Stocks** (`/stocks`) | Bons de livraison (BL) signés électroniquement, conventions de prêt. |
| **Télécom** (`/telecom`) | Duplicatas de factures opérateurs SFR/Orange, états d'inventaire. |
| **Tickets** (`/tickets`) | Captures d'écran d'usagers, fichiers journaux d'erreurs, devis de réparation. |
| **Rencontres budgétaires** (`/rencontres-budgetaires`) | Comptes-rendus de réunion, fiches de cadrage financier. |

---

## 10. Règles de conservation et bonnes pratiques

- 💡 **Nommage des fichiers** : Privilégiez des noms explicites sans caractères spéciaux (ex. `2026-CONTRAT-MAINTENANCE-SERVEURS-SIGNE.pdf`).
- 💡 **Format pérenne** : Pour les documents officiels et contractuels, préférez le format **PDF/A** (norme ISO d'archivage pérenne) plutôt que des formats bureautiques modifiables.
- ⚠️ **Limite de taille** : La taille maximale par fichier téléversé est fixée à **25 Mo** par défaut pour préserver la réactivité du réseau et la bande passante lors des prévisualisations.
