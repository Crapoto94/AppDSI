---
name: ged
description: >-
  GED & stockage de documents AppDSI. Explique le paramétrage de /admin/ged
  (backend de stockage filesystem/UNC/SMB, racine, identifiants ; connexion
  Alfresco ; explorateur) ET le pattern obligatoire pour stocker/servir/supprimer
  des fichiers via shared/storage.js (saveFile, getFileForServe, deleteFile) avec
  enregistrement central dans hub_docs. Déclencher dès qu'on ajoute un upload, une
  pièce jointe, un logo, un document, un fichier à un module (certificats, projets,
  parc, tickets, contrats, copieurs, etc.), qu'on parle de stocker/servir/migrer un
  fichier, du chemin de stockage, du partage UNC/SMB, de la GED ou d'Alfresco.
---

# GED & stockage de documents — pattern projet AppDSI

## Principe

**Aucun module ne réinvente son stockage de fichiers.** Tout upload passe par le
service unifié `backend/shared/storage.js`, qui écrit dans le **dépôt configuré
dans `/admin/ged`** (onglet « Stockage des documents »). Le chemin physique est
abstrait : un module ne connaît que son **nom de module**, l'**id** de l'élément,
et un **chemin BD** opaque de la forme `storage/<module>/<id>/<fichier>`.

> Référence vivante : copier le pattern de `modules/certificates/certificates.controller.js`
> (le plus complet) ou `modules/projets/projets.controller.js`.

## Paramétrage dans /admin/ged

Page `frontend/src/pages/AdminGED.tsx` + API `backend/modules/ged/`. Trois onglets :

| Onglet | Rôle | Stocké dans |
|---|---|---|
| **Stockage des documents** | Backend de fichiers réellement utilisé par les uploads | `app_settings` (SQLite), clés `storage.*` |
| **GED Alfresco** | Connexion à un serveur Alfresco (pas encore branché pour le stockage des PJ) | `app_settings`, clés de config GED |
| **Explorateur** | Navigation/upload/suppression dans la racine de stockage | — |

### Onglet « Stockage des documents » (le seul qui pilote les PJ aujourd'hui)

Réglages (clés `storage.backend|root_path|login|password|domain` dans `app_settings`) :

- **Type de stockage** : `filesystem` (local ou UNC). `ged` (Alfresco) est prévu mais
  **non supporté** côté `saveFile` (lève une erreur).
- **Chemin racine** : UNC (`\\serveur\partage\appdsi`) ou local (`D:\appdsi_files`).
  Vide ⇒ repli sur le dossier du backend. Normalisé par `normalizeRootPath`.
- **Identifiant / Mot de passe / Domaine** : activent le **mode SMB applicatif**.

### Mode SMB applicatif (Linux/Docker)

`isSmbConfig(cfg)` = vrai si **chemin UNC + login + password**. Dans ce cas l'accès
se fait via la lib `smb2` (`shared/smb_client.js`), **sans montage CIFS** — c'est ce
qui permet à l'instance Docker Linux d'écrire sur un partage Windows. Garde-fou :
sur Linux, un chemin Windows **sans** identifiants lève une erreur explicite.

Boutons : **Tester l'accès** (`/api/ged/storage-test`, écrit/supprime un fichier
témoin), **Migration** des PJ legacy (`/storage/migrate`), **Récupération** des
fichiers mal placés sur Linux (`/storage/recover`, non destructif).

## API de stockage — `shared/storage.js`

```js
const storage = require('../../shared/storage');

// Écrit un fichier ; retourne { filename, relativePath, dbPath, absolutePath }
// dbPath = "storage/<module>/<id>/<fichier>"  ← c'est CE qu'on persiste en base
const saved = await storage.saveFile(MODULE, entityId, file); // file = { buffer, originalname }

// Sert un fichier quel que soit le backend (FS local OU SMB) :
//   → { absolutePath, filename }  (res.sendFile)  OU  { buffer, filename } (res.send)  OU null
const f = await storage.getFileForServe(dbPath);

await storage.deleteFile(dbPath);            // supprime (FS ou SMB), silencieux
storage.isStoragePath(p);                    // true si p commence par "storage/"
file.originalname = storage.fixUploadName(file.originalname); // corrige le mojibake multer/latin1
```

