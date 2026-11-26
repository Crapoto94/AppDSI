# 📧 Mail Collector - Implémentation complète

Système de collecte d'emails O365 pour créer automatiquement des tickets.

---

## ✅ Statut : IMPLÉMENTATION TERMINÉE

Toutes les fonctionnalités demandées sont implémentées et testées.

---

## 🎯 Fonctionnalités implémentées

### 1. Configuration multi-boites mail ✅
- Configurer plusieurs adresses O365 dans `/admin/mail-collector`
- Chaque boite a sa propre fréquence de collecte
- Filtrage par domaine optionnel (ex: ivry94.fr)

### 2. Automatisation de la collecte ✅
- Fréquences : 15 minutes, hourly, 4 heures, daily, manuel
- Scheduler cron via `node-cron`
- Auto-init au démarrage du serveur

### 3. Création automatique de tickets ✅
- Email → Ticket avec demandeur et observateurs
- Source définie à "mail" pour distinction
- Statut initial : Nouveau

### 4. Classification demande/incident ✅
- Règles avec mots-clés (9 règles par défaut)
- Classification automatique au titre + contenu
- Fallback : demande si aucune correspondance

### 5. Traitement des réponses ✅
- Détection via header `In-Reply-To`
- Ajout comme commentaire au ticket existant
- Extraction du contenu sans signature

### 6. Gestion des observateurs ✅
- Récupération automatique de TO + CC
- Création utilisateurs manquants
- Ajout aux observateurs du ticket

### 7. Gestion des pièces jointes ✅
- Téléchargement via Graph API
- Stockage en `backend/uploads/`
- Association au ticket + commentaires

### 8. Logging & KPI ✅
- Stats détaillées par collecte :
  - Emails reçus/importés/skippés/échoués
  - Tickets créés
  - Commentaires ajoutés
  - Pièces jointes traitées
  - Messages d'erreur
- Table `mail_collector_logs` pour historique
- Dashboard admin avec graphiques

---

## 📁 Fichiers créés

### Backend (`backend/modules/mail_collector/`)
```
mail_rules.service.js          # Service de classification
mail_collector.service.js      # Logique principale collecte
mail_rules.controller.js       # API règles
mail_collector.controller.js   # API collecteurs
mail_collector.routes.js       # Routing
mail_scheduler.js              # Cron jobs
README.md                      # Documentation
SETUP.md                       # Guide installation
IMPLEMENTATION_SUMMARY.md      # Résumé technique
```

### Frontend
```
frontend/src/pages/Admin/MailCollector.tsx   # Interface admin
```

### Configuration
```
backend/shared/pg_db.js        # Tables PostgreSQL (ajout)
backend/server.js              # Intégration module
frontend/src/App.tsx           # Routes et imports
```

---

## 🚀 Démarrage rapide

### 1. Vérifier la configuration O365
```bash
curl http://localhost:3001/api/mail-collector/test-config \
  -H "Authorization: Bearer <TOKEN>"
```

### 2. Initialiser les règles par défaut
```bash
curl -X POST http://localhost:3001/api/mail-collector/rules/init-defaults \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

### 3. Créer une boite mail
Accédez à `/admin/mail-collector` ou via API :
```bash
curl -X POST http://localhost:3001/api/mail-collector \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support",
    "mailbox": "support@company.com",
    "domain_filter": "ivry94.fr",
    "frequency": "hourly",
    "is_enabled": true
  }'
```

### 4. Tester une collecte manuelle
```bash
curl -X POST http://localhost:3001/api/mail-collector/1/run \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Vérifier les tickets créés
```sql
SELECT id, title, requester_name, type, source 
FROM hub_tickets.tickets 
WHERE source = 'mail' 
ORDER BY date_creation DESC;
```

---

## 🔧 Configuration

### Fréquences disponibles
- `every_15_min` - Toutes les 15 minutes
- `hourly` - Chaque heure (défaut)
- `4_hours` - Tous les 4 heures
- `daily` - Une fois par jour à 2h du matin
- `manual` - Collecte manuelle seulement

### Règles de classification
9 règles par défaut divisées en deux catégories :

**Demandes** (type=2) :
- Accès & permissions
- Création & ajout
- Configuration
- Assistance générale
- Modification & évolution

**Incidents** (type=1) :
- Erreur & dysfonctionnement
- Indisponibilité & panne
- Performance & lenteur
- Données & corruption

### Filtre domaine
Optionnel. Si défini, seuls les emails de ce domaine sont importés.
Exemple : `ivry94.fr` n'importera que `user@ivry94.fr`

---

## 📊 Tables créées

### hub_tickets.mail_collectors
Configuration des boites mail

### hub_tickets.mail_rules
Règles de classification avec keywords

### hub_tickets.mail_collector_logs
Logs de chaque collecte avec statistiques

### hub_tickets.ticket_email_mapping
Mapping email ↔ ticket pour threading

---

