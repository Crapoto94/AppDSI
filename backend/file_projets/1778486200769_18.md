# Proposition — Module Gestion de Portefeuille Projets

## 1. Hypothèses et principes retenus

### Hypothèses
- **Base de données cible** : **PostgreSQL** (schéma `projets`) pour toutes les données du portefeuille projets. On suit le pattern existant : les données métier structurées utilisent PostgreSQL (comme `hub_rencontres` pour les réunions). La base SQLite reste utilisée pour les données de configuration applicative (settings, tuiles, users hub).
- **Authentification** : Le système JWT + AD existe déjà — on réutilise `authenticateJWT` et les rôles existants sans recréer d'auth.
- **Recherche AD** : Le endpoint `/api/ad/search?q=` existe déjà — on ne recrée pas.
- **Mail** : `sendMail(to, subject, content, attachments)` existe et est injectable via `.setSendMail()` — pattern déjà utilisé par le module réunions.
- **Module réunions** : Les tables `rencontres_reunions`, `reunion_participants`, `reunion_attachments` existent en PostgreSQL — on va liér les projets à ces réunions via une table de liaison, pas via duplication.

### Principes retenus
- **Minimum de nouvelles dépendances** : Tout tient dans les stacks existantes (Express, SQLite, React 19, Recharts, Lucide).
- **Pattern module** : Chaque module = `{module}.routes.js` + `{module}.controller.js` côté backend ; un dossier/pages côté frontend.
- **Traçabilité forte** : Toute action métier significative → table `projet_journal` (audit trail).
- **Workflow non-bloquant** : Les alertes documentaires sont des warnings, pas des blocages.
- **Visibilité contrôlée** : Pas de règle globale — chaque projet a une liste explicite de personnes autorisées.

---

## 2. Architecture fonctionnelle

```
┌──────────────────────────────────────────────────────────────┐
│                     APPLICATION HUB DSI                      │
├────────────┬────────────┬────────────┬───────────────────────┤
│  Dashboard │  Portefeuille │ Admin    │  Modules existants    │
│  (tuiles)  │  Projets    │ (users,   │  (Budgets, RH,        │
│            │             │  tiles…)  │  Réunions, GLPI…)    │
└────────────┴────────────┴────────────┴───────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Module       │ │ Module   │ │ Intégration  │
│ Portefeuille │ │ Projet   │ │ Réunions     │
│ (back)       │ │ (back)   │ │ (existante)  │
└──────────────┘ └──────────┘ └──────────────┘
```

### Modules backend à créer
| Module | Fichiers | Responsabilité |
|--------|----------|----------------|
| Projets | `projets.routes.js`, `projets.controller.js` | CRUD projets, workflow, journal |
| Documents | Dans `projets.controller.js` ou séparé | Upload, versioning, typage |
| Scoring | Dans `projets.controller.js` | Notation, calcul score |
| Admin portefeuille | Dans `projets.controller.js` | Paramétrage (types doc, poids scoring, statuts) |

### Modules backend existants à intégrer
| Module | Point d'intégration |
|--------|---------------------|
| AD Search | `/api/ad/search?q=` pour sélection des agents |
| Mail | `sendMail()` injecté pour les notifications |
| Réunions | Table de liaison `projet_reunions` + endpoints de lien |

---

## 3. Modèle de données détaillé

### Tables dans la base SQLite principale

