# Module Tickets — Architecture Complète (DSIHUB)

## 1. Vue d'Ensemble

### 1.1 Principes Fondamentaux

- **Schema PostgreSQL dédié** : `hub_tickets`
- **Tables core (existantes, non modifiables)** : `tickets`, `ticket_status`, `observers`, `ticket_followups` — structures identiques à `glpi.*`, copiées et alimentées par migration initiale
- **Tables d'extension** : créées dans `hub_tickets` pour SLA, catégories, règles, historique, etc.
- **Module backend** : `backend/modules/tickets/` avec architecture en couches
- **Module frontend** : `frontend/src/pages/Tickets/` avec composants modernes
- **Indépendance** : le module `hub_tickets` ne dépend pas de `glpi` (découplage total après migration)

### 1.2 Architecture en Couches (Backend)

```
┌─────────────────────────────────────────────────────┐
│                    Routes (HTTP)                      │
│  GET/POST/PUT/DELETE  →  validation JWT + RBAC       │
├─────────────────────────────────────────────────────┤
│                  Controllers                          │
│  Validation entrée, coordonne services, formate      │
│  réponse (DTO → JSON)                                │
├─────────────────────────────────────────────────────┤
│                   Services                            │
│  Règles métier, orchestrations, workflows, SLA,      │
│  notifications, automations                          │
├─────────────────────────────────────────────────────┤
│                 Repositories                          │
│  Accès BDD (pgDb queries), isolation SQL,            │
│  pagination, filtres, soft-delete                     │
├─────────────────────────────────────────────────────┤
│             PostgreSQL — hub_tickets                  │
│  20+ tables, indexées, contraintes FK                │
└─────────────────────────────────────────────────────┘
```

### 1.3 Dépendances Internes Existantes

| API/Système | Usage |
|---|---|
| `sendMail()` (server.js) | Notifications email |
| `pgDb` / `pool` (shared/pg_db.js) | Accès PostgreSQL |
| `authenticateJWT` / `authenticateAdmin` | Authentification |
| `req.user` (JWT payload) | Identité et rôle |
| `GET /api/ad/search?q=` | Auto-complétion utilisateurs |
| Modules `contrats`, `projets`, `tasks` | Relations métier |
| `hub.users` (PostgreSQL) | Référentiel utilisateurs |

---

## 2. Modèle de Données — Schema `hub_tickets`

### 2.1 Tables Core (existantes, NON modifiées)

#### `hub_tickets.tickets`