Layout disque : `<racine>/<module>/<id>/<timestamp>-<rand>-<nom>`. Segments
`module`/`id` assainis (`sanitizeSegment`), anti-traversée de répertoire intégré.

## Servir les fichiers (URLs publiques)

Le chemin BD `storage/...` est servi tel quel par deux mounts **publics (sans JWT)**
dans `server.js` :

- `/storage/<module>/<id>/<fichier>` — liens directs (prod).
- `/api/storage/<module>/<id>/<fichier>` — **proxifié par Vite en dev** (le proxy ne
  couvre PAS `/storage`). En dev, ou pour une fenêtre `window.open`/popup, **toujours
  préférer `/api/storage/...`**.

Pour un téléchargement authentifié/contrôlé, exposer une route module qui appelle
`getFileForServe` (voir `projets` : `GET …/document/:id`, gère `inline`/`attachment`).

## Pattern complet pour AJOUTER un upload à un module

1. **Route** : `multer({ storage: multer.memoryStorage(), limits:{fileSize: …} })`,
   `upload.single('file')`. ⚠️ Déclarer la route **avant** toute route catch-all
   `/:type` (l'ordre Express compte).
2. **Controller — écrire** :
   ```js
   const MODULE = 'mon-module';
   if (req.file?.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);
   const saved = await storage.saveFile(MODULE, id, req.file);
   await pgDb.run('UPDATE … SET file_path = ? WHERE id = ?', [saved.dbPath, id]);
   ```
3. **Dual-write hub_docs** (viewer central, optionnel mais recommandé) :
   ```js
   const docsService = require('../../shared/documents.service');
   await docsService.registerExternalUpload({
     module: MODULE, entityType: 'attachment', entityId: id,
     title: req.file.originalname, filename: saved.filename,
     originalName: req.file.originalname, mimetype: req.file.mimetype,
     size: req.file.size, storageRef: saved.dbPath, uploadedBy: req.user?.username,
   }); // try/catch : ne jamais faire échouer l'upload si l'enregistrement docs échoue
   ```
4. **Servir** : route qui fait `getFileForServe(file_path)` → `res.sendFile(f.absolutePath)`
   ou `res.send(f.buffer)`, en posant `Content-Type` + `Content-Disposition`.
5. **Supprimer** : helper qui gère le **legacy** ET le nouveau stockage :
   ```js
   if (storage.isStoragePath(p)) await storage.deleteFile(p);
   else { /* ancien chemin relatif au backend : fs.unlinkSync(path.join(__dirname,'../../',p)) */ }
   ```

## Conventions & pièges

- **Persister `dbPath`** (`storage/<module>/<id>/…`), jamais un chemin absolu : il doit
  rester valide quel que soit le serveur (Windows, Docker, SMB).
- En **mode SMB, pas de chemin local** : `getAbsolutePath` renvoie `null` →
  **toujours** servir via `getFileForServe` (qui renvoie un buffer en SMB).
- **`fixUploadName`** systématique avant `saveFile` (sinon « PrÃ©sentation.pdf »).
- **Choisir le module « le plus bas »** : une PJ de tâche issue d'un ticket va dans
  `taches`, pas `tickets` (le module qui possède réellement le fichier).
- Réglages de **logo/asset global unique** : stocker sous un id fixe (ex. module
  `etiquettes`, id `logo`) et mémoriser le `dbPath` dans `app_settings`
  (cf. `modules/parc/parc.etiquette.controller.js`).
- Ne jamais committer de fichiers de stockage dans le repo.

## Checklist

- [ ] Route multer `memoryStorage` déclarée avant les routes `/:param`
- [ ] `fixUploadName` puis `storage.saveFile(MODULE, id, file)`
- [ ] `dbPath` persisté en base (colonne `file_path` ou équivalent)
- [ ] Dual-write `documents.service.registerExternalUpload` (en try/catch)
- [ ] Route de service via `getFileForServe` (FS + SMB) avec bons en-têtes
- [ ] Suppression gère legacy + `isStoragePath`/`deleteFile`
- [ ] URLs front en `/api/storage/...` (dev + popups)