```sql
-- ============================================
-- CŒUR : Projets
-- ============================================
CREATE TABLE projets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,                          -- EX: PROJ-2025-001 (auto-généré)
    titre TEXT NOT NULL,
    description TEXT,
    niveau_projet TEXT DEFAULT 'standard',     -- 'mineur', 'standard', 'structurant'
    statut TEXT DEFAULT 'idee',                -- voir workflow
    statut_precedent TEXT,                     -- pour retour arrière tracé
    service_pilote TEXT NOT NULL,               -- service pilote (code)
    commanditaire_username TEXT,               -- AD username
    chef_projet_username TEXT,                 -- AD username
    responsable_dsi_username TEXT,             -- AD username
    representant_metier_username TEXT,         -- AD username
    dpo_username TEXT,
    date_debut_prevue TEXT,
    date_fin_prevue TEXT,
    date_debut_reelle TEXT,
    date_fin_reelle TEXT,
    priorite INTEGER DEFAULT 0,                -- 0=non défini, 1-5
    score_total REAL DEFAULT 0,                -- score calculé sur 100
    avancement REAL DEFAULT 0,                 -- % 0-100
    risque_global TEXT,                        -- 'faible', 'moyen', 'élevé', 'critique'
    satisfaction_metier INTEGER,               -- 1-5
    benefices_attendus TEXT,
    benefices_realises TEXT,
    notes_internes TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_username TEXT,
    modified_by_username TEXT
);

-- ============================================
-- SERVICES associés (N:N)
-- ============================================
CREATE TABLE projet_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    service_code TEXT NOT NULL,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE,
    UNIQUE(projet_id, service_code)
);

-- ============================================
-- RÔLES PROJET (personnes avec un rôle sur le projet)
-- On garde une approche flexible : role_text = 'equipe_projet', 'partie_prenante', 'pour_info'
-- Les rôles principaux (commanditaire, chef_projet, etc.) sont des colonnes directes dans projets
-- ============================================
CREATE TABLE projet_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,                        -- 'equipe_projet', 'partie_prenante', 'pour_info'
    display_name TEXT,
    email TEXT,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    ajoute_par_username TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE,
    UNIQUE(projet_id, username, role)
);

-- ============================================
-- VISIBILITÉ explicite (personnes autorisées hors rôles)
-- ============================================
CREATE TABLE projet_visibilite (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE,
    UNIQUE(projet_id, username)
);

-- ============================================
-- WORKFLOW / TRANSITIONS
-- ============================================
CREATE TABLE projet_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    statut_avant TEXT NOT NULL,
    statut_apres TEXT NOT NULL,
    date_transition DATETIME DEFAULT CURRENT_TIMESTAMP,
    username TEXT NOT NULL,
    commentaire TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
);

-- ============================================
-- DOCUMENTS avec versionning
-- ============================================
CREATE TABLE projet_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    type_documentaire TEXT NOT NULL,           -- 'fiche_idee', 'charte_projet', 'plan_projet', etc.
    phase_concernee TEXT,                      -- statut du projet à laquelle ce doc est lié
    description TEXT,
    est_attendu INTEGER DEFAULT 0,             -- 1 si ce type de doc est attendu à cette phase
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_username TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
);

CREATE TABLE projet_versions_document (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    version TEXT NOT NULL,                     -- 'v1.0', 'v1.1', 'v2.0'
    fichier_nom TEXT NOT NULL,                  -- nom sur le disque
    fichier_original TEXT NOT NULL,             -- nom original
    fichier_taille INTEGER,
    fichier_type TEXT,                          -- MIME type
    commentaire TEXT,
    est_version_courante INTEGER DEFAULT 1,
    date_depot DATETIME DEFAULT CURRENT_TIMESTAMP,
    depose_par_username TEXT,
    FOREIGN KEY (document_id) REFERENCES projet_documents(id) ON DELETE CASCADE
);

-- ============================================
-- SCORING / NOTATION
-- ============================================
CREATE TABLE projet_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    critere TEXT NOT NULL,                     -- alignement_strategique, valeur_metier, etc.
    note INTEGER NOT NULL CHECK(note >= 1 AND note <= 5),
    justification TEXT,
    date_notation DATETIME DEFAULT CURRENT_TIMESTAMP,
    note_par_username TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE,
    UNIQUE(projet_id, critere)
);

-- PONDÉRATION des critères (paramétrable par admin)
CREATE TABLE projet_scoring_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    critere TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    poids INTEGER NOT NULL DEFAULT 10,         -- somme des poids = 100
    actif INTEGER DEFAULT 1,
    ordre INTEGER DEFAULT 0
);

-- ============================================
-- LIEN RÉUNIONS (avec module existant PostgreSQL)
-- ============================================
CREATE TABLE projet_reunions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    reunion_id INTEGER NOT NULL,               -- FK vers rencontres_reunions(id) en PostgreSQL
    type_gouvernance TEXT,                     -- 'copil', 'coproj', 'atelier', 'recette', 'comite_portefeuille', 'arbitrage'
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE,
    UNIQUE(projet_id, reunion_id)
);

-- ============================================
-- JOURNAL / AUDIT TRAIL
-- ============================================
CREATE TABLE projet_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    type_entree TEXT NOT NULL,                 -- 'creation', 'changement_statut', 'document_depose', 'version_change', 'reunion_liee', 'decision', 'action', 'partie_prenante_ajoutee', 'partie_prenante_retiree', 'score_modifie', 'note', 'alerte'
    message TEXT NOT NULL,
    details TEXT,                              -- JSON libre pour données contextuelles
    username TEXT NOT NULL,
    date_entree DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
);

-- ============================================
-- INDICATEURS de suivi projet
-- ============================================
CREATE TABLE projet_indicateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    type_indicateur TEXT NOT NULL,             -- 'cout', 'delai', 'risque', 'satisfaction'
    valeur TEXT,
    date_saisie DATETIME DEFAULT CURRENT_TIMESTAMP,
    saisi_par_username TEXT,
    commentaire TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
);

-- ============================================
-- NOTIFICATIONS (table de log + file d'attente)
-- ============================================
CREATE TABLE projet_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    destinataire_username TEXT NOT NULL,
    type_notification TEXT NOT NULL,            -- 'changement_statut', 'nouveau_document', 'reunion_liee', etc.
    message TEXT,
    envoye INTEGER DEFAULT 0,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_envoi DATETIME,
    erreur TEXT,
    FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
);

-- ============================================
-- PARAMÉTRAGE ADMIN
-- ============================================
CREATE TABLE projet_types_documentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    phase_concernee TEXT,                      -- statut(s) où ce doc est attendu (NULL = toutes phases)
    obligatoire INTEGER DEFAULT 0,
    ordre INTEGER DEFAULT 0,
    actif INTEGER DEFAULT 1
);

-- ============================================
-- INDEX
-- ============================================
CREATE INDEX idx_projets_statut ON projets(statut);
CREATE INDEX idx_projets_service_pilote ON projets(service_pilote);
CREATE INDEX idx_projets_priorite ON projets(priorite);
CREATE INDEX idx_projets_score ON projets(score_total);
CREATE INDEX idx_projet_roles_username ON projet_roles(projet_id, username);
CREATE INDEX idx_projet_journal_projet ON projet_journal(projet_id);
CREATE INDEX idx_projet_documents_projet ON projet_documents(projet_id);
CREATE INDEX idx_projet_scores_projet ON projet_scores(projet_id);
CREATE INDEX idx_projet_visibilite_username ON projet_visibilite(projet_id, username);
```

