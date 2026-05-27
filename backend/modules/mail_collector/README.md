# Mail Collector - Documentation

Système de collecte d'emails O365 pour créer automatiquement des tickets.

## Configuration

### 1. Configuration O365 préalable

Le collecteur utilise la même configuration O365 que le module copieurs. Assurez-vous que :

1. Les paramètres O365 sont configurés dans `/admin/o365-mail`
2. Azure AD a les permissions :
   - `Mail.Read` - Lire les messages
   - `Mail.Read.Shared` - Lire les boites partagées
   - `Files.Read.All` - Télécharger les pièces jointes

### 2. Création d'une boite de collecte

Via `/admin/mail-collector` :

- **Nom** : Nom descriptif (ex: "Support - Tickets")
- **Email** : Adresse de la boite O365 (ex: support@company.com)
- **Domaine (optionnel)** : Filtrer les emails entrants (ex: ivry94.fr)
  - Si vide, tous les domaines sont acceptés
  - Si rempli, seuls les emails des utilisateurs avec ce domaine sont importés
- **Fréquence** :
  - `every_15_min` : Toutes les 15 minutes
  - `hourly` : Chaque heure (défaut)
  - `4_hours` : Tous les 4 heures
  - `daily` : Une fois par jour à 2h du matin
  - `manual` : Collecte manuelle seulement

### 3. Règles de classification

Les règles définissent si un ticket est une **demande** ou un **incident**.

#### Créer une règle

Via `/admin/mail-collector` onglet "Règles de classification" :

- **Nom** : Description de la règle
- **Type** : `demande` ou `incident`
- **Mots-clés** : Mots-clés séparés par `|`
  - Ex: `créer|ajouter|nouveau|demande`
- **Priorité** : Ordre d'évaluation (les plus basses en premier)

#### Règles par défaut

Des règles sont créées automatiquement au démarrage :

**Demandes** :
- Accès & permissions
- Création & ajout
- Configuration
- Assistance générale
- Modification & évolution

**Incidents** :
- Erreur & dysfonctionnement
- Indisponibilité & panne
- Performance & lenteur
- Données & corruption

#### Classification manuelle

Pour tester la classification avant création :

```bash
curl -X POST http://localhost:3001/api/mail-collector/rules/test-classification \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Bug: app ne démarre pas", "content": "La page de login crashe"}'
```

Réponse :
```json
{
  "type": 1,
  "typeLabel": "incident",
  "matches": {"demande": 0, "incident": 3}
}
```

## Flux de collecte

### 1. Récupération emails

Pour chaque boite configurée :
1. Récupère tous les emails depuis `last_run`
2. Filtre par domaine si configuré
3. Déduplique via `email_message_id`

### 2. Détection réponse

Si l'email a un header `In-Reply-To` ou un sujet commençant par `RE:` :
- Cherche le ticket initial dans `ticket_email_mapping`
- Ajoute le contenu comme commentaire
- Ajoute les pièces jointes au ticket

### 3. Création ticket (nouveaux emails)

Sinon, crée un nouveau ticket :

- **Titre** = Sujet du mail (max 255 chars)
- **Contenu** = Aperçu du mail (max 1000 chars)
- **Demandeur** = Nom + Email de l'expéditeur
- **Source** = "mail"
- **Type** = 1 (incident) ou 2 (demande) via règles
- **Statut** = 1 (Nouveau)
- **Priorité** = 3 (Normal)

### 4. Observateurs

- Récupère `To` et `Cc`
- Crée les utilisateurs manquants dans `hub.users`
- Ajoute comme observateurs via `observer.repository`

### 5. Pièces jointes

- Télécharge via Graph API `/messages/{id}/attachments`
- Stocke dans `backend/uploads/` avec pattern `mail_[timestamp]_[random].[ext]`
- Insère dans `ticket_attachments`
- Valide le type MIME (PDF, Office, ZIP, images, texte)

### 6. Logging KPI

Enregistre dans `mail_collector_logs` :
- Nombre emails reçus/importés/skippés/échoués
- Nombre tickets créés/commentaires ajoutés
- Nombre pièces jointes traitées
- Messages d'erreur
- Statut général (success/partial_error/failed)

## API Endpoints

### Collecteurs

```
GET    /api/mail-collector              # Lister tous
POST   /api/mail-collector              # Créer (admin)
GET    /api/mail-collector/:id          # Détail + logs récents
PUT    /api/mail-collector/:id          # Modifier (admin)
DELETE /api/mail-collector/:id          # Supprimer (admin)
POST   /api/mail-collector/:id/run      # Collecte manuelle
GET    /api/mail-collector/:id/logs     # Historique collectes
GET    /api/mail-collector/stats        # Statistiques globales
GET    /api/mail-collector/test-config  # Vérifier config O365
```

### Règles

```
GET    /api/mail-collector/rules                    # Lister toutes
POST   /api/mail-collector/rules                    # Créer (admin)
GET    /api/mail-collector/rules/:id                # Détail
PUT    /api/mail-collector/rules/:id                # Modifier (admin)
DELETE /api/mail-collector/rules/:id                # Supprimer (admin)
POST   /api/mail-collector/rules/test-classification # Tester classification
POST   /api/mail-collector/rules/init-defaults      # Initialiser par défaut (admin)
```

