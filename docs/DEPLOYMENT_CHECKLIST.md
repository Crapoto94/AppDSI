# Checklist de déploiement - Module Contrats

## Pré-déploiement

- [x] Module contrats créé dans `backend/modules/contrats/`
- [x] Routes API enregistrées dans `server.js`
- [x] Tables de base de données créées dans `sqlite_db.js`
- [x] Dossier de stockage `backend/file_contrats/` créé
- [x] Routes statiques configurées pour les documents
- [x] Authentification JWT et Admin appliquée aux routes
- [x] Migrations automatiques incluses pour les colonnes

## Vérification du démarrage

```bash
cd backend
npm install  # Vérifier que toutes les dépendances sont OK
timeout 10 node server.js 2>&1 | grep -E "Error|error|ERREUR"
```

- [ ] Serveur démarre sans erreur
- [ ] Les tables contrats et contrat_documents sont créées
- [ ] Les indices sont créés avec succès
- [ ] Pas d'erreurs de migration

## Tests de base

### 1. Test de connexion à l'API

```bash
# Avec un token JWT valide, testez :
curl -H "Authorization: Bearer <YOUR_TOKEN>" \
  http://localhost:3000/api/contrats
```

- [ ] Réponse 200 OK
- [ ] Retourne un tableau JSON vide ou avec des contrats

### 2. Test de création

```bash
curl -X POST -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "svc": "TEST",
    "objet": "Contrat de test",
    "raison_sociale": "Test SARL",
    "date_debut": "2024-01-01",
    "date_fin": "2025-01-01"
  }' \
  http://localhost:3000/api/contrats
```

- [ ] Réponse 201 Created
- [ ] Contrat créé avec ID

### 3. Test de récupération

```bash
curl -H "Authorization: Bearer <YOUR_TOKEN>" \
  http://localhost:3000/api/contrats/1
```

- [ ] Retourne le contrat créé

### 4. Test de modification

```bash
curl -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "objet": "Contrat de test modifié"
  }' \
  http://localhost:3000/api/contrats/1
```

- [ ] Réponse 200 OK
- [ ] Contrat mis à jour

### 5. Test d'upload de document

```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -F "file=@document.pdf" \
  -F "nature=PDF Principal" \
  -F "est_principal=1" \
  http://localhost:3000/api/contrats/1/documents
```

- [ ] Réponse 201 Created
- [ ] Fichier stocké dans `backend/file_contrats/`
- [ ] Document enregistré en base de données

### 6. Test d'accès au fichier

```bash
curl -H "Authorization: Bearer <YOUR_TOKEN>" \
  http://localhost:3000/api/contrats/documents/{filename}
```

- [ ] Télécharge le fichier
- [ ] Réponse 200 OK

### 7. Test d'import Excel

```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -F "file=@Suivi_Maintenance_2026.xlsx" \
  http://localhost:3000/api/contrats/upload-excel
```

- [ ] Réponse 200 OK
- [ ] Retourne le rapport d'import
- [ ] Contrats importés en base

## Vérification de la base de données

```bash
cd backend
sqlite3 data/database.sqlite
```

Vérifications SQL :
```sql
-- Vérifier les tables
.tables
-- Devrait montrer : contrats, contrat_documents

-- Vérifier le schéma
.schema contrats
.schema contrat_documents

-- Compter les contrats
SELECT COUNT(*) FROM contrats;

-- Vérifier les indices
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%contrats%';
```

- [ ] Table `contrats` existe
- [ ] Table `contrat_documents` existe
- [ ] Indices créés correctement
- [ ] Données importées (nombre de contrats > 0)

## Intégration frontend (à faire)

- [ ] Ajouter une tuile/menu pour accéder aux contrats
- [ ] Créer l'interface pour lister les contrats
- [ ] Créer l'interface pour créer/modifier les contrats
- [ ] Créer l'interface pour gérer les documents
- [ ] Créer l'interface pour l'import Excel
- [ ] Ajouter les liens dans le dashboard

## Migration depuis DSI_CONTRATS (si applicable)

- [ ] Backup de `DSI_CONTRATS/backend/database.sqlite` effectué
- [ ] Backup de `DSI_CONTRATS/backend/documents/` effectué
- [ ] Copie des documents vers `AppDSI/backend/file_contrats/` effectuée
- [ ] Export Excel depuis l'ancienne base effectué
- [ ] Import Excel dans la nouvelle base effectué
- [ ] Vérification des données importées
- [ ] Ancien DSI_CONTRATS archivé ou supprimé

## Notes de production

- [ ] Logs configurés et monitored
- [ ] Backup régulier de la base SQLite configuré
- [ ] Limite de taille de fichier configurée si nécessaire
- [ ] Quota d'espace disque pour `file_contrats/` vérifié
- [ ] Pas de secrets stockés dans le code (API tokens, etc.)

## Rollback en cas de problème

Si le déploiement pose problème :

1. **Backup de sécurité**
   ```bash
   cp backend/data/database.sqlite backend/data/database.sqlite.backup
   ```

2. **Revert des changements**
   - Restaurez la version précédente de `server.js` et `sqlite_db.js`
   - Supprimez le dossier `backend/modules/contrats/`
   - Supprimez le dossier `backend/file_contrats/`

3. **Nettoyage de la base de données** (si nécessaire)
   ```bash
   sqlite3 backend/data/database.sqlite
   DROP TABLE IF EXISTS contrat_documents;
   DROP TABLE IF EXISTS contrats;
   DROP INDEX IF EXISTS idx_contrats_statut;
   DROP INDEX IF EXISTS idx_contrats_direction;
   DROP INDEX IF EXISTS idx_contrats_date_fin;
   DROP INDEX IF EXISTS idx_contrat_documents_contrat_id;
   ```

## Signatures

- Implémentation : Claude (IA)
- Date d'implémentation : 2026-05-18
- Version du module : 1.0.0
- Statut : Prêt pour le déploiement

---

**Questions ou problèmes ?**
Consultez `INTEGRATION_CONTRATS.md` pour plus de détails.