### Ce qui reste dans PostgreSQL (module réunions existant)

| Table | Usage |
|-------|-------|
| `rencontres_reunions` | Création et gestion des réunions (inchangé) |
| `reunion_participants` | Participants aux réunions (inchangé) |
| `reunion_attachments` | Pièces jointes des réunions (inchangé) |

La liaison se fait via `projet_reunions.reunion_id` → `rencontres_reunions.id`.

---

## 4. Workflow et règles de gestion

### Workflow complet

```
                    ┌──────────┐
                    │   Idée   │
                    └────┬─────┘
                         │
                    ┌────▼──────┐
                    │ Demande   │
                    │ initiale  │
                    └────┬──────┘
                         │
                    ┌────▼────┐
                    │Étude DSI│
                    └────┬────┘
                         │
                    ┌────▼──────┐
         ┌─────────►│Arbitrage  │◄──────────┐
         │          └────┬──────┘           │
         │               │                  │
         │          ┌────▼────────┐         │
         │          │Planification│         │
         │          └────┬────────┘         │
         │               │                  │
         │          ┌────▼──────┐           │
         │          │ En cours  │           │
         │          └────┬──────┘           │
         │               │                  │
         │          ┌────▼───────┐          │
         │          │ En recette │          │
         │          └────┬───────┘          │
         │               │                  │
         │          ┌────▼────────┐         │
         │          │ En clôture  │         │
         │          └────┬────────┘         │
         │               │                  │
         │          ┌────▼──────┐           │
         │          │ Clôturé   │           │
         │          └───────────┘           │
         │                                 │
         │  ┌──────────┐  ┌──────────┐     │
         │  │ Refusé   │  │ Suspendu │     │
         │  └──────────┘  └────┬─────┘     │
         │                     │            │
         │                ┌────▼──────┐     │
         └────────────────┤ Abandonné │     │
                          └───────────┘     │
```