## Base de données

### Tables

#### hub_tickets.mail_collectors
```sql
id SERIAL PRIMARY KEY
name VARCHAR(255)
mailbox VARCHAR(255) UNIQUE
domain_filter VARCHAR(255)
is_enabled BOOLEAN
frequency VARCHAR(50)
last_run TIMESTAMP
next_run TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### hub_tickets.mail_rules
```sql
id SERIAL PRIMARY KEY
name VARCHAR(255)
type VARCHAR(50) -- 'demande' ou 'incident'
keywords TEXT -- séparés par |
is_active BOOLEAN
priority INTEGER
created_at TIMESTAMP
```

#### hub_tickets.mail_collector_logs
```sql
id SERIAL PRIMARY KEY
collector_id INTEGER REFERENCES mail_collectors(id)
run_at TIMESTAMP
emails_received INTEGER
emails_imported INTEGER
emails_skipped INTEGER
emails_failed INTEGER
tickets_created INTEGER
comments_added INTEGER
attachments_processed INTEGER
errors TEXT -- JSON array
status VARCHAR(50) -- 'success', 'partial_error', 'failed'
```

#### hub_tickets.ticket_email_mapping
```sql
id SERIAL PRIMARY KEY
ticket_id INTEGER REFERENCES tickets(glpi_id)
email_message_id VARCHAR(255) UNIQUE
email_in_reply_to VARCHAR(255)
is_initial_email BOOLEAN
email_from VARCHAR(255)
email_received_at TIMESTAMP
imported_at TIMESTAMP
```

## Gestion des erreurs

### Problèmes courants

**"O365 non configuré"**
- Vérifier `/admin/o365-mail`
- Client ID, Secret, Tenant ID requis

**"Boite mail déjà configurée"**
- Une boite ne peut être utilisée qu'une fois
- Créer un alias O365 si besoin d'une deuxième collecte

**"Permission Mail.Read manquante"**
- Portal Azure AD > App registrations > API permissions
- Ajouter `Mail.Read` et `Grant admin consent`

**Tickets créés mais sans observateurs**
- Les utilisateurs TO/CC non-existants sont créés automatiquement
- Vérifier dans `hub.users`

**Attachments non téléchargés**
- Format non supporté (seuls PDF, Office, ZIP, images, texte)
- Vérifier droits d'accès `Files.Read.All` en Azure AD

## Performances

- Pagination : 100 emails par requête Graph API
- Fréquence recommandée : hourly ou 4_hours
- Timeout : 30s par collecte (configurable)
- Max 20 pièces jointes par email

## Sécurité

- Pas de stockage de credentials O365 (utilise le pool de connexions)
- Déduplication obligatoire via `email_message_id`
- Filtrage par domaine optionnel
- Utilisateurs crées avec rôle par défaut `user`
- Tous les commentaires importés sont publics (`is_private=0`)

## Scheduler

Le scheduler utilise `node-cron` pour lancer les collectes automatiquement.

Lors du démarrage du serveur :
1. Charge tous les collecteurs avec `is_enabled=true`
2. Crée un cron job pour chaque fréquence
3. Met à jour `next_run` avant chaque exécution
4. Peut être reinitialisé après modification d'une boite

### Modification en direct

```javascript
const MailScheduler = require('./modules/mail_collector/mail_scheduler');

// Mettre à jour la fréquence
await MailScheduler.updateCollectorSchedule(collectorId, 'hourly');

// Désactiver
await MailScheduler.onCollectorEnabledChanged(collectorId, false);
```

## Monitoring

Accédez à `/admin/mail-collector` pour voir :

- **Dashboard des collecteurs** : Liste des boites, dernière collecte, actions rapides
- **Historique logs** : Détail de chaque collecte (reçus, importés, erreurs)
- **Statistiques globales** : Total emails reçus/importés, tickets créés, commentaires

Requête manuel :
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3001/api/mail-collector/stats
```

Réponse :
```json
[
  {
    "id": 1,
    "name": "Support",
    "mailbox": "support@company.com",
    "total_runs": 42,
    "total_received": 1200,
    "total_imported": 950,
    "total_tickets": 950,
    "total_comments": 150,
    "last_run": "2026-05-27T10:30:00Z"
  }
]
```

## Troubleshooting

Logs du serveur (startup) :
```
[MAIL COLLECTOR] Initialized
[MailScheduler] Cron scheduled for collector 1: 0 * * * *
```

Logs de collecte (dans la console) :
```
[MailScheduler] Collecte démarrée: collecteur 1
[MailScheduler] Collecte terminée: 42/45 importés
```

Pour déboguer une collecte spécifique :
```bash
curl -X POST http://localhost:3001/api/mail-collector/1/run \
  -H "Authorization: Bearer <TOKEN>"
```

Vérifier les logs dans `mail_collector_logs` :
```sql
SELECT * FROM hub_tickets.mail_collector_logs 
WHERE collector_id = 1 
ORDER BY run_at DESC LIMIT 10;
```