```sql
CREATE TABLE hub_tickets.tickets (
    glpi_id            INTEGER PRIMARY KEY,
    title              TEXT,
    content            TEXT,
    status             INTEGER DEFAULT 1,
    priority           INTEGER DEFAULT 3,
    urgency            INTEGER DEFAULT 3,
    impact             INTEGER DEFAULT 3,
    category           TEXT,
    type               TEXT,             -- 'incident','request','access','problem'
    date_creation      TEXT,
    date_mod           TEXT,
    date_closed        TEXT,
    date_solved        TEXT,
    location           TEXT,
    solution           TEXT,
    source             TEXT,             -- 'hub' | 'glpi'
    entity             TEXT,
    requester_name     TEXT,
    email_alt          TEXT,
    requester_email_22 TEXT,
    last_sync          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> **Contrainte** : Aucun `ALTER TABLE` autorisé. Les colonnes manquantes (assignee, SLA, etc.) sont gérées dans les tables d'extension.

#### `hub_tickets.ticket_status`

```sql
CREATE TABLE hub_tickets.ticket_status (
    id    INTEGER PRIMARY KEY,
    label VARCHAR(255) NOT NULL
);
```

Valeurs initiales (copiées depuis `glpi.ticket_status`) :

| id | label |
|---|---|
| 1 | Nouveau |
| 2 | Assigné |
| 3 | En cours |
| 4 | En attente utilisateur |
| 5 | En attente fournisseur |
| 6 | Résolu |
| 7 | Fermé |
| 8 | Rejeté |

#### `hub_tickets.observers`

```sql
CREATE TABLE hub_tickets.observers (
    id         SERIAL PRIMARY KEY,
    ticket_id  INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    name       VARCHAR(255),
    login      VARCHAR(255),
    email      VARCHAR(255),
    is_active  INTEGER DEFAULT 1,
    last_sync  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, user_id)
);
```

#### `hub_tickets.ticket_followups`

```sql
CREATE TABLE hub_tickets.ticket_followups (
    id            SERIAL PRIMARY KEY,
    ticket_id     INTEGER NOT NULL,
    content       TEXT,
    content_hash  VARCHAR(32),
    author_name   VARCHAR(255),
    author_email  VARCHAR(255),
    is_private    INTEGER DEFAULT 0,
    date_creation TIMESTAMP,
    last_sync     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, content_hash, date_creation)
);
```

### 2.2 Tables d'Extension (nouvelles dans `hub_tickets`)

#### `ticket_sequence` — Générateur d'IDs natifs

```sql
CREATE TABLE hub_tickets.ticket_sequence (
    last_id INTEGER NOT NULL
);
```

> Le module utilise un ID local (`glpi_id`) généré via une séquence. Les tickets créés dans `hub` utilisent des IDs > 10 000 000 (ou valeur configurable), les tickets importés de GLPI gardent leur ID d'origine.

#### `ticket_assignments` — Assignation technicien/groupe

```sql
CREATE TABLE hub_tickets.ticket_assignments (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    technician_id   INTEGER REFERENCES hub.users(id) ON DELETE SET NULL,
    group_id        INTEGER REFERENCES hub_tickets.technician_groups(id) ON DELETE SET NULL,
    assigned_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by     INTEGER REFERENCES hub.users(id),
    UNIQUE(ticket_id)
);
CREATE INDEX idx_ticket_assignments_tech ON hub_tickets.ticket_assignments(technician_id);
CREATE INDEX idx_ticket_assignments_group ON hub_tickets.ticket_assignments(group_id);
```

#### `technician_groups` — Groupes de techniciens

```sql
CREATE TABLE hub_tickets.technician_groups (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `technician_group_members` — Membres des groupes

```sql
CREATE TABLE hub_tickets.technician_group_members (
    id         SERIAL PRIMARY KEY,
    group_id   INTEGER NOT NULL REFERENCES hub_tickets.technician_groups(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
);
CREATE INDEX idx_tgm_group ON hub_tickets.technician_group_members(group_id);
CREATE INDEX idx_tgm_user ON hub_tickets.technician_group_members(user_id);
```

#### `ticket_categories` — Arborescence catégories/sous-catégories

```sql
CREATE TABLE hub_tickets.ticket_categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    parent_id   INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
    full_path   TEXT,                -- 'Informatique / Materiel / PC'
    is_active   BOOLEAN DEFAULT TRUE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ticket_categories_parent ON hub_tickets.ticket_categories(parent_id);
```

#### `ticket_category_assignments` — Lien ticket ↔ catégorie (remplace le champ text)

```sql
CREATE TABLE hub_tickets.ticket_category_assignments (
    id          SERIAL PRIMARY KEY,
    ticket_id   INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
    UNIQUE(ticket_id)
);
CREATE INDEX idx_tca_category ON hub_tickets.ticket_category_assignments(category_id);
```

#### `ticket_tags` — Tags disponibles

```sql
CREATE TABLE hub_tickets.ticket_tags (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    color      VARCHAR(7) DEFAULT '#6366f1',
    is_active  BOOLEAN DEFAULT TRUE
);
```

#### `ticket_tag_links` — Tags appliqués aux tickets

```sql
CREATE TABLE hub_tickets.ticket_tag_links (
    id         SERIAL PRIMARY KEY,
    ticket_id  INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES hub_tickets.ticket_tags(id) ON DELETE CASCADE,
    UNIQUE(ticket_id, tag_id)
);
CREATE INDEX idx_ttl_ticket ON hub_tickets.ticket_tag_links(ticket_id);
```

#### `ticket_attachments` — Pièces jointes

```sql
CREATE TABLE hub_tickets.ticket_attachments (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    mimetype       TEXT,
    file_size      INTEGER,
    file_path      TEXT NOT NULL,
    is_image       BOOLEAN DEFAULT FALSE,
    uploaded_by    INTEGER REFERENCES hub.users(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ticket_attachments_ticket ON hub_tickets.ticket_attachments(ticket_id);
```

#### `ticket_links` — Liens entre tickets (parent/enfant/lié/dupliqué)

```sql
CREATE TABLE hub_tickets.ticket_links (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    linked_ticket_id INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    link_type       VARCHAR(50) NOT NULL CHECK (link_type IN ('parent','child','duplicate','related','blocked_by')),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, linked_ticket_id, link_type)
);
CREATE INDEX idx_tl_ticket ON hub_tickets.ticket_links(ticket_id);
```

#### `ticket_history` — Audit trail complet

```sql
CREATE TABLE hub_tickets.ticket_history (
    id          SERIAL PRIMARY KEY,
    ticket_id   INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES hub.users(id),
    action      VARCHAR(100) NOT NULL,  -- 'created','assigned','status_changed','commented','sla_breached',...
    field_name  VARCHAR(100),
    old_value   TEXT,
    new_value   TEXT,
    comment     TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_th_ticket ON hub_tickets.ticket_history(ticket_id);
CREATE INDEX idx_th_user ON hub_tickets.ticket_history(user_id);
CREATE INDEX idx_th_created ON hub_tickets.ticket_history(created_at DESC);
```

#### `sla_calendars` — Calendriers ouvrés

```sql
CREATE TABLE hub_tickets.sla_calendars (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    timezone    VARCHAR(50) DEFAULT 'Europe/Paris',
    is_default  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `sla_calendar_hours` — Créneaux horaires par jour

```sql
CREATE TABLE hub_tickets.sla_calendar_hours (
    id           SERIAL PRIMARY KEY,
    calendar_id  INTEGER NOT NULL REFERENCES hub_tickets.sla_calendars(id) ON DELETE CASCADE,
    day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- 1=Monday
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    UNIQUE(calendar_id, day_of_week, start_time)
);
```

#### `sla_holidays` — Jours fériés

```sql
CREATE TABLE hub_tickets.sla_holidays (
    id           SERIAL PRIMARY KEY,
    calendar_id  INTEGER NOT NULL REFERENCES hub_tickets.sla_calendars(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    label        VARCHAR(255) NOT NULL,
    UNIQUE(calendar_id, holiday_date)
);
```

#### `sla_definitions` — Politiques SLA

```sql
CREATE TABLE hub_tickets.sla_definitions (
    id                 SERIAL PRIMARY KEY,
    name               VARCHAR(255) NOT NULL,
    description        TEXT,
    calendar_id        INTEGER NOT NULL REFERENCES hub_tickets.sla_calendars(id),
    first_response_min INTEGER,              -- minutes ouvrées
    resolution_min     INTEGER,
    escalation_min     INTEGER,              -- délai avant escalade
    priority           INTEGER,              -- priorité cible
    category_id        INTEGER REFERENCES hub_tickets.ticket_categories(id) ON DELETE CASCADE,
    type               VARCHAR(50),          -- 'incident','request','access','problem'
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sla_def_priority ON hub_tickets.sla_definitions(priority);
CREATE INDEX idx_sla_def_category ON hub_tickets.sla_definitions(category_id);
```

#### `ticket_sla` — SLA attachée à un ticket

```sql
CREATE TABLE hub_tickets.ticket_sla (
    id                    SERIAL PRIMARY KEY,
    ticket_id             INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    sla_definition_id     INTEGER NOT NULL REFERENCES hub_tickets.sla_definitions(id),
    first_response_target TIMESTAMP,        -- deadline prochaine réponse
    resolution_target     TIMESTAMP,        -- deadline résolution
    escalation_target     TIMESTAMP,        -- deadline escalade
    first_response_at     TIMESTAMP,        -- date effective
    resolved_at           TIMESTAMP,
    closed_at             TIMESTAMP,
    sla_status            VARCHAR(50) DEFAULT 'ok',  -- 'ok','warning','breached','paused'
    pause_count           INTEGER DEFAULT 0,
    total_paused_minutes  INTEGER DEFAULT 0,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id)
);
CREATE INDEX idx_ticket_sla_status ON hub_tickets.ticket_sla(sla_status);
```

#### `ticket_sla_pauses` — Suspensions SLA (liées aux statuts "en attente")

```sql
CREATE TABLE hub_tickets.ticket_sla_pauses (
    id          SERIAL PRIMARY KEY,
    sla_id      INTEGER NOT NULL REFERENCES hub_tickets.ticket_sla(id) ON DELETE CASCADE,
    paused_at   TIMESTAMP NOT NULL,
    resumed_at  TIMESTAMP,
    reason      VARCHAR(255),              -- 'waiting_user','waiting_supplier'
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tsp_sla ON hub_tickets.ticket_sla_pauses(sla_id);
```

#### `sla_escalation_rules` — Règles d'escalade

```sql
CREATE TABLE hub_tickets.sla_escalation_rules (
    id                  SERIAL PRIMARY KEY,
    sla_definition_id   INTEGER NOT NULL REFERENCES hub_tickets.sla_definitions(id) ON DELETE CASCADE,
    escalation_level    INTEGER NOT NULL,        -- 1, 2, 3 (manager, chef, DSI)
    trigger_before_min  INTEGER,                 -- minutes avant dépassement
    notify_role         VARCHAR(50),              -- 'supervisor','admin'
    notify_user_id      INTEGER REFERENCES hub.users(id) ON DELETE SET NULL,
    action              VARCHAR(100) DEFAULT 'notify',  -- 'notify','reassign'
    is_active           BOOLEAN DEFAULT TRUE
);
```

#### `notification_templates` — Templates d'emails

```sql
CREATE TABLE hub_tickets.notification_templates (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(100) NOT NULL UNIQUE,  -- 'ticket_created','ticket_assigned',...
    label       VARCHAR(255) NOT NULL,
    subject     TEXT NOT NULL,
    body_html   TEXT NOT NULL,
    context     VARCHAR(50) DEFAULT 'ticket',  -- 'ticket'
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `notification_triggers` — Déclencheurs

```sql
CREATE TABLE hub_tickets.notification_triggers (
    id              SERIAL PRIMARY KEY,
    event           VARCHAR(100) NOT NULL,        -- 'ticket.created','ticket.assigned',...
    template_slug   VARCHAR(100) NOT NULL REFERENCES hub_tickets.notification_templates(slug),
    recipient_type  VARCHAR(50) NOT NULL,          -- 'requester','technician','group','supervisor','admin','watchers'
    is_active       BOOLEAN DEFAULT TRUE,
    UNIQUE(event, recipient_type)
);
```

#### `notification_queue` — File d'attente d'envoi

```sql
CREATE TABLE hub_tickets.notification_queue (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name  VARCHAR(255),
    subject         TEXT NOT NULL,
    body_html       TEXT NOT NULL,
    status          VARCHAR(50) DEFAULT 'pending', -- 'pending','sent','failed'
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at         TIMESTAMP
);
CREATE INDEX idx_nq_status ON hub_tickets.notification_queue(status);
```

#### `notification_logs` — Historique des notifications

```sql
CREATE TABLE hub_tickets.notification_logs (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER REFERENCES hub_tickets.tickets(glpi_id) ON DELETE SET NULL,
    event           VARCHAR(100),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name  VARCHAR(255),
    subject         TEXT,
    status          VARCHAR(50),         -- 'sent','failed'
    error_message   TEXT,
    sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_nl_ticket ON hub_tickets.notification_logs(ticket_id);
CREATE INDEX idx_nl_sent_at ON hub_tickets.notification_logs(sent_at DESC);
```

#### `assignment_rules` — Règles d'assignation automatique

```sql
CREATE TABLE hub_tickets.assignment_rules (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    priority        INTEGER DEFAULT 0,          -- ordre d'évaluation
    match_type      VARCHAR(50),                -- 'category','type','priority','any'
    match_value     VARCHAR(255),               -- catégorie ID ou type
    assign_type     VARCHAR(50) NOT NULL,        -- 'technician','group'
    assign_to_id    INTEGER NOT NULL,            -- user_id ou group_id
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `saved_filters` — Filtres sauvegardés

```sql
CREATE TABLE hub_tickets.saved_filters (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    filter_json JSONB NOT NULL,                  -- état complet des filtres
    is_default  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);
```

#### `ticket_favorites` — Tickets favoris

```sql
CREATE TABLE hub_tickets.ticket_favorites (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
    ticket_id  INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ticket_id)
);
```

#### `ticket_relations` — Relations avec autres modules

```sql
CREATE TABLE hub_tickets.ticket_relations (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES hub_tickets.tickets(glpi_id) ON DELETE CASCADE,
    relation_type  VARCHAR(50) NOT NULL CHECK (relation_type IN ('contract','project','task','asset')),
    relation_id    INTEGER NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, relation_type, relation_id)
);
CREATE INDEX idx_tr_ticket ON hub_tickets.ticket_relations(ticket_id);
```

#### `dashboard_widgets` — Configuration des widgets du dashboard

```sql
CREATE TABLE hub_tickets.dashboard_widgets (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
    widget_type VARCHAR(100) NOT NULL,    -- 'stats_totals','sla_breaches','my_tickets','recent','priority_chart'
    config      JSONB DEFAULT '{}',
    position    INTEGER DEFAULT 0,
    is_visible  BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 Diagramme des Relations (Simplifié)

```
tickets (core, non modifiable)
  ├── ticket_assignments (1:1)
  ├── ticket_category_assignments (1:1) ── ticket_categories (N:1)
  ├── ticket_tag_links (1:N) ── ticket_tags (N:1)
  ├── ticket_attachments (1:N)
  ├── ticket_followups (1:N) -- core
  ├── observers (1:N) -- core
  ├── ticket_links (N:M)
  ├── ticket_sla (1:1) ── sla_definitions (N:1) ── sla_calendars (1:1)
  │                                    └── sla_escalation_rules (1:N)
  │   └── ticket_sla_pauses (1:N)
  ├── ticket_history (1:N)
  ├── ticket_relations (1:N) ── contrats / projets / tasks
  ├── ticket_favorites (1:N)
  ├── notification_queue (1:N)
  └── notification_logs (1:N)

technician_groups ─── technician_group_members ── hub.users
assignment_rules
saved_filters ── hub.users
dashboard_widgets ── hub.users
notification_templates ─── notification_triggers
```

---

## 3. Workflows Métier

### 3.1 Workflow des Statuts (Configurable)

```
                ┌─────────────────────────────────────┐
                │          1. Nouveau                  │
                └─────────────┬───────────────────────┘
                              │ assignation
                              ▼
                ┌─────────────────────────────────────┐
                │          2. Assigné                   │
                └─────────────┬───────────────────────┘
                              │ prise en charge
                              ▼
                ┌─────────────────────────────────────┐
         ┌─────│          3. En cours                  │─────┐
         │     └──┬──────────────┬──────────────┬──────┘     │
         │        │              │              │            │
         │  attente user   attente fourn.   résolu          │
         ▼        ▼              ▼              ▼            │
   ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌────────┐      │
   │4. Att.  │ │5. Att.   │ │ Retour     │ │6. Résolu│      │
   │User     │ │Fournisseur│ │ ←───────── │ │        │      │
   └─────────┘ └──────────┘ └────────────┘ └───┬────┘      │
         │         │                            │           │
         └─────────┴────────────┬───────────────┘           │
                                │ fermeture                 │
                                ▼                           │
                     ┌────────────────────────┐             │
                     │     7. Fermé           │             │
                     └────────────────────────┘             │
                     ┌────────────────────────┐             │
                     │     8. Rejeté          │◄────────────┘
                     └────────────────────────┘
```

### 3.2 Transitions Autorisées (Table de Configuration)

Chaque transition est stockée en base et peut être configurée :

| Statut Actuel | Statut Suivant | Rôle Requis | Condition Automatique |
|---|---|---|---|
| Nouveau | Assigné | admin/tech | Règle d'assignation |
| Nouveau | Rejeté | admin/supervisor | |
| Nouveau | En cours | admin/tech | Si assigné à soi-même |
| Assigné | En cours | tech/assigné | Prise en charge manuelle |
| Assigné | Nouveau | admin/supervisor | Réinitialisation |
| En cours | Att. utilisateur | tech | Demande d'info |
| En cours | Att. fournisseur | tech | |
| En cours | Résolu | tech/assigné | Solution fournie |
| En cours | Assigné | admin | Réassignation |
| Att. utilisateur | En cours | tech/auto | Réponse utilisateur reçue |
| Att. fournisseur | En cours | tech/auto | Réponse fournisseur |
| Att. utilisateur | Résolu | tech/auto | Si délai dépassé |
| Résolu | Fermé | auto/tech/admin | Délai de confirmation |
| Résolu | En cours | user/auto | Réouverture par demandeur |
| Fermé | En cours | admin/supervisor | Réouverture exceptionnelle |
| Rejeté | Nouveau | admin/supervisor | Réouverture |

### 3.3 Règles de Fermeture Automatique

- Résolu → Fermé : après 72h ouvrées sans action du demandeur
- Att. utilisateur → Résolu : après 7 jours calendaires sans réponse
- Rejeté → Fermé : immédiat (ou via purge hebdomadaire)

### 3.4 Workflow de Création

```
1. Création (user ou email)
   → Statut: Nouveau
   → Déclenche: notification créateur, recherche règle assignation
   
2. Application SLA
   → Calcul deadlines selon catégorie/priorité et calendrier ouvré
   
3. Règle d'assignation auto (si activée)
   → Match sur catégorie → groupe → technicien disponible (round-robin)
   → Statut: Assigné
   → Déclenche: notification technicien

4. Prise en charge (technicien)
   → Statut: En cours
   → Démarre compteur SLA
```

---

## 4. SLA — Règles de Gestion

### 4.1 Calcul des Deadlines

```
deadline = maintenant + délai_ouvré(délai_en_minutes, calendrier)
```

Fonction de calcul :
1. Itérer minute par minute (ou heure par heure) dans le futur
2. Vérifier si le timestamp tombe dans les heures ouvrées du calendrier
3. Exclure les jours fériés du calendrier
4. Compter uniquement les minutes ouvrées

### 4.2 Cibles SLA par Priorité

| Priorité | 1re Réponse | Résolution | Escalade |
|---|---|---|---|
| 1 - Très haute | 15 min | 1h | 30 min |
| 2 - Haute | 30 min | 4h | 2h |
| 3 - Normale | 2h | 24h | 8h |
| 4 - Basse | 8h | 72h | 24h |

### 4.3 Suspension SLA

Le SLA est en pause lorsque le ticket est dans un statut "en attente" :
- `Att. utilisateur` → pause
- `Att. fournisseur` → pause

Les périodes de pause sont enregistrées dans `ticket_sla_pauses` et déduites du temps total.

### 4.4 Alertes et Escalade

| Seuil | Action |
|---|---|
| 75% du délai atteint | Notification warning au technicien |
| 90% du délai atteint | Notification warning superviseur |
| Délai dépassé | Escalade niveau 1 (responsable groupe) |
| 2x délai dépassé | Escalade niveau 2 (chef de service) |
| 3x délai dépassé | Escalade niveau 3 (DSI) |

Traitée par un worker cron (`node-cron`) toutes les minutes.

### 4.5 Calendrier par Défaut

- Lundi–Vendredi : 08:00–12:00, 14:00–18:00
- Jours fériés français métropole (25 listes)
- Configurable par politique SLA

---

## 5. APIs Backend — Liste Complète

### 5.1 Tickets

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets` | authenticated | Liste paginée avec filtres |
| GET | `/api/tickets/:id` | authenticated | Détail complet |
| POST | `/api/tickets` | authenticated | Création ticket |
| PUT | `/api/tickets/:id` | tech/admin | Mise à jour |
| DELETE | `/api/tickets/:id` | superadmin | Soft delete |
| POST | `/api/tickets/:id/assign` | tech/admin | Assignation |
| POST | `/api/tickets/:id/status` | tech/admin | Changement statut |
| POST | `/api/tickets/:id/solution` | tech | Définir solution |
| POST | `/api/tickets/:id/reopen` | authenticated | Réouverture |
| POST | `/api/tickets/:id/watch` | authenticated | Devenir observateur |
| DELETE | `/api/tickets/:id/watch` | authenticated | Retrait observateur |
| POST | `/api/tickets/:id/favorite` | authenticated | Ajout favori |
| DELETE | `/api/tickets/:id/favorite` | authenticated | Retrait favori |
| GET | `/api/tickets/:id/history` | authenticated | Historique complet |
| GET | `/api/tickets/:id/sla` | authenticated | Statut SLA détaillé |

### 5.2 Commentaires (Followups)

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/:id/comments` | authenticated | Liste commentaires |
| POST | `/api/tickets/:id/comments` | authenticated | Ajout commentaire |
| PUT | `/api/tickets/:id/comments/:cid` | author/admin | Modification |
| DELETE | `/api/tickets/:id/comments/:cid` | admin | Suppression |

### 5.3 Pièces Jointes

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/:id/attachments` | authenticated | Liste fichiers |
| POST | `/api/tickets/:id/attachments` | authenticated | Upload (multer) |
| GET | `/api/tickets/:id/attachments/:aid` | authenticated | Téléchargement |
| DELETE | `/api/tickets/:id/attachments/:aid` | tech/admin | Suppression |

### 5.4 Catégories

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/categories` | authenticated | Arborescence |
| POST | `/api/tickets/categories` | admin | Création |
| PUT | `/api/tickets/categories/:id` | admin | Modification |
| DELETE | `/api/tickets/categories/:id` | admin | Suppression |

### 5.5 Tags

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/tags` | authenticated | Liste tags |
| POST | `/api/tickets/tags` | admin | Création |
| PUT | `/api/tickets/tags/:id` | admin | Modification |
| DELETE | `/api/tickets/tags/:id` | admin | Suppression |

### 5.6 Groupes Techniciens

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/groups` | authenticated | Liste groupes |
| POST | `/api/tickets/groups` | admin | Création |
| PUT | `/api/tickets/groups/:id` | admin | Modification |
| DELETE | `/api/tickets/groups/:id` | admin | Suppression |
| POST | `/api/tickets/groups/:id/members` | admin | Ajout membre |
| DELETE | `/api/tickets/groups/:id/members/:mid` | admin | Retrait membre |

### 5.7 SLA

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/sla/definitions` | admin | Liste politiques |
| POST | `/api/tickets/sla/definitions` | admin | Création |
| PUT | `/api/tickets/sla/definitions/:id` | admin | Modification |
| DELETE | `/api/tickets/sla/definitions/:id` | admin | Suppression |
| GET | `/api/tickets/sla/calendars` | admin | Calendriers |
| POST | `/api/tickets/sla/calendars` | admin | Création |
| PUT | `/api/tickets/sla/calendars/:id` | admin | Modification |
| GET | `/api/tickets/sla/escalations` | admin | Règles escalade |
| POST | `/api/tickets/sla/escalations` | admin | Création |

### 5.8 Règles d'Assignation

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/assignment-rules` | admin | Liste règles |
| POST | `/api/tickets/assignment-rules` | admin | Création |
| PUT | `/api/tickets/assignment-rules/:id` | admin | Modification |
| DELETE | `/api/tickets/assignment-rules/:id` | admin | Suppression |
| POST | `/api/tickets/assignment-rules/test` | admin | Test de simulation |

### 5.9 Dashboard & Statistiques

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/dashboard/stats` | authenticated | Statistiques globales |
| GET | `/api/tickets/dashboard/my-stats` | authenticated | Stats personnelles |
| GET | `/api/tickets/dashboard/sla-breaches` | admin | Tickets en dépassement |
| POST | `/api/tickets/dashboard/widgets` | authenticated | Sauvegarde widgets |
| GET | `/api/tickets/dashboard/widgets` | authenticated | Chargement widgets |

### 5.10 Filtres Sauvegardés

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/saved-filters` | authenticated | Mes filtres |
| POST | `/api/tickets/saved-filters` | authenticated | Création |
| PUT | `/api/tickets/saved-filters/:id` | owner | Modification |
| DELETE | `/api/tickets/saved-filters/:id` | owner | Suppression |

### 5.11 Notifications / Templates

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/notification-templates` | admin | Liste templates |
| POST | `/api/tickets/notification-templates` | admin | Création |
| PUT | `/api/tickets/notification-templates/:id` | admin | Modification |
| GET | `/api/tickets/notification-triggers` | admin | Déclencheurs |
| POST | `/api/tickets/notification-triggers` | admin | Création |

### 5.12 Admin / Configuration

| Méthode | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/api/tickets/admin/config` | superadmin | Configuration module |
| PUT | `/api/tickets/admin/config` | superadmin | Mise à jour config |
| POST | `/api/tickets/admin/migrate-from-glpi` | superadmin | Migration initiale GLPI |

---

## 6. Architecture Backend Détaillée

### 6.1 Structure des Fichiers

```
backend/modules/tickets/
├── tickets.routes.js              # Routes Express
├── tickets.controller.js          # Contrôleur principal
│
├── services/
│   ├── ticket.service.js          # CRUD tickets + logique métier
│   ├── assignment.service.js      # Moteur d'assignation
│   ├── sla.service.js             # Calcul et tracking SLA
│   ├── workflow.service.js        # Transitions statuts
│   ├── notification.service.js    # Templates, envoi, queue
│   ├── history.service.js         # Audit trail
│   ├── category.service.js        # Gestion catégories
│   ├── search.service.js          # Recherche full-text
│   └── automations.service.js     # Règles et automatismes
│
├── repositories/
│   ├── ticket.repository.js       # Queries tickets
│   ├── assignment.repository.js
│   ├── sla.repository.js
│   ├── history.repository.js
│   ├── comment.repository.js      # ticket_followups
│   ├── observer.repository.js
│   ├── category.repository.js
│   ├── tag.repository.js
│   ├── attachment.repository.js
│   ├── notification.repository.js
│   ├── filter.repository.js
│   └── group.repository.js
│
├── validators/
│   ├── ticket.validator.js        # Joi/Zod schemas
│   ├── comment.validator.js
│   ├── sla.validator.js
│   └── category.validator.js
│
├── dtos/
│   ├── ticket.dto.js              # Transformation données sortie
│   ├── comment.dto.js
│   ├── history.dto.js
│   └── sla.dto.js
│
├── events/
│   ├── ticket.events.js           # Définition des événements
│   └── event-handlers.js          # Handlers (notifications, SLA, etc.)
│
├── middleware/
│   ├── ticket-permissions.js      # Vérifications RBAC fines
│   └── ticket-upload.js           # Multer config pour pièces jointes
│
└── migrations/
    └── 001_create_hub_tickets.sql # Script création schema
```

### 6.2 Exemple de Code — Repository Pattern

```javascript
// repositories/ticket.repository.js
const { pgDb } = require('../../shared/database');

const TICKET_SELECT = `
    SELECT t.*,
           ta.technician_id, ta.group_id,
           tca.category_id,
           u.display_name as requester_display_name,
           ts.label as status_label
    FROM hub_tickets.tickets t
    LEFT JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
    LEFT JOIN hub_tickets.ticket_category_assignments tca ON t.glpi_id = tca.ticket_id
    LEFT JOIN hub.users u ON LOWER(t.requester_email_22) = LOWER(u.email)
    LEFT JOIN hub_tickets.ticket_status ts ON t.status = ts.id
`;

module.exports = {
    async findById(id) {
        return pgDb.get(`${TICKET_SELECT} WHERE t.glpi_id = $1`, [id]);
    },

    async findWithFilters(filters, pagination) {
        let where = ['t.source = $1'];
        let params = ['hub'];
        let idx = 2;

        if (filters.status) {
            where.push(`t.status = $${idx++}`);
            params.push(filters.status);
        }
        if (filters.priority) {
            where.push(`t.priority = $${idx++}`);
            params.push(filters.priority);
        }
        if (filters.technician_id) {
            where.push(`ta.technician_id = $${idx++}`);
            params.push(filters.technician_id);
        }
        if (filters.search) {
            where.push(`(t.title ILIKE $${idx} OR t.content ILIKE $${idx})`);
            params.push(`%${filters.search}%`);
            idx++;
        }

        const offset = (pagination.page - 1) * pagination.limit;
        const sql = `
            ${TICKET_SELECT}
            WHERE ${where.join(' AND ')}
            ORDER BY t.date_creation DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `;
        params.push(pagination.limit, offset);

        return pgDb.all(sql, params);
    },

    async countWithFilters(filters) {
        // requête COUNT similaire
    },

    async create(data) {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.tickets
                (glpi_id, title, content, status, priority, urgency, impact,
                 type, category, date_creation, source, requester_name, requester_email_22)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            data.glpi_id, data.title, data.content, data.status || 1,
            data.priority, data.urgency, data.impact, data.type,
            data.category, new Date().toISOString(), 'hub',
            data.requester_name, data.requester_email
        ]);
        return result.lastID;
    },

    async update(id, data) {
        // UPDATE dynamique des champs fournis
    },

    async softDelete(id) {
        return pgDb.run(
            `UPDATE hub_tickets.tickets SET status = 8, date_mod = $1 WHERE glpi_id = $2`,
            [new Date().toISOString(), id]
        );
    }
};
```

### 6.3 Service — Workflow

```javascript
// services/workflow.service.js
const TRANSITIONS = {
    1: { to: [2, 8], roles: ['admin', 'supervisor'] },           // Nouveau → Assigné/Rejeté
    2: { to: [3, 1], roles: ['tech', 'admin'], auto_assign: true }, // Assigné → En cours/Nouveau
    3: { to: [4, 5, 6, 2], roles: ['tech'] },                     // En cours → Attente/Résolu
    4: { to: [3, 6], roles: ['tech', 'auto'] },                   // Att. user → En cours
    5: { to: [3], roles: ['tech', 'auto'] },                      // Att. fourn. → En cours
    6: { to: [7, 3], roles: ['tech', 'user', 'auto'] },           // Résolu → Fermé/En cours
    7: { to: [3], roles: ['admin', 'supervisor'] },               // Fermé → En cours (réouverture)
    8: { to: [1], roles: ['admin', 'supervisor'] },               // Rejeté → Nouveau
};

const STATUS_NAMES = {
    1: 'Nouveau', 2: 'Assigné', 3: 'En cours',
    4: 'En attente utilisateur', 5: 'En attente fournisseur',
    6: 'Résolu', 7: 'Fermé', 8: 'Rejeté'
};

module.exports = {
    async changeStatus(ticketId, newStatus, userId, comment) {
        const ticket = await ticketRepo.findById(ticketId);
        const currentStatus = ticket.status;

        if (!TRANSITIONS[currentStatus]?.to.includes(newStatus)) {
            throw new Error(`Transition ${currentStatus} → ${newStatus} non autorisée`);
        }

        const result = await ticketRepo.update(ticketId, {
            status: newStatus,
            date_mod: new Date().toISOString(),
            ...(newStatus === 6 ? { date_solved: new Date().toISOString() } : {}),
            ...(newStatus === 7 ? { date_closed: new Date().toISOString() } : {})
        });

        await historyRepo.log(ticketId, userId, 'status_changed',
            currentStatus.toString(), newStatus.toString(), comment);

        await notificationService.trigger('ticket.status_changed', { ticket, oldStatus: currentStatus, newStatus });

        return result;
    }
};
```

### 6.4 Moteur d'Assignation

```javascript
// services/assignment.service.js
module.exports = {
    async autoAssign(ticket) {
        const rules = await assignmentRepo.findActiveByPriority();

        for (const rule of rules) {
            if (!this.matchesRule(ticket, rule)) continue;

            if (rule.assign_type === 'technician') {
                await this.assignToTechnician(ticket.glpi_id, rule.assign_to_id);
            } else if (rule.assign_type === 'group') {
                const tech = await this.findLeastBusyInGroup(rule.assign_to_id);
                if (tech) await this.assignToTechnician(ticket.glpi_id, tech.user_id);
            }
            return;
        }
    },

    matchesRule(ticket, rule) {
        if (rule.match_type === 'category') {
            // Vérifier catégorie du ticket
        }
        if (rule.match_type === 'priority') {
            return ticket.priority === parseInt(rule.match_value);
        }
        return true; // fallback
    },

    async findLeastBusyInGroup(groupId) {
        return pgDb.get(`
            SELECT tgm.user_id, COUNT(ta.id) as active_tickets
            FROM hub_tickets.technician_group_members tgm
            LEFT JOIN hub_tickets.ticket_assignments ta
                ON ta.technician_id = tgm.user_id
                AND ta.ticket_id IN (
                    SELECT glpi_id FROM hub_tickets.tickets
                    WHERE status IN (1, 2, 3)
                )
            WHERE tgm.group_id = $1
            GROUP BY tgm.user_id
            ORDER BY active_tickets ASC
            LIMIT 1
        `, [groupId]);
    }
};
```

### 6.5 Moteur SLA (Cron)

```javascript
// services/sla.service.js (appelé via node-cron toutes les minutes)
module.exports = {
    async checkSLAs() {
        const tickets = await pgDb.all(`
            SELECT ts.*, t.glpi_id, t.status, t.priority
            FROM hub_tickets.ticket_sla ts
            JOIN hub_tickets.tickets t ON ts.ticket_id = t.glpi_id
            WHERE ts.sla_status IN ('ok', 'warning')
              AND t.status NOT IN (4, 5, 7)  -- pas en attente ou fermé
        `);

        for (const sla of tickets) {
            const now = new Date();
            const target = new Date(sla.first_response_target || sla.resolution_target);

            const pct = (now - sla.created_at) / (target - sla.created_at) * 100;

            if (pct >= 100) {
                await this.breach(sla);
            } else if (pct >= 90 && sla.sla_status !== 'warning') {
                await this.warn(sla);
            }
        }
    },

    async pauseSLA(slaId) {
        // Insérer dans ticket_sla_pauses
    },

    async resumeSLA(slaId) {
        // Mettre à jour resumed_at, recalculer
    }
};
```

---

## 7. Architecture Frontend

### 7.1 Structure des Fichiers

```
frontend/src/
├── pages/
│   └── Tickets/
│       ├── TicketsDashboard.tsx       # Dashboard principal
│       ├── TicketList.tsx             # Liste + filtres + datatable
│       ├── TicketKanban.tsx           # Vue Kanban
│       ├── TicketDetail.tsx           # Détail ticket
│       ├── TicketCreate.tsx           # Création ticket
│       ├── TicketEdit.tsx             # Modification
│       └── TicketAdmin.tsx            # Admin (catégories, SLA, règles...)
│
├── components/
│   └── tickets/
│       ├── TicketStatusBadge.tsx      # Badge statut coloré
│       ├── TicketPriorityBadge.tsx
│       ├── TicketCard.tsx             # Carte pour Kanban/Liste
│       ├── TicketTable.tsx            # Tableau paginé triable
│       ├── TicketFilters.tsx          # Panneau de filtres
│       ├── TicketSearch.tsx           # Barre de recherche
│       ├── TicketTimeline.tsx         # Fil d'actu chronologique
│       ├── TicketComments.tsx         # Section commentaires
│       ├── TicketAttachments.tsx      # Gestion fichiers
│       ├── TicketSLAIndicator.tsx     # Barre de progression SLA
│       ├── TicketSLAConfig.tsx        # Configuration SLA
│       ├── TicketRelatedItems.tsx     # Contrats/projets/tâches liés
│       ├── TicketHistory.tsx          # Audit trail
│       ├── TicketAssignmentPanel.tsx  # Assignation tech/groupe
│       ├── TicketStatusWorkflow.tsx   # Boutons de transition
│       ├── TicketCategoryTree.tsx     # Arbre catégories
│       ├── TicketTagInput.tsx         # Sélecteur de tags
│       ├── TicketWatchers.tsx         # Gestion observateurs
│       ├── TicketLinks.tsx            # Tickets liés
│       ├── TicketForm.tsx             # Formulaire création/édition
│       ├── TicketExport.tsx           # Export CSV/PDF
│       ├── KanbanColumn.tsx           # Colonne Kanban
│       ├── SavedFilters.tsx           # Filtres sauvegardés
│       ├── FavoriteButton.tsx         # Star favori
│       └── Dashboard/
│           ├── StatsWidget.tsx
│           ├── SLAWidget.tsx
│           ├── MyTicketsWidget.tsx
│           ├── PriorityChart.tsx
│           └── RecentTickets.tsx
│
└── contexts/
    └── TicketsContext.tsx             # Contexte React (état global tickets)
```

### 7.2 Pages Principales

#### `TicketsDashboard.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ 🎫 Support IT                                    [+ Nouveau] │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [Barre de recherche...]     Filtres ▼   Sauvegardés ▼   │ │
│ ├──────────────────────────────────────────────────────────┤ │
│ │ Vue: [Tableau] [Kanban] [Liste]                         │ │
│ │                                                          │ │
│ │ ┌──────┬──────┬──────┬──────┬──────────────────────────┐ │ │
│ │ │  12  │   5  │   2  │  87% │  Tickets récents...      │ │ │
│ │ │Ouvert│À moi │ SLA  │Res.  │  - Inc #1042 ...         │ │ │
│ │ │      │      │Alert │      │  - Dem #1041 ...         │ │ │
│ │ └──────┴──────┴──────┴──────┴──────────────────────────┘ │ │
│ │                                                          │ │
│ │ ┌──────────────────────────────────────────────────────┐ │ │
│ │ │ #    Titre                 Statut    Priorité   Tech │ │ │
│ │ │ 1042 PC bloqué             🔴 En c.  ■■■■  T.H. JDM │ │ │
│ │ │ 1041 Demande badge         🟡 Nouv.  ■■   N.  à as.│ │ │
│ │ │ 1040 Accès CRM             🟢 Résolu ■■■  H.  ALI │ │ │
│ │ │ ...                                                  │ │ │
│ │ └──────────────────────────────────────────────────────┘ │ │
│ │                                           Pages: ◀ 1 2 3 ▶ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### `TicketDetail.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ ← Retour  #1042   PC bloqué - écran noir au démarrage       │
│ ★ Favori   🔗 Lier   ⋮ Plus                                 │
├────────────────────────────────┬─────────────────────────────┤
│ ┌──────────────────────────┐   │ Assignation                  │
│ │ Statut: En cours         │   │ Technicien: Jean-Dupont ▼   │
│ │ Priorité: Haute ■■■■    │   │ Groupe: Support ▼            │
│ │ Type: Incident           │   ├─────────────────────────────┤
│ │ Catégorie: Info/Materiel│   │ SLA                          │
│ │ Demandeur: Paul Martin   │   │ 1re réponse: ⬛⬛⬛⬜⬜ 75%   │
│ │ Créé: 23/05/2026 14:32  │   │ Résolution:  ⬛⬛⬜⬜⬜ 40%   │
│ └──────────────────────────┘   ├─────────────────────────────┤
│ ┌──────────────────────────┐   │ Tags                         │
│ │ Description               │   │ [urgent] [materiel] [+]     │
│ │ L'utilisateur signale...  │   ├─────────────────────────────┤
│ └──────────────────────────┘   │ Observateurs                 │
│ ┌──────────────────────────┐   │ Sophie Martin [voir]         │
│ │ Pièces jointes            │   │ Marc Dubois  [voir]         │
│ │ 📎 capture1.png  2.3MB   │   │ [+ Ajouter]                 │
│ │ 📎 logs.txt      145KB   │   ├─────────────────────────────┤
│ └──────────────────────────┘   │ Liens métier                 │
│ ┌──────────────────────────┐   │ 📄 Contrat: INFRA-2026       │
│ │ Fil d'activité            │   │ 📋 Projet: Migration AD     │
│ │ ────────────              │   │ ✅ Tâche: Installer écran   │
│ │ 14:32 Ticket créé         │   └─────────────────────────────┘
│ │ 14:35 Assigné à J.Dupont  │
│ │ 14:40 [J.Dupont] Je vais  │
│ │        vérifier le matos  │
│ │ [Ajouter un commentaire]  │
│ │ [Interne] [Public] Envoyer│
│ └──────────────────────────┘   │
├────────────────────────────────┴─────────────────────────────┤
│ [Prendre en charge] [Mettre en attente] [Résoudre] [Fermer]  │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Convention de Code Frontend

- **Composants** : React 19 + TypeScript, fonctionnels avec hooks
- **État** : `useState`/`useEffect` locaux + `TicketsContext` pour état partagé
- **Appels API** : axios (même instance que le reste de l'app)
- **UI** : Pas de librairie externe, inline CSS-in-JS (convention existante) avec classes utilitaires
- **Routage** : react-router-dom (intégré dans `App.tsx` existant)
- **Icons** : lucide-react (existant)
- **Graphiques** : recharts (existant) pour les widgets stats
- **Riche texte** : react-quill-new (existant)

### 7.4 Intégration dans le Router Existant

```typescript
// App.tsx — ajout des routes
<Route path="/tickets" element={<PrivateRoute><TicketsDashboard /></PrivateRoute>} />
<Route path="/tickets/new" element={<PrivateRoute><TicketCreate /></PrivateRoute>} />
<Route path="/tickets/:id" element={<PrivateRoute><TicketDetail /></PrivateRoute>} />
<Route path="/tickets/:id/edit" element={<PrivateRoute><TicketEdit /></PrivateRoute>} />
<Route path="/admin/tickets" element={<PrivateRoute adminOnly><TicketAdmin /></PrivateRoute>} />
```

---

## 8. Permissions (RBAC)

### 8.1 Rôles et Niveaux

| Rôle | Portée | Description |
|---|---|---|
| `superadmin` | Système | Accès total, configuration, purge |
| `admin` | Module | Gestion SLA, catégories, règles, rapports |
| `supervisor` | Groupe | Superviseur d'équipe, escalade, validation |
| `technician` | Opérationnel | Prise en charge, résolution, commentaires |
| `user` | Personel | Création, suivi, commentaires publics |
| `readonly` | Consultation | Lecture seule |

### 8.2 Permissions Fines par Action

```javascript
// middleware/ticket-permissions.js
const PERMISSIONS = {
    'ticket:read':        ['readonly', 'user', 'tech', 'supervisor', 'admin', 'superadmin'],
    'ticket:create':      ['user', 'tech', 'supervisor', 'admin', 'superadmin'],
    'ticket:update':      ['tech', 'supervisor', 'admin', 'superadmin'],
    'ticket:delete':      ['superadmin'],
    'ticket:assign':      ['supervisor', 'admin', 'superadmin'],
    'ticket:assign_self': ['tech'],
    'ticket:escalate':    ['supervisor', 'admin', 'superadmin'],
    'ticket:close':       ['tech', 'supervisor', 'admin', 'superadmin'],
    'ticket:reopen':      ['user', 'tech', 'supervisor', 'admin', 'superadmin'],
    'comment:read_private': ['tech', 'supervisor', 'admin', 'superadmin'],
    'comment:write_internal': ['tech', 'supervisor', 'admin', 'superadmin'],
    'comment:write_public': ['user', 'tech', 'supervisor', 'admin', 'superadmin'],
    'attachment:upload':    ['user', 'tech', 'supervisor', 'admin', 'superadmin'],
    'sla:configure':        ['admin', 'superadmin'],
    'category:manage':      ['admin', 'superadmin'],
    'group:manage':         ['admin', 'superadmin'],
    'rules:manage':         ['admin', 'superadmin'],
    'admin:access':         ['admin', 'superadmin'],
    'ticket:view_all':      ['supervisor', 'admin', 'superadmin'],
    'dashboard:view_stats': ['tech', 'supervisor', 'admin', 'superadmin'],
};

module.exports = {
    requirePermission(action) {
        return (req, res, next) => {
            const userRole = req.user?.role || 'user';
            const allowedRoles = PERMISSIONS[action];

            if (!allowedRoles || !allowedRoles.includes(userRole)) {
                return res.status(403).json({ message: 'Permission refusée' });
            }

            // Vérifications contextuelles supplémentaires
            if (action === 'ticket:read' && userRole === 'user') {
                // Un user ne voit que ses propres tickets
                // Vérifié dans le service
            }

            next();
        };
    }
};
```

---

## 9. Notifications

### 9.1 Événements Déclencheurs

| Événement | Destinataires | Template |
|---|---|---|
| `ticket.created` | Demandeur, watchers, tech assigné | `ticket_created` |
| `ticket.assigned` | Technicien, demandeur | `ticket_assigned` |
| `ticket.status_changed` | Demandeur, watchers, groupe | `ticket_status_changed` |
| `ticket.comment_added` | Watchers (sauf auteur) | `ticket_new_comment` |
| `ticket.sla_warning` | Technicien, supervisor | `sla_warning` |
| `ticket.sla_breached` | Technicien, supervisor, admin | `sla_breached` |
| `ticket.resolved` | Demandeur | `ticket_resolved` |
| `ticket.closed` | Demandeur | `ticket_closed` |
| `ticket.reopened` | Watchers, tech | `ticket_reopened` |

### 9.2 Templates HTML

```html
<!-- notification_templates: ticket_assigned -->
<p>Bonjour {{assignee_name}},</p>
<p>Le ticket <strong>#{{ticket_id}}</strong> — {{ticket_title}} vous a été assigné.</p>
<p>Priorité : <strong>{{priority_label}}</strong></p>
<p>Demandeur : {{requester_name}}</p>
<p>Deadline SLA : {{sla_deadline}}</p>
<p>
  <a href="{{app_url}}/tickets/{{ticket_id}}"
     style="background:#6366f1;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;">
    Voir le ticket
  </a>
</p>
```

### 9.3 File d'Attente (Queue)

```
1. Événement déclenché → notification.service.trigger(event, data)
2. Matching triggers → récupération templates + destinataires
3. Insertion dans notification_queue (status='pending')
4. Worker cron (toutes les 30s) :
   - SELECT * FROM notification_queue WHERE status='pending' LIMIT 20
   - Appel sendMail() existant
   - UPDATE status = 'sent' | 'failed'
5. Log dans notification_logs
```

---

## 10. Sécurité

| Mesure | Implémentation |
|---|---|
| **RBAC** | Middleware `requirePermission()` |
| **Validation entrées** | Schemas Joi/Zod dans `validators/` |
| **Upload fichiers** | Multer : limite 20 Mo, whitelist MIME types (pdf, doc, xls, png, jpg, zip), scan antivirus via `clamscan` si disponible |
| **XSS** | Sanitization HTML via `sanitize-html` sur `content` et commentaires |
| **CSRF** | Token JWT déjà présent dans header `Authorization` |
| **Rate limiting** | `express-rate-limit` sur endpoints sensibles (création : 10/min) |
| **Audit** | `ticket_history` pour toutes les actions |
| **Soft delete** | Tickets mis à `status=8` jamais supprimés physiquement |
| **SQL Injection** | Queries paramétrées via pgDb (`$1`, `$2`) |
| **Validation SLA** | Backend uniquement (cron) |

---

## 11. Recherche

### 11.1 Indexation Full-Text PostgreSQL

```sql
ALTER TABLE hub_tickets.tickets ADD COLUMN search_vector TSVECTOR;

CREATE FUNCTION hub_tickets.tickets_search_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('french',
        COALESCE(NEW.title, '') || ' ' ||
        COALESCE(NEW.content, '') || ' ' ||
        COALESCE(NEW.requester_name, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_search
    BEFORE INSERT OR UPDATE ON hub_tickets.tickets
    FOR EACH ROW EXECUTE FUNCTION hub_tickets.tickets_search_update();

CREATE INDEX idx_tickets_search ON hub_tickets.tickets USING GIN(search_vector);
```

> Note : Puisque les tables core ne peuvent pas être modifiées, on crée une table dédiée `ticket_search` dans `hub_tickets` si nécessaire, ou on utilise un index GIN sur une vue matérialisée.

### 11.2 Recherche Combinée (API)

```
GET /api/tickets?search=écran+noir&status=3&priority=1&tech_id=5&
    category=12&tags=14,17&date_from=2026-01-01&date_to=2026-05-23&
    sort=created_at&order=desc&page=1&limit=25
```

---

## 12. Intégration AD / LDAP

- Auto-complétion via API existante : `GET /api/ad/search?q=dupont`
- Résolution utilisateur : email/nom → `hub.users.id`
- Synchronisation quotidienne des informations (nom, email, service) via cron

---

## 13. Relations avec les Modules Existants

### 13.1 Contrats

- Table `ticket_relations` avec `relation_type='contract'`, `relation_id=contrat_id`
- API : `GET /api/contrats/:id/tickets` pour lister les tickets liés

### 13.2 Projets

- Même mécanisme avec `relation_type='project'`
- API : `GET /api/projets/:id/tickets`

### 13.3 Tâches

- `relation_type='task'`
- Les commentaires internes peuvent générer des tâches automatiquement

---

## 14. Stratégie de Migration

### 14.1 Création du Schema `hub_tickets`

```sql
CREATE SCHEMA IF NOT EXISTS hub_tickets;
```

### 14.2 Copie des Données GLPI → hub_tickets

```javascript
// migrations/001_create_hub_tickets.sql
// Exécuté via pgDb pendant setupPgDb()

async function migrateFromGLPI() {
    await client.query(`
        INSERT INTO hub_tickets.tickets
        SELECT * FROM glpi.tickets
        ON CONFLICT (glpi_id) DO NOTHING
    `);

    await client.query(`
        INSERT INTO hub_tickets.ticket_status
        SELECT * FROM glpi.ticket_status
        ON CONFLICT (id) DO NOTHING
    `);

    // Ajout des statuts supplémentaires si besoin
    await client.query(`
        INSERT INTO hub_tickets.ticket_status (id, label) VALUES
        (4, 'En attente utilisateur'),
        (5, 'En attente fournisseur'),
        (8, 'Rejeté')
        ON CONFLICT (id) DO NOTHING
    `);

    await client.query(`
        INSERT INTO hub_tickets.observers (ticket_id, user_id, name, login, email)
        SELECT ticket_id, user_id, name, login, email FROM glpi.observers
        ON CONFLICT (ticket_id, user_id) DO NOTHING
    `);

    await client.query(`
        INSERT INTO hub_tickets.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation)
        SELECT ticket_id, content, content_hash, author_name, author_email, is_private, date_creation FROM glpi.ticket_followups
        ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING
    `);
}
```

### 14.3 Gestion des IDs

- Séquence pour nouveaux tickets : `SELECT COALESCE(MAX(glpi_id), 1000000) + 1 FROM hub_tickets.tickets WHERE source = 'hub'`
- Tickets GLPI importés conservent leur `glpi_id` d'origine, avec `source='glpi'`

---

## 15. Roadmap d'Implémentation

### Sprint 1 — MVP Foundation (Semaine 1-2)

| Tâche | Effort | Priorité |
|---|---|---|
| Création schema `hub_tickets` + migration depuis `glpi` | 1j | P0 |
| Table d'extension fondamentale (assignments, catégories, tags) | 1j | P0 |
| CRUD tickets basique (create, read, list, update) | 2j | P0 |
| Workflow statuts (transitions) | 1j | P0 |
| Commentaires (ticket_followups) | 1j | P0 |
| Pièces jointes (upload/download) | 1j | P0 |
| Liste paginée avec filtres basiques | 1j | P0 |
| Interface frontend : TicketList, TicketDetail, TicketCreate | 3j | P0 |
| Middleware permissions RBAC | 1j | P0 |
| Intégration router App.tsx | 0.5j | P0 |

### Sprint 2 — SLA & Notifications (Semaine 3-4)

| Tâche | Effort | Priorité |
|---|---|---|
| Calendriers ouvrés + jours fériés | 1j | P1 |
| Définitions SLA + calcul deadlines | 2j | P1 |
| Tracking SLA + barre progression | 1j | P1 |
| Pause SLA sur statuts "en attente" | 1j | P1 |
| Templates notifications + triggers | 1.5j | P1 |
| File d'attente + worker cron email | 1j | P1 |
| Alertes SLA (warning + breach) | 1.5j | P1 |
| UI : SLAIndicator, NotificationAdmin | 2j | P1 |

### Sprint 3 — Avancé (Semaine 5-6)

| Tâche | Effort | Priorité |
|---|---|---|
| Moteur règles d'assignation automatique | 2j | P1 |
| Tags, catégories arborescentes | 1j | P1 |
| Registre d'audit (ticket_history) | 1j | P1 |
| Escalade automatique (cron) | 1.5j | P1 |
| Observateurs (watchers) | 0.5j | P1 |
| Liens entre tickets (parent/duplicate/related) | 1j | P2 |
| Relations métier (contrats, projets, tasks) | 1j | P2 |
| Vue Kanban frontend | 2j | P2 |
| Vue tableau frontend | 1j | P2 |
| Dashboard widgets statistiques | 2j | P2 |
| Filtres sauvegardés | 1j | P2 |
| Recherche full-text avancée | 1.5j | P2 |

### Sprint 4 — Finalisation (Semaine 7-8)

| Tâche | Effort | Priorité |
|---|---|---|
| Export CSV/PDF | 1j | P2 |
| Groupes techniciens + load balancing | 1.5j | P2 |
| Tests unitaires + intégration | 3j | P2 |
| Performance : index, cache, pagination | 1j | P2 |
| Audit logs centralisés (mouchard) | 0.5j | P2 |
| Documentation API + endpoints | 1j | P3 |
| Correction bugs + polish UI | 2j | P2 |

---

## 16. Stratégie de Tests

### Tests Unitaires (Jest)

```javascript
// tests/tickets/workflow.test.js
describe('Workflow transitions', () => {
    test('Nouveau → Assigné should succeed for admin', async () => {});
    test('Nouveau → Fermé should throw', async () => {});
    test('Résolu → En cours should be allowed for requester', async () => {});
});

// tests/tickets/sla.test.js
describe('SLA calculation', () => {
    test('should calculate deadline based on business hours', () => {});
    test('should skip holidays', () => {});
    test('should pause when status changes to waiting', () => {});
});

// tests/tickets/permissions.test.js
describe('RBAC permissions', () => {
    test('user cannot read private comments', () => {});
    test('technician can assign to self', () => {});
    test('supervisor can assign to any technician', () => {});
});
```

### Tests d'Intégration

- API endpoint testing avec supertest
- Validation des schémas d'entrée

---

## 17. Performance

| Technique | Application |
|---|---|
| **Index SQL** | Toutes les clés étrangères et colonnes de filtrage (status, priority, assignee, created_at) |
| **Pagination curseur** | Pour les listes de milliers de tickets |
| **Lazy loading** | Commentaires et historique chargés à la demande |
| **Cache** | Redis pour catégories, tags, statuts (si disponible) |
| **Upload optimisé** | Compression images, chunk upload pour fichiers > 10 Mo |
| **Résumé notifications** | Notifications groupées (1 email / 5 min par destinataire) |

---

## 18. Logs et Audit

| Log | Destination | Rétention |
|---|---|---|
| Actions utilisateurs | `ticket_history` | Illimitée |
| Erreurs applicatives | `logs/mouchard.log` | 90 jours |
| Envois emails | `notification_logs` | 1 an |
| Changements SLA | `ticket_sla_pauses` | Illimitée |
| Accès API | Middleware `logMouchard()` | 90 jours |

---

*Document d'architecture v1.0 — Module Tickets DSIHUB*
