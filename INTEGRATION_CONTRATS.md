# Intégration du Module Contrats dans DSIHUB

## Résumé de l'intégration

Le module `DSI_CONTRATS` a été intégré avec succès dans l'architecture DSIHUB. Tous les contrats et leurs documents sont maintenant gérés dans une base de données unifiée, accessible via des API RESTful sécurisées.

## Changements apportés

### 1. Structure du module

**Nouveau module créé :**
- `backend/modules/contrats/` - Module de gestion des contrats
  - `contrats.routes.js` - Définition des routes API
  - `contrats.controller.js` - Logique métier
  - `README.md` - Documentation technique

**Dossier de stockage :**
- `backend/file_contrats/` - Stockage des documents joints

### 2. Base de données

**Tables créées dans SQLite :**

**`contrats`** - Information sur les contrats
- Colonnes principales : `svc`, `objet`, `budget`, `raison_sociale`, `type_contrat`
- Colonnes temporelles : `date_debut`, `date_fin`, `duree_annees`, `nb_reconductions`
- Montants annuels : `montant_2022` à `montant_2026`
- Prévisions : `prevision_2026` à `prevision_2028`
- Métadonnées : `direction`, `service`, `nature`, `fonction`, `gti`, `gtr`, `penalite`, `indice_revision`, `numero_facture`
- Renouvellement : `renouvellement_statut`, `renouvellement_commentaire`
- Documents : `doc_principal_path`, `doc_principal_nom`
- Statut : `statut` ('actif' ou 'archivé')

**`contrat_documents`** - Documents associés aux contrats
- Liaison avec `contrats` via `contrat_id`
- Chemin et nom du fichier
- Type de document (`nature`)
- Indicateur de document principal (`est_principal`)

**Indices créés :**
- `idx_contrats_statut` - Recherche par statut
- `idx_contrats_direction` - Recherche par direction
- `idx_contrats_date_fin` - Tri par date de fin
- `idx_contrat_documents_contrat_id` - Performance des requêtes sur les documents

### 3. API Endpoints

Toutes les routes sont préfixées par `/api/contrats`.

#### Authentification requise
- Lectures (GET) : JWT
- Modifications (POST, PUT, DELETE) : Administrateur JWT

#### CRUD Contrats
```
GET    /api/contrats                      - Lister tous les contrats (trié par date fin)
POST   /api/contrats                      - Créer un contrat
PUT    /api/contrats/:id                  - Modifier un contrat
DELETE /api/contrats/:id                  - Supprimer un contrat
```

#### Gestion des documents
```
GET    /api/contrats/:id/documents        - Lister les documents d'un contrat
POST   /api/contrats/:id/documents        - Joindre un document (multipart/form-data)
DELETE /api/contrats/:id/documents/:docId - Supprimer un document
```

#### Renouvellement et statut
```
PUT    /api/contrats/:id/renouvellement   - Mettre à jour le statut de renouvellement
PUT    /api/contrats/:id/statut           - Archiver ou activer un contrat
```

#### Import Excel
```
POST   /api/contrats/upload-excel         - Importer depuis Excel (multipart/form-data)
```

### 4. Intégration au serveur principal

**Fichiers modifiés :**

1. **`backend/server.js`**
   - Import du router : `const contratsRouter = require('./modules/contrats/contrats.routes');`
   - Enregistrement : `app.use('/api/contrats', contratsRouter);`
   - Routes statiques pour les fichiers : `/file_contrats`, `/api/file_contrats`
   - Route regex pour API : `/api/contrats/documents/(.*)`
   - Dossier ajouté à la liste des dossiers créés : `file_contrats`

2. **`backend/shared/sqlite_db.js`**
   - Création des tables `contrats` et `contrat_documents` 
   - Création des indices pour performance
   - Migrations automatiques pour les colonnes supplémentaires

### 5. Configuration Multer

Les documents sont stockés avec un nom unique pour éviter les conflits :
```
Format : {timestamp}-{nombre aléatoire}-{nom original}
Exemple : 1702312345123-987654321-contrat-2024.pdf
```

## Utilisation

### Pour les utilisateurs finaux

1. **Accès à la liste des contrats**
   ```
   GET /api/contrats
   Header: Authorization: Bearer <token>
   ```

2. **Création d'un contrat**
   ```
   POST /api/contrats
   Body: JSON avec les champs du contrat
   ```

3. **Joindre un document**
   ```
   POST /api/contrats/123/documents
   Body: multipart/form-data
     - file : fichier à joindre
     - nature : type de document
     - est_principal : 1 ou 0
   ```

4. **Import Excel en masse**
   ```
   POST /api/contrats/upload-excel
   Body: multipart/form-data avec le fichier Excel
   L'onglet "Maintenances" doit exister
   ```

### Migration depuis DSI_CONTRATS

Si vous avez des données dans l'ancienne application DSI_CONTRATS :

1. **Sauvegarde des documents**
   ```bash
   cp -r DSI_CONTRATS/backend/documents/* AppDSI/backend/file_contrats/
   ```

2. **Import des données**
   - Exportez la base de données DSI_CONTRATS en Excel
   - Utilisez l'API `/api/contrats/upload-excel` pour importer

3. **Vérification**
   - Consultez `/api/contrats` pour vérifier que les contrats sont importés

## Notes de développement

### Performance
- Indices créés sur les colonnes principales pour les recherches
- Utilise SQLite pour les petits volumes
- Peut être migré vers PostgreSQL si nécessaire

### Sécurité
- Authentification JWT requise pour toutes les routes
- Rôle administrateur pour les modifications
- Chemins de fichiers contrôlés (validation dans les routes)

### Limitations actuelles
- Pas de gestion des fichiers volumineux (multer par défaut)
- Pas de signature numérique des documents
- Pas de version/historique des contrats
- Pas de notifications pour les renouvellements

### Améliorations futures possibles
1. Ajouter un tableau de bord avec contrats expirés
2. Ajouter des notifications avant la date de fin
3. Ajouter une signature numérique pour les documents
4. Ajouter un workflow d'approbation
5. Ajouter une historique des modifications
6. Intégrer avec les alerts du module finance

## Fichiers clés

```
backend/
├── modules/contrats/
│   ├── contrats.routes.js          (90 lignes)
│   ├── contrats.controller.js      (360 lignes)
│   └── README.md
├── file_contrats/                  (dossier de stockage)
├── shared/sqlite_db.js             (modifié - tables ajoutées)
├── server.js                       (modifié - routes intégrées)
└── package.json                    (dépendances - xlsx déjà présent)
```

## Testez l'intégration

```bash
# 1. Vérifiez que le serveur démarre
cd backend
npm install
node server.js

# 2. Dans un autre terminal, testez l'API
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/contrats

# 3. Importez un fichier Excel
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@Suivi_Maintenance.xlsx" \
  http://localhost:3000/api/contrats/upload-excel
```

## Support et questions

Consultez `backend/modules/contrats/README.md` pour plus de détails techniques.
