# Analyse du démarrage du backend

Mesure sur le conteneur de production `appdsi-backend` (redémarrage du 21/11/2026, logs Docker horodatés) :

- premier log applicatif : `07:08:49.853`
- écoute HTTP effective : `07:09:08.963`
- **démarrage perçu : environ 19,1 secondes**

## Où part le temps

| Phase | Durée approximative | Commentaire |
|---|---:|---|
| Initialisation Node, NTLM/SMB, Socket.io | ~0,7 s | Normal |
| `setupDb()` SQLite, permissions, utilisateurs | ~0,7 s | Normal |
| Recalcul des opérations budgétaires | ~0,25 s | À déplacer hors du chemin critique |
| `setupPgDb()` (schémas, tables, index, migrations) | ~16 s | **Poste principal** |
| dont migration tickets GLPI | ~4,4 s | **Dispensable** : GLPI n'est plus la source des tickets |
| dont droits `dq_readonly` | ~2,3 s | Peut être différé ou conditionné |
| Collecteurs mail, sauvegarde, bootstrap documentaire | ~0,6 s | Peut être différé après l'écoute |
| Crons, dédoublonnage, contrainte unique, copie utilisateurs | ~0,3 s | Peut être différé ou conditionné |
| Swagger, génération de la documentation des routes | ~0,2 s | Peut être différé |

Le premier client peut se connecter avant la fin des tâches de confort : ce sont surtout les migrations lourdes qui bloquent l'écoute.

## Ce qui est dispensable à chaque démarrage

### 1. Migration des tickets GLPI — supprimée par défaut

La copie `glpi.tickets` → `hub_tickets.tickets` était rejouée à chaque démarrage (upsert complet + observateurs + suivis). Elle coûtait environ **4,4 s**.

Elle est maintenant **désactivée par défaut** :

```env
GLPI_TICKETS_MIGRATION=0
```

Elle reste réactivable ponctuellement avec `GLPI_TICKETS_MIGRATION=1` si un import historique est nécessaire.

### 2. Droits du rôle `dq_readonly`

`applyDataqueryGrants()` reparcourt les tables et colonnes à chaque démarrage. C'est utile après une nouvelle table, mais inutile à chaque redémarrage à l'identique.

Piste : exécuter uniquement si le schéma a changé (empreinte des tables/colonnes) ou en tâche de fond après l'écoute.

### 3. Dédoublonnage et contrainte unique des opérations

`deduplicateOperations()` puis `ALTER TABLE ... ADD CONSTRAINT` sont des opérations de maintenance. Elles peuvent être :

- exécutées une seule fois via un marqueur de migration ;
- ou déplacées dans un écran d'administration ;
- ou lancées en tâche de fond après l'écoute.

### 4. Recalcul des opérations budgétaires

`recalculateAllOperations()` recalcule les montants consommés au démarrage. Le coût est faible aujourd'hui, mais il grandit avec le nombre d'opérations. À déplacer après l'écoute ou à déclencher à la demande.

### 5. Amorçages et collecteurs non critiques

Peuvent être lancés **après** `httpServer.listen()` :

- `runAllMigrations()` (documents) ;
- `bootstrapMobilite()` ;
- `bootstrapKnowledgeDocs()` ;
- création/génération des règles mail ;
- initialisation du planificateur de sauvegarde ;
- démarrage des crons (parapheur, service fait, virements, entretiens) ;
- génération Swagger.

Ils ne sont pas nécessaires pour répondre à la première requête.

### 6. Préchauffages déjà non bloquants

- cache du parc GLPI : ~7 s, mais **après** l'écoute ;
- cache DGP : différé de 45 s ;
- cache `/budget` : différé de 25 s.

Ces préchauffages ne bloquent pas le démarrage, mais ils consomment CPU/IO pendant les premières secondes. On peut les décaler de quelques minutes si le démarrage est prioritaire.

## Optimisation structurelle recommandée

Le vrai gain reste `setupPgDb()` : il rejoue chaque démarrage des dizaines de `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` et `CREATE INDEX`.

Recommandation :

1. créer une table `hub.schema_migrations` avec une version de schéma ;
2. découper `setupPgDb()` en migrations numérotées et idempotentes ;
3. au démarrage, ne vérifier que la version et n'exécuter que les migrations manquantes ;
4. déplacer les migrations lourdes (copie GLPI, réparations massives, index) hors du chemin critique ;
5. exposer un mode `STARTUP_FAST=1` pour les redémarrages d'urgence, avec migrations en tâche de fond.

Objectif réaliste après ces étapes : **écoute HTTP en moins de 5 secondes**, le reste en arrière-plan.

## Suivi ajouté

Des marqueurs de temps sont maintenant écrits dans les logs :

```text
[STARTUP] SQLite prête en ... ms
[STARTUP] PostgreSQL prêt en ... ms
[STARTUP] prêt à écouter après ... ms
[STARTUP] écoute active après ... ms
```

Ils permettront de mesurer chaque nouvelle optimisation sans redémarrer à l'aveugle.
