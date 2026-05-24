# Cahier des charges — Module Support IT (Tickets)

## 1. Contexte

Module ITSM de gestion des incidents et demandes de service intégré à DSIHUB.
Inspiré de GLPI mais implémenté nativement dans l'architecture DSIHUB.

## 2. Contraintes techniques

### Base de données
- Schéma dédié `hub_tickets` dans PostgreSQL (via `pg` pool dans `backend/shared/pg_db.js`)
- Tables core `hub_tickets.tickets`, `ticket_status`, `observers`, `ticket_followups` utilisées SANS modification de leur structure
- Tables d'extension créées dans le même schéma (SLA, catégories, assignations, historique, notifications, etc.)
- Pas d'ORM — requêtes SQL directes avec paramètres `$1`, `$2`...

### Backend
- Node.js / Express
- Pas d'ORM
- Connexion PostgreSQL via le pool partagé
- Multer pour les uploads (20 Mo max, MIME whitelist)
- Stockage fichiers : `backend/file_tickets/`

### Frontend
- React 19 + TypeScript + Vite
- Mêmes conventions que les modules existants de DSIHUB
- Navigation : système de **tuiles** (pas de liens en dur dans le header)
- Chaque appel API doit inclure l'en-tête `Authorization: Bearer <token>`
- Le token est stocké dans `localStorage` (pas d'intercepteur axios global)

## 3. Architecture du système

| Couche | Technologie | Fichiers |
|---|---|---|
| Routes | Express Router | `tickets.routes.js`, `tickets-admin.routes.js` |
| Contrôleur | Contrôleur REST | `tickets.controller.js` |
| Services | Logique métier | `services/*.service.js` |
| Repositories | Accès DB | `repositories/*.repository.js` |
| DTOs | Transformation réponses | `dtos/ticket.dto.js` |
| Middleware | Permissions RBAC | `middleware/ticket-permissions.js` |
| Validators | Validation entrées | `validators/ticket.validator.js` |
| Events | Constantes d'événements | `events/ticket.events.js` |

## 4. Workflow des tickets

8 statuts avec transitions contrôlées par rôle :

```
Nouveau (1) → Assigné (2) → En cours (3) → Résolu (6) → Fermé (7)
                ↓              ↓
             Rejeté (8)    En attente (4 ou 5)
                              ↓
                          En cours (3) (reprise)
```

## 5. Rôles et permissions

| Rôle | Droits |
|---|---|
| `user` | Créer, voir ses tickets, commenter |
| `technician` | Prendre en charge, résoudre, commenter (public + interne) |
| `supervisor` | Assigner, voir tous les tickets, dashboard |
| `admin` | Configurer SLA, catégories, groupes, règles |
| `superadmin` | Supprimer, admin système |

Mapping des rôles DSIHUB → tickets dans `middleware/ticket-permissions.js`.

## 6. Points d'API

### Tickets ( `/api/tickets` )
- `GET /` — Liste paginée (filtres : status, priorité, technicien, groupe, type, recherche, favoris, dates)
- `GET /:id` — Détail
- `POST /` — Création
- `PUT /:id` — Mise à jour
- `DELETE /:id` — Suppression logique

### Actions
- `POST /:id/assign` — Assignation (manuelle ou auto)
- `POST /:id/status` — Changement de statut (workflow)
- `POST /:id/solution` — Enregistrement solution
- `POST /:id/reopen` — Réouverture
- `POST /:id/watch` / `DELETE /:id/watch` — Observateurs
- `POST /:id/favorite` / `DELETE /:id/favorite` — Favoris

### Commentaires
- `GET /:id/comments`, `POST /:id/comments`, `PUT /:id/comments/:cid`, `DELETE /:id/comments/:cid`

### Pièces jointes
- `GET /:id/attachments`, `POST /:id/attachments`, `GET /:id/attachments/:aid`, `DELETE /:id/attachments/:aid`

### Dashboard
- `GET /dashboard/stats` — Statistiques globales
- `GET /dashboard/my-stats` — Stats du technicien connecté
- `GET /dashboard/sla-breaches` — Dépassements SLA
- `GET /dashboard/widgets`, `POST /dashboard/widgets` — Widgets personnalisés

### Administration ( `/api/tickets/admin` )
- CRUD : catégories, tags, groupes techniciens, SLA, règles d'assignation
- Templates et déclencheurs de notifications

## 7. Intégration dans DSIHUB

### Tuile
- Créer une tuile "Support IT" via la migration dans `backend/shared/sqlite_db.js`
- Tuile publique (`is_public = 1`) pour accessibilité à tous les utilisateurs authentifiés
- 3 liens : Voir les tickets (`/tickets`), Nouveau ticket (`/tickets/new`), Administration (`/admin/tickets`)
- Icône lucide-react : `Ticket` (fallback `Box`)

### Routes frontend ( `App.tsx` )
```
/tickets          → TicketsDashboard
/tickets/new      → TicketCreate
/tickets/:id      → TicketDetail
/admin/tickets    → TicketAdmin
```

### Authentification
- Chaque route est protégée par `<PrivateRoute>`
- Les superadmins ont accès à tout (`authorized_urls: ['*']`)
- Les autres utilisateurs doivent avoir `/tickets` dans leurs `authorized_urls`
- Les tuiles publiques ajoutent automatiquement leurs URLs aux `authorized_urls`

## 8. Pages frontend

| Page | Fichier | Description |
|---|---|---|
| Dashboard tickets | `TicketsDashboard.tsx` | Stats, recherche, toggle tableau/Kanban |
| Liste (tableau) | `TicketList.tsx` | Tableau triable avec checkboxes |
| Vue Kanban | `TicketKanban.tsx` | Colonnes par statut (drag-and-drop visuel) |
| Détail ticket | `TicketDetail.tsx` | Infos, workflow, commentaires, historique |
| Création ticket | `TicketCreate.tsx` | Formulaire avec type, priorité, catégorie |
| Administration | `TicketAdmin.tsx` | 7 onglets (catégories, tags, groupes, SLA, règles, templates, triggers) |

## 9. Données initiales

- Migration depuis `glpi.*` : tickets, statuts, observateurs, followups
- Seed : templates de notification, SLA P1–P4, calendrier d'exploitation
- Les nouveaux tickets créés dans le hub utilisent des IDs négatifs ou décalés (via `glpi_id` basé sur `MAX+1` ou `10000000+1`)
- Distinction ticket natif (`source = 'hub'`) vs synchronisé (`source = 'glpi'`)

## 10. Conventions de code

- Fichiers en camelCase
- Exports `module.exports = { ... }` (CommonJS, pas d'ES modules)
- Fonctions `async` avec try/catch
- Requêtes PostgreSQL avec paramètres numérotés (`$1`, `$2`...)
- Les composants React utilisent `localStorage.getItem('token')` pour le token JWT
- Style inline ou CSS dans le composant (pas de fichiers CSS séparés)