### Règles de transition

| Depuis | Vers | Règle |
|--------|------|-------|
| Idée | Demande initiale | Aucune |
| Demande initiale | Étude DSI | Aucune |
| Étude DSI | Arbitrage | Vérifier charte projet présente (alerte si absente) |
| Arbitrage | Planification | Vérifier note d'arbitrage présente |
| Arbitrage | Refusé | Aucune |
| Arbitrage | Suspendu | Aucune |
| Planification | En cours | Vérifier plan projet présent (alerte si absent) |
| En cours | En recette | Aucune |
| En recette | En clôture | Vérifier VA et VSR présents (alertes) |
| En clôture | Clôturé | Vérifier bilan de clôture présent (alerte) |
| *(tout sauf clôturé)* | Suspendu | Possible depuis tout statut |
| *(tout sauf clôturé)* | Abandonné | Possible depuis tout statut sauf clôturé |
| Suspendu | *(précédent)* | Retour possible au statut précédent |
| Refusé, Suspendu, Abandonné | *(aucun)* | Statuts terminaux ou suspendus |

### Algorithme de contrôle de complétude

Pour chaque transition entrante, le système vérifie :
1. Quels types documentaires sont attendus pour la phase cible
2. Lesquels sont absents (aucun document déposé)
3. S'il y a des documents avec des versions mais dont la version courante est marquée comme "en attente de validation"

Résultat : une liste de warnings affichés avant de confirmer la transition. L'utilisateur peut confirmer malgré les warnings.

### Règles de visibilité

1. Un projet est visible par :
   - Les personnes ayant un rôle sur le projet (via `projet_roles`)
   - Les personnes ajoutées en visibilité explicite (`projet_visibilite`)
   - Les titulaires des rôles principaux (commanditaire, chef_projet, etc.)
   - Les profils DSI autorisés (rôle applicatif `portefeuille_admin` ou `admin`)
   - Le créateur du projet

2. Un projet N'EST PAS visible par :
   - Les autres agents non listés
   - Les profils sans habilitation spécifique

3. La vue "Mes projets" montre :
   - Les projets où l'utilisateur a un rôle
   - Les projets où l'utilisateur est en visibilité
   - Les projets où l'utilisateur est créateur

---

## 5. Écrans et parcours utilisateurs

### 5.1 Portefeuille (liste des projets)

```
┌────────────────────────────────────────────────────────────┐
│ 🔍 [Rechercher...]      [+ Nouveau projet]                │
│                                                           │
│ Filtres: [Tous statuts ▼] [Tous services ▼] [Priorité ▼] │
│                                                           │
│ ┌────────┬────────┬──────────┬────────┬───────┬─────────┐ │
│ │ Projet │ Statut │ Priorité │ Score  │ Pilot │Avancemt │ │
│ ├────────┼────────┼──────────┼────────┼───────┼─────────┤ │
│ │ PROJ-  │ En     │ Haute    │ 78/100 │ DSI   │ ████░░  │ │
│ │ 2025.. │ cours  │          │        │       │  65%    │ │
│ │ ...    │ ...    │ ...      │ ...    │ ...   │ ...     │ │
│ └────────┴────────┴──────────┴────────┴───────┴─────────┘ │
│                                                           │
│ 📊 Synthèse: 12 projets · 3 en cours · 2 en retard       │
└────────────────────────────────────────────────────────────┘
```

**Composants :**
- Barre de recherche + filtre multicritères
- Tableau avec tri par colonne
- Cartes de synthèse (statuts, priorités)
- Bouton "+ Nouveau projet" → ouvre modal de création

### 5.2 Fiche projet (vue détaillée à onglets)

