# Configuration initiale - Mail Collector

Guide d'installation et de configuration du collecteur d'emails.

## 1. Initialisation de la base de données

Les tables sont créées automatiquement au démarrage du serveur si elles n'existent pas.

Les tables créées :
- `hub_tickets.mail_collectors` - Configuration des boites
- `hub_tickets.mail_rules` - Règles de classification
- `hub_tickets.mail_collector_logs` - Logs de collecte
- `hub_tickets.ticket_email_mapping` - Mapping emails ↔ tickets

## 2. Configuration O365 préalable

**Important** : Le collecteur réutilise la configuration O365 existante.

Vérifier dans `/admin/o365-mail` que les paramètres sont définis :
- Tenant ID
- Client ID
- Client Secret

Si non configuré : voir `backend/modules/admin/o365-calendar.routes.js`

### Ajouter les permissions Azure AD

1. Portal Azure AD : https://portal.azure.com
2. App registrations → Votre application
3. API permissions → Add a permission
4. Microsoft Graph :
   - ✅ `Mail.Read`
   - ✅ `Mail.Read.Shared`
   - ✅ `Files.Read.All`
5. Grant admin consent

## 3. Initialiser les règles par défaut

**Automatique** au démarrage du serveur, mais peut être forcé :

```bash
curl -X POST http://localhost:3001/api/mail-collector/rules/init-defaults \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json"
```

Réponse :
```json
{
  "message": "Règles initialisées",
  "rules": [
    {
      "id": 1,
      "name": "Demande - Accès & permissions",
      "type": "demande",
      "priority": 10,
      "is_active": true
    },
    ...
  ]
}
```

## 4. Tester la configuration O365

Vérifier que la connexion O365 fonctionne :

```bash
curl http://localhost:3001/api/mail-collector/test-config \
  -H "Authorization: Bearer <TOKEN>"
```

**Réponse OK** :
```json
{
  "message": "O365 configuré",
  "configured": true,
  "tenant": "a1b2c3d4...",
  "defaultMailbox": "support@company.com"
}
```

**Réponse erreur** :
```json
{
  "message": "O365 non configuré",
  "configured": false,
  "missing": ["client_secret", "tenant_id"]
}
```

## 5. Créer la première boite de collecte

Via API :

```bash
curl -X POST http://localhost:3001/api/mail-collector \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support - Tickets",
    "mailbox": "support@company.com",
    "domain_filter": "ivry94.fr",
    "frequency": "hourly",
    "is_enabled": true
  }'
```

Ou via `/admin/mail-collector` dans l'interface.

## 6. Tester la collecte manuelle

```bash
curl -X POST http://localhost:3001/api/mail-collector/1/run \
  -H "Authorization: Bearer <TOKEN>"
```

Réponse :
```json
{
  "message": "Collecte exécutée",
  "log": {
    "emails_received": 15,
    "emails_imported": 12,
    "emails_skipped": 2,
    "emails_failed": 1,
    "tickets_created": 8,
    "comments_added": 4,
    "attachments_processed": 6,
    "status": "partial_error",
    "errors": ["Email 'Urgent': attachment PDF too large"]
  }
}
```

## 7. Vérifier les logs

```bash
curl http://localhost:3001/api/mail-collector/1/logs \
  -H "Authorization: Bearer <TOKEN>"
```

Ou en base de données :

```sql
SELECT * FROM hub_tickets.mail_collector_logs 
ORDER BY run_at DESC LIMIT 10;
```

## 8. Dashboard d'admin

Accédez à `/admin/mail-collector` pour :
- Créer/modifier/supprimer des boites
- Créer/modifier/supprimer des règles
- Voir l'historique des collectes
- Déclencher une collecte manuelle

## 9. Customs règles

Ajouter des règles spécifiques à votre organisation :

```bash
curl -X POST http://localhost:3001/api/mail-collector/rules \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Incident - Base de données",
    "type": "incident",
    "keywords": "database|SQL|query|connection|timeout|db|crash|erreur base",
    "priority": 5,
    "is_active": true
  }'
```