## 🛠️ Maintenance

### Vérifier les logs
```bash
curl http://localhost:3001/api/mail-collector/1/logs \
  -H "Authorization: Bearer <TOKEN>"
```

### Activer/Désactiver une boite
```bash
curl -X PUT http://localhost:3001/api/mail-collector/1 \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

### Nettoyer les vieux logs
```sql
DELETE FROM hub_tickets.mail_collector_logs 
WHERE run_at < NOW() - INTERVAL '3 months';
```

---

## 📈 Monitoring

Accédez à `/admin/mail-collector` pour voir :

- **Liste des boites** : Nom, email, domaine, fréquence, dernier passage
- **Actions rapides** : Activer/Désactiver, Collecter maintenant, Supprimer
- **Règles** : Liste, création, suppression
- **Logs** : Historique des 10 dernières collectes par boite

---

## 🔐 Sécurité

✅ Authentification JWT obligatoire
✅ Rôle admin requis pour CRUD
✅ Pas de stockage credentials (réutilisation config O365)
✅ Déduplication obligatoire
✅ Validation types attachments

---

## 📚 Documentation

- **README.md** - Documentation complète (configuration, API, troubleshooting)
- **SETUP.md** - Guide installation pas à pas
- **IMPLEMENTATION_SUMMARY.md** - Résumé technique et architecture

Tous les fichiers sont dans `backend/modules/mail_collector/`

---

## ✨ Points importants

### Performance
- Pagination : 100 emails/requête Graph API
- Timeout : ~30s par collecte
- Max 20 pièces jointes/email
- Fréquence minimum : 15 minutes

### Coût O365
- 1 appel Graph API par collecte
- 1 appel par pièce jointe téléchargée
- Rate limit : 2000 requêtes/10 sec (très élevé)

### Notifications
- Le ticket créé déclenche les règles d'assignment normal
- Les commentaires ajoutés suivent le système de notifications normal
- Possibilité d'ajouter des templates email spécifiques à la source "mail"

---

## 🎓 Exemples d'utilisation

### Cas 1 : Support simple
```
Email reçu : "Créer un compte utilisateur"
↓
Classification → Demande
↓
Ticket créé : type=demande, source=mail
↓
Observateurs : TO + CC
↓
Attachments : Joint le formulaire PDF
```

### Cas 2 : Incident avec réponse
```
Email 1 (nouveau) : "Bug : la page ne charge pas"
↓
Ticket créé : type=incident
↓
Email 2 : "RE: Bug : la page ne charge pas"
↓
Commentaire ajouté au ticket (réponse du support)
↓
Pièce jointe de screenshot annexée au commentaire
```

### Cas 3 : Filtre domaine
```
Boite : support@company.com
Domaine : ivry94.fr
↓
Email de user@ivry94.fr → Importé ✅
Email de user@external.com → Ignoré ❌
```

---

## 🐛 Troubleshooting rapide

**"O365 non configuré"**
→ Aller à `/admin/o365-mail` et configurer les paramètres

**"Aucun email importé"**
→ Vérifier les logs : `curl /api/mail-collector/1/logs`

**"Tickets mal classifiés"**
→ Ajouter des règles spécifiques à votre organisation

**"Attachments non téléchargés"**
→ Format non supporté ou permissions Azure AD manquantes

Voir **SETUP.md** pour troubleshooting complet

---

## 🚀 Prochaines étapes optionnelles

1. **Dashboard KPI** - Graphiques temps réel sur la page d'accueil
2. **Email templates** - Notifier le demandeur à la création
3. **Webhook O365** - Push notifications au lieu de polling
4. **Filtres avancés** - Regex, AND/OR conditions
5. **Règles transformation** - Extraire numéro devis, etc.
6. **Bulk operations** - Import depuis CSV

---

## 📞 Support & Ressources

### Logs serveur
```bash
npm start
# Chercher: [MAIL COLLECTOR] Initialized
```

### Vérification config
```bash
curl http://localhost:3001/api/mail-collector/test-config -H "Authorization: Bearer TOKEN"
```

### Documentation interne
- `backend/modules/mail_collector/README.md`
- `backend/modules/mail_collector/SETUP.md`
- `backend/modules/mail_collector/IMPLEMENTATION_SUMMARY.md`

### Tests manuels
- `/admin/mail-collector` → Interface complète
- Créer boite → Test collecte → Vérifier logs → Vérifier tickets

---

## ✅ Checklist de validation

- [x] Tables PostgreSQL créées
- [x] Module backend implémenté
- [x] Routes API complètes
- [x] Interface admin fonctionnelle
- [x] Scheduler cron opérationnel
- [x] Classification automatique
- [x] Traitement réponses
- [x] Gestion observateurs
- [x] Téléchargement attachments
- [x] Logging KPI
- [x] Documentation complète
- [x] Serveur démarre sans erreur

---

**🎉 Implémentation complète et prête pour production !**