```
┌────────────────────────────────────────────────────────────┐
│ PROJ-2025-012 · Mise à jour du portail famille            │
│ ┌──────┬───────┬──────┬─────────┬──────┬──────┬─────────┐ │
│ │Infos │Journal│Docu- │Réunions │Score │Admin │Indica-  │ │
│ │      │       │ments │         │      │projet│teurs    │ │
│ └──────┴───────┴──────┴─────────┴──────┴──────┴─────────┘ │
│                                                           │
│ Onglet "Infos" :                                           │
│ ┌─────────────────────┬───────────────────────────────────┐│
│ │ Statut: En cours    │ Service pilote: DSI              ││
│ │ Priorité: Haute (3) │ Services: DSI, Éducation         ││
│ │ Niveau: Standard    │                                  ││
│ │                     │ Commanditaire: J. Dupont         ││
│ │ Début: 01/03/2025   │ Chef de projet: M. Martin        ││
│ │ Fin prévue: 30/09   │ Resp. DSI: P. Durand             ││
│ │                     │ Rep. métier: S. Petit            ││
│ │ Avancement: ████░░  │                                  ││
│ │ 65%                 │ Équipe: [3 pers]                 ││
│ │                     │ Parties prenantes: [5 pers]       ││
│ └─────────────────────┴───────────────────────────────────┘│
│ Description: ...                                          │
└────────────────────────────────────────────────────────────┘
```

**Onglet Journal** : Fil d'actualité chronologique avec:
- Changements de statut  🟦
- Dépôts de documents   📄
- Réunions liées        📅
- Décisions             ⚖️
- Actions               ✅
- Alertes               ⚠️

**Onglet Documents** :
- Tableau des documents avec type, phase, version courante, statut
- Upload + versionning
- Indicateur "Attendu" vs "Présent" (vert/rouge/jaune)

**Onglet Réunions** :
- Liste des réunions liées au projet (depuis module existant)
- Bouton "+ Lier une réunion existante" / "+ Créer une réunion projet"
- Consultation rapide des CR, décisions, actions

**Onglet Score** :
- Grille de notation (10 critères, note 1-5)
- Score calculé automatiquement
- Graphique radar de la notation

**Onglet Admin projet** :
- Checklist documentaire par phase
- État de complétude
- Parties prenantes (ajout/suppression)
- Visibilité explicite
- Historique d'audit complet
- Paramètres du projet (suppression, archivage)
- Alertes en cours

**Onglet Indicateurs** :
- Avancement (barre)
- Risques (matrice)
- Satisfaction métier
- Coût/Délai (feux tricolores)

### 5.3 Création de projet

```
┌────────────────────────────────────────────────────────────┐
│ Nouveau projet                                             │
│                                                           │
│ Titre: [.........................]                        │
│ Description: [.........................]                   │
│ Niveau: ○ Mineur  ○ Standard  ○ Structurant              │
│ Service pilote: [Sélectionner ▼]                         │
│ Services associés: [☐ DSI] [☐ Éducation] [☐ ...]        │
│                                                           │
│ Participants (recherche AD):                             │
│ 🔍 [Rechercher un agent...]  ┌────────────────────────┐  │
│                              │ Résultats AD en direct │  │
│                              └────────────────────────┘  │
│                                                           │
│ Commanditaire: [J. Dupont]  ✕                            │
│ Chef de projet: [M. Martin]  ✕                           │
│ Équipe: [A. Lefevre] ✕ [B. Moreau] ✕ [+ Ajouter]       │
│ Parties prenantes: [C. Petit] ✕ [+ Ajouter]              │
│                                                           │
│ [Création rapide]  [Création complète]                   │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Stratégie d'intégration avec l'existant

### Points d'intégration

| Existant | Intégration |
|----------|-------------|
| **AD Search** (`/api/ad/search`) | Réutilisé tel quel dans les sélecteurs de personnes |
| **sendMail** (server.js) | Injecté via `projetsCtrl.setSendMail(sendMail)` — même pattern que le module réunions |
| **Module réunions** (PostgreSQL) | Table de liaison `projet_reunions` en SQLite + lecture seule des réunions via pgDb |
| **middleware** (`authenticateJWT`, `authenticateAdmin`) | Réutilisé sans modification |
| **config** (`SECRET_KEY`, `PORT`, `FOLDERS`) | Réutilisé depuis `shared/config.js` |
| **database** (`getSqlite()`, `pgDb`) | Réutilisé depuis `shared/database.js` |
| **logMouchard** | Réutilisé pour la journalisation technique |
| **multer** | Réutilisé pour les uploads de documents |
| **Frontend tiles** | Nouvelle tuile "Portefeuille Projets" avec URL `/portefeuille-projets` |
| **Frontend routing** | Nouvelle route dans `App.tsx` |
| **AuthContext** | Réutilisé sans modification |

### Ne PAS recréer
- ❌ Recherche AD
- ❌ Service mail
- ❌ Module réunions (CRUD réunions, participants, pièces jointes, envoi CR)
- ❌ Authentification / JWT
- ❌ Middleware de droits
- ❌ Système de tuiles / navigation

---

## 7. Proposition technique de mise en œuvre

### Structure des fichiers

```
backend/
  modules/
    projets/
      projets.controller.js       ← CRUD, workflow, scoring, documents, journal
      projets.routes.js           ← Définition des routes REST