## 10. Monitoring continu

Ajouter un dashboard sur la page d'accueil admin :

```sql
SELECT 
  DATE(run_at) as date,
  COUNT(*) as total_runs,
  SUM(emails_received) as total_received,
  SUM(tickets_created) as tickets_created,
  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successful
FROM hub_tickets.mail_collector_logs
GROUP BY DATE(run_at)
ORDER BY date DESC;
```

## Démarrage du serveur

```bash
cd backend
npm start
```

Vérifier les logs :
```
[MAIL COLLECTOR] Initialized
[MailScheduler] Cron scheduled for collector 1: 0 * * * *
✅ Mail Scheduler: 1 collecteurs initialisés
```

## Troubleshooting

### Problème : "O365 non configuré"

**Solution** : 
1. Aller à `/admin/o365-mail`
2. Remplir Client ID, Client Secret, Tenant ID
3. Tester avec `/api/mail-collector/test-config`

### Problème : "Boite mail introuvable"

**Solution** :
1. Vérifier l'email dans O365
2. Vérifier que le compte O365 a accès à la boite
3. Azure AD doit avoir les permissions Mail.Read

### Problème : Aucun email importé

**Possible causes** :
- La boite est vide
- Tous les emails proviennent d'un autre domaine (et filtre est actif)
- Dernier passage récent (pas d'emails depuis last_run)

**Debug** :
```bash
curl http://localhost:3001/api/mail-collector/1/logs \
  -H "Authorization: Bearer <TOKEN>"
```

Vérifier le champ `errors` dans le dernier log.

### Problème : Tickets mal classifiés

**Solution** :
1. Ajouter des règles avec les bons mots-clés
2. Tester avec `/api/mail-collector/rules/test-classification`
3. Ajuster les mots-clés selon vos emails réels

### Logs détaillés dans le serveur

```bash
# Terminal 1 : Démarrer avec logs détaillés
DEBUG=mail-collector node server.js

# Terminal 2 : Déclencher une collecte
curl -X POST http://localhost:3001/api/mail-collector/1/run \
  -H "Authorization: Bearer <TOKEN>"
```

Voir la console pour les détails de chaque étape.

## Maintenance

### Nettoyer les vieux logs

```sql
DELETE FROM hub_tickets.mail_collector_logs 
WHERE run_at < NOW() - INTERVAL '3 months';
```

### Désactiver un collecteur temporairement

```bash
curl -X PUT http://localhost:3001/api/mail-collector/1 \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

### Vider les logs sans supprimer la config

```bash
# Via SQL
DELETE FROM hub_tickets.mail_collector_logs 
WHERE collector_id = 1;

# Ou réinitialiser last_run
UPDATE hub_tickets.mail_collectors 
SET last_run = NULL 
WHERE id = 1;
```

## Backup & Restore

Exporter la configuration :

```bash
# Boites
psql -U postgres -d ivry_admin -c \
  "COPY hub_tickets.mail_collectors TO STDOUT;" > collectors.csv

# Règles
psql -U postgres -d ivry_admin -c \
  "COPY hub_tickets.mail_rules TO STDOUT;" > rules.csv

# Logs (optionnel)
psql -U postgres -d ivry_admin -c \
  "COPY hub_tickets.mail_collector_logs TO STDOUT;" > logs.csv
```

Restaurer :

```bash
# Attention : supprimer les vieilles données d'abord
psql -U postgres -d ivry_admin -c "TRUNCATE hub_tickets.mail_collectors CASCADE;"
psql -U postgres -d ivry_admin -c "COPY hub_tickets.mail_collectors FROM STDIN;" < collectors.csv
psql -U postgres -d ivry_admin -c "COPY hub_tickets.mail_rules FROM STDIN;" < rules.csv
```

## Ressources

- 📖 [README complet](./README.md)
- 📋 [Architecture détaillée](../../plans/rustling-mapping-dawn.md)
- 🔗 [Graph API Mail reference](https://learn.microsoft.com/en-us/graph/api/resources/message)
- 🔑 [Azure AD setup](https://portal.azure.com)
