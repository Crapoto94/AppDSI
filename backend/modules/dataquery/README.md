# Module dataquery — interrogation des données en lecture seule

Permet à un assistant IA (Claude) ou à un outil d'analyse d'interroger **toutes
les données PostgreSQL** de l'application (tickets, transcript manager,
photocopieurs, contrats, projets…) en **lecture seule**, y compris depuis
Internet via `chat.ivry94.fr`.

## Endpoints

| Méthode | Chemin | Rôle |
|---|---|---|
| GET  | `/api/dataquery/health` | état du module et du rôle lecture seule |
| GET  | `/api/dataquery/catalog[?schema=hub_tickets]` | modules (schémas) et tables accessibles |
| GET  | `/api/dataquery/catalog/:schema/:table` | colonnes, PK, FK |
| POST | `/api/dataquery/query` | `{ "sql": "...", "params": [...], "max_rows": 500 }` |

Authentification : en-tête `X-API-Key: dsk_…`.

## Sécurité (défense en profondeur)

1. **Clé API dédiée** : périmètre `dataquery` obligatoire (les clés « tous
   modules » `*` sont refusées) et **date d'expiration obligatoire**.
2. **Interrupteur** : désactivé tant que `DATAQUERY_ENABLED` ≠ `true`.
3. **Rôle PostgreSQL `dq_readonly`** sans aucun droit d'écriture,
   `default_transaction_read_only = on`. Le module **refuse de fonctionner** si
   le rôle configuré est superuser ou peut écrire sur une table.
4. **Données sensibles masquées au niveau PostgreSQL** (droits par colonne),
   réappliqués à chaque démarrage par `applyDataqueryGrants()` (`shared/pg_db.js`) :
   - tables dont le nom contient `api_keys|kiosk_tokens|otp|settings|config|credential|secret|oauth` : aucun accès ;
   - colonnes dont le nom contient `passw|pwd|secret|token|api_key|hash|otp|private_key|credential|pin_code|refresh|cookie|salt` : non lisibles.
5. **Chaque requête** : SELECT/WITH/TABLE/VALUES/EXPLAIN uniquement, transaction
   `READ ONLY` toujours annulée, protocole étendu (une seule instruction),
   `statement_timeout` 15 s, plafond 500 lignes (max 5000), fonctions système
   refusées (`pg_sleep`, `pg_terminate_backend`, `set_config`, `lo_*`, `dblink`…).
6. **Audit** de toutes les requêtes, y compris refusées, dans `hub.dataquery_audit`.
7. **Débit** : 300 requêtes / 10 min par clé (backend) + 2 req/s par IP (nginx DMZ).
8. **nginx DMZ** : `/api/dataquery/` uniquement, GET/POST, 100 ko max, 401 sans clé.

## Mise en service

1. Créer le rôle (une fois, en superutilisateur) :
   ```bash
   psql -h 10.103.130.106 -U postgres -d ivry_admin \
        -v dq_password="'<mot-de-passe-fort>'" \
        -f backend/modules/dataquery/sql/create_readonly_role.sql
   ```
2. Variables d'environnement du backend, puis redémarrage (les droits sont
   appliqués au démarrage ; vérifier le log `Droits lecture seule appliqués`) :
   ```
   DATAQUERY_ENABLED=true
   DATAQUERY_PG_USER=dq_readonly
   DATAQUERY_PG_PASSWORD=<mot-de-passe-fort>
   ```
3. Créer une clé dans `/admin/api-keys` : module **Interrogation SQL lecture
   seule**, permission **lecture**, **avec une date d'expiration**.
4. Redéployer le conteneur `chat/` (DMZ) pour prendre en compte la nouvelle
   `location /api/dataquery/`.

## Client CLI

```bash
export DQ_BASE_URL=https://chat.ivry94.fr DQ_API_KEY=dsk_...
node backend/scripts/dataquery-cli.js catalog
node backend/scripts/dataquery-cli.js describe hub_tickets.tickets
node backend/scripts/dataquery-cli.js sample transcript.transcripts 5
node backend/scripts/dataquery-cli.js query "SELECT status, count(*) FROM hub_tickets.tickets GROUP BY 1"
```

## Couper l'accès

- Immédiat, côté base : `ALTER ROLE dq_readonly NOLOGIN;`
- Par clé : désactiver/supprimer la clé dans `/admin/api-keys`.
- Module : `DATAQUERY_ENABLED=false` + redémarrage.
- Internet uniquement : retirer la `location /api/dataquery/` du nginx DMZ.

## Hors périmètre

- Données SQLite (paramètres AD/Azure, miroir utilisateurs) : non exposées.
- Écriture : aucune. Une future création de ticket passera par des actions
  dédiées appelant les services métier, pas par ce module.