frontend/
  src/
    pages/
      PortefeuilleProjets.tsx     ← Page liste des projets
      ProjetDetail.tsx            ← Fiche projet détaillée (avec sous-composants)
    components/
      projets/
        FicheProjetInfos.tsx      ← Onglet infos générales
        FicheProjetJournal.tsx    ← Onglet journal
        FicheProjetDocuments.tsx  ← Onglet documents + versionning
        FicheProjetReunions.tsx   ← Onglet réunions liées
        FicheProjetScore.tsx      ← Onglet scoring
        FicheProjetAdmin.tsx      ← Onglet admin projet
        FicheProjetIndicateurs.tsx ← Onglet indicateurs
        CreerProjetModal.tsx      ← Modal de création
        LierReunionModal.tsx      ← Modal pour lier une réunion existante
        DocumentUploadModal.tsx   ← Modal d'upload documentaire
        ProjetWorkflowBadge.tsx   ← Badge de statut avec workflow
        ADUserSearch.tsx          ← Composant réutilisable de recherche AD
    App.tsx                       ← + routes pour /portefeuille-projets et /projets/:id
```

### Routes API

```
GET    /api/projets                       → Liste filtrable (statut, service, niveau, priorité, q)
GET    /api/projets/mes-projets           → Projets de l'utilisateur courant
GET    /api/projets/stats                 → Statistiques portefeuille
POST   /api/projets                       → Création
GET    /api/projets/:id                   → Détail complet
PUT    /api/projets/:id                   → Mise à jour
DELETE /api/projets/:id                   → Suppression (admin only)

POST   /api/projets/:id/transition        → Changement de statut
GET    /api/projets/:id/controles         → Contrôle de complétude pour transition

POST   /api/projets/:id/roles             → Ajouter rôle projet
DELETE /api/projets/:id/roles/:roleId     → Retirer rôle projet

POST   /api/projets/:id/visibilite        → Ajouter visibilité explicite
DELETE /api/projets/:id/visibilite/:vid   → Retirer visibilité

POST   /api/projets/:id/documents         → Créer un document (métadonnées)
POST   /api/projets/:id/documents/:did/versions → Upload nouvelle version
GET    /api/projets/:id/documents         → Liste documents
GET    /api/projets/:id/documents/:did    → Détail document + versions
GET    /api/projets/:id/documents/attentes → Checklist attendus vs présents

POST   /api/projets/:id/scores            → Enregistrer ou mettre à jour une note critère
GET    /api/projets/:id/scores            → Scores complets du projet
GET    /api/projets/:id/score-calcule     → Score calculé (lecture seule)

POST   /api/projets/:id/reunions          → Lier une réunion existante au projet
DELETE /api/projets/:id/reunions/:rid     → Délier une réunion
GET    /api/projets/:id/reunions          → Réunions liées (données depuis pgDb)

GET    /api/projets/:id/journal           → Entrées du journal (filtrables)
POST   /api/projets/:id/journal           → Ajouter une entrée manuelle au journal

GET    /api/projets/:id/indicateurs       → Indicateurs de suivi
POST   /api/projets/:id/indicateurs       → Ajouter un indicateur

