# Module Contrats (Maintenance) - DSIHUB

Ce module gère les contrats de maintenance et leurs documents associés.

## Intégration dans DSIHUB

Le module `DSI_CONTRATS` a été intégré comme nouveau module dans l'architecture DSIHUB.

### Structure

```
backend/
├── modules/contrats/
│   ├── contrats.routes.js      # Définition des routes
│   ├── contrats.controller.js  # Logique métier
│   └── README.md              # Cette documentation
├── file_contrats/             # Stockage des documents joints
└── shared/sqlite_db.js        # Tables de base de données
```

### Base de données

Deux tables SQLite sont créées automatiquement :

#### `contrats` - Gestion des contrats
- `id` : ID unique
- `svc`, `objet`, `budget` : Informations générales
- `raison_sociale`, `type_contrat` : Fournisseur et type
- `date_debut`, `date_fin`, `duree_annees`, `nb_reconductions` : Dates et durée
- `montant_2022` à `montant_2026`, `prevision_2026` à `prevision_2028` : Montants
- `statut` : 'actif' ou 'archivé'
- `renouvellement_statut`, `renouvellement_commentaire` : Gestion du renouvellement
- Autres : `direction`, `service`, `nature`, `fonction`, `gti`, `gtr`, `penalite`, `indice_revision`, `numero_facture`, etc.

#### `contrat_documents` - Documents joints
- Liaison avec `contrats`
- `file_path` : Chemin du document
- `est_principal` : Document principal du contrat
- `nature` : Type de document

### API Routes

Toutes les routes requièrent une authentification JWT. Les modifications (POST, PUT, DELETE) requièrent le rôle administrateur.

#### CRUD Contrats
- `GET /api/contrats` - Lister tous les contrats
- `POST /api/contrats` - Créer un contrat
- `PUT /api/contrats/:id` - Modifier un contrat
- `DELETE /api/contrats/:id` - Supprimer un contrat

#### Gestion des documents
- `GET /api/contrats/:id/documents` - Lister les documents d'un contrat
- `POST /api/contrats/:id/documents` - Joindre un document (multer)
- `DELETE /api/contrats/:id/documents/:docId` - Supprimer un document

#### Renouvellement et statut
- `PUT /api/contrats/:id/renouvellement` - Mettre à jour le statut de renouvellement
- `PUT /api/contrats/:id/statut` - Archiver/activer un contrat

#### Import Excel
- `POST /api/contrats/upload-excel` - Importer depuis Excel
  - Recherche l'onglet "Maintenances"
  - Effectue un upsert basé sur le numéro de marché ou (svc + objet + raison_sociale)
  - Vide la table avant import

### Accès aux fichiers

- `GET /file_contrats/<nom_fichier>` - Téléchargement direct
- `GET /api/file_contrats/<nom_fichier>` - Via API (compatible multi-port)
- `GET /api/contrats/documents/<nom_fichier>` - Route API spécifique

### Configuration Multer

Les fichiers sont stockés dans `backend/file_contrats/` avec un nom unique format:
`{timestamp}-{random}-{originalname}`

### Authentification

- Lecture (GET) : `authenticateJWT` - Utilisateurs authentifiés
- Modification (POST, PUT, DELETE) : `authenticateAdmin` - Administrateurs
- Upload Excel : `authenticateAdmin` - Administrateurs

## Migration depuis DSI_CONTRATS

Si vous avez une base de données DSI_CONTRATS existante :

1. Sauvegardez les fichiers de `DSI_CONTRATS/backend/documents/` vers `AppDSI/backend/file_contrats/`
2. Connectez-vous à AppDSI et importez l'Excel via `/api/contrats/upload-excel`
3. Ou copiez la base SQLite `DSI_CONTRATS/backend/database.sqlite` et migrez les données manuellement

## Notes d'implémentation

- Le module utilise la base de données SQLite unifiée d'AppDSI (`shared/sqlite_db.js`)
- Les migrations sont gérées automatiquement au démarrage
- Indices créés pour performance : `statut`, `direction`, `date_fin`, `contrat_id`
- Validation minimale - confiez-la au frontend pour l'UX
- Pas de gestion d'erreurs complète - améliorable selon les besoins