GET    /api/projets/admin/scoring-config       → Configuration scoring
PUT    /api/projets/admin/scoring-config       → Mise à jour configuration
GET    /api/projets/admin/types-documentaires  → Types documentaires
PUT    /api/projets/admin/types-documentaires  → Mise à jour types
```

### Génération du code projet (auto)

Le code projet est généré automatiquement :
```
PROJ-{ANNEE}-{NUMÉRO}
```
où `NUMÉRO` est un séquentiel par année (004, 005...), stocké dans `app_settings` avec la clé `projet_last_num_{année}`.

### Notifications

Le système de notification est un **envoi différé** :
1. Les actions qui génèrent une notification écrivent dans `projet_notifications` avec `envoye=0`
2. Les notifications sont envoyées par lot via le service mail injecté
3. Les notifications peuvent être déclenchées immédiatement ou via un cron

Événements déclencheurs :
| Événement | Destinataires | Type |
|-----------|---------------|------|
| Changement de statut | Tous les participants | `changement_statut` |
| Document déposé | Commanditaire, chef de projet | `nouveau_document` |
| Version changée | Commanditaire, chef de projet | `version_changee` |
| Réunion liée | Participants du projet | `reunion_liee` |
| Partie prenante ajoutée | Personne ajoutée | `partie_prenante_ajoutee` |
| Alerte documentaire | Chef de projet | `alerte_document` |

---

## 8. Décisions de conception clés

| Décision | Justification |
|----------|---------------|
| Données du portefeuille **en SQLite**, pas en PostgreSQL | Cohérence avec le pattern existant (données applicatives en SQLite, réunions en PG). Pas de mélange de responsabilités. |
| Rôles principaux en colonnes directes (commanditaire, chef_projet...) plutôt que dans la table des rôles | Simplifie les requêtes les plus fréquentes ("qui est le chef de projet ?") et réduit le nombre de jointures. |
| Visibilité explicite séparée des rôles | Un agent peut avoir besoin de voir un projet sans y avoir un rôle actif. Permet le "pour information" sans polluer les rôles. |
| Journalisation en table dédiée plutôt que logs fichier | Requêtable, filtrable, intégrable dans l'UI. |
| Pas de blocage strict des transitions | PMBOK light : on guide, on avertit, mais on ne bloque pas. Réalité d'une collectivité où la souplesse est nécessaire. |
| Scoring pondéré paramétrable | Les critères et poids peuvent évoluer sans changement de code. |
| Documents versionnés avec fichier sur disque | Pattern multer existant. Pas de base de données qui gonfle. |

---

## 9. Planning de mise en œuvre estimé

| Phase | Contenu | Durée estimée |
|-------|---------|---------------|
| **1** | Modèle de données + migration DB | 1 jour |
| **2** | CRUD backend (projets, services, rôles) | 2 jours |
| **3** | Workflow + transitions + contrôles | 1.5 jours |
| **4** | Documents + versionning (upload, téléchargement) | 2 jours |
| **5** | Scoring (notation + calcul + admin) | 1.5 jours |
| **6** | Intégration réunions (liage, affichage) | 1 jour |
| **7** | Journal + notifications | 1.5 jours |
| **8** | Frontend : liste portefeuille + filtres | 1.5 jours |
| **9** | Frontend : fiche projet (tous les onglets) | 3 jours |
| **10** | Frontend : création projet + recherche AD | 1 jour |
| **11** | Frontend : admin portefeuille (paramétrage) | 1 jour |
| **12** | Tests + recette + ajustements | 2 jours |
| | **Total** | **~19 jours ouvrés** |

---

## 10. Points de vigilance et évolutions futures

### Points de vigilance
- **Performance** : Le volume de données n'est pas critique (collectivité = quelques centaines de projets max). SQLite suffit largement.
- **Sécurité** : La visibilité projet est un sujet sensible — bien vérifier que tous les endpoints filtrent par droits.
- **Migration** : Si des projets existent déjà en dehors de l'application, prévoir un import CSV.
- **AD Search** : Le search AD peut être lent si mal indexé côté serveur. Utiliser debounce (400ms existant) et limiter à 20 résultats.

### Évolutions futures possibles
- **Statistiques avancées** : Graphiques d'évolution du portefeuille dans le temps
- **Export PDF/Excel** : Fiche projet, tableau de bord portefeuille
- **Workflow configurable** : Permettre à l'admin de définir les transitions autorisées
- **Validation électronique** : Signature électronique des documents
- **Intégration GLPI** : Lier des tickets GLPI aux projets
- **Reporting périodique** : Envoi automatique de bilans par mail
- **Mode déconnecté** : Consultation des projets sans connexion (PWA)
