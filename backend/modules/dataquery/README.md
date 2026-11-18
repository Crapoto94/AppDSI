# Module dataquery — interrogation des données en lecture seule

Permet à un assistant IA (Claude) ou à un outil d'analyse d'interroger **toutes
les données PostgreSQL** de l'application (tickets, transcript manager,
photocopieurs, contrats, projets…) en **lecture seule**.

Depuis Internet, l'accès se fait **uniquement via le serveur MCP de la DMZ**
(`https://chat.ivry94.fr/mcp`, cf. [`chat/mcp/README.md`](../../../chat/mcp/README.md)),
qui trace tous les flux. Cette API n'est pas publiée en DMZ ; elle sert au MCP
et au CLI sur le LAN.

## Endpoints

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `/api/dataquery/auth/login` | `{ username, password }` (AD) → `{ session }` — clé API seule |
| POST | `/api/dataquery/auth/logout` | révoque la session |
| GET  | `/api/dataquery/health` | état du module, personne connectée |
| GET  | `/api/dataquery/catalog[?schema=hub_tickets]` | modules (schémas) et tables accessibles |
| GET  | `/api/dataquery/catalog/:schema/:table` | colonnes, PK, FK |
| POST | `/api/dataquery/query` | `{ "sql": "...", "params": [...], "max_rows": 500 }` |

**Double authentification**, exigée à chaque requête :
1. `X-API-Key: dsk_…` — clé de périmètre `dataquery` avec expiration ;
2. `X-DQ-Session: …` — session personnelle ouverte par `/auth/login` avec les
   identifiants Windows (AD). Signée avec `DATAQUERY_SESSION_SECRET` (distinct du
   secret JWT de l'application), liée à la clé utilisée, 8 h max, révocable
   (`hub.dataquery_sessions`). Les jetons du chat ne sont **pas** acceptés : le
   `guest-login` public permet d'en obtenir un avec un nom/email quelconques.

Personnes autorisées : rôle `superadmin` dans `hub.users`, ou liste
`DATAQUERY_ALLOWED_USERS` (revérifié à chaque requête). Anti brute-force :
5 échecs / 15 min par identifiant, 20 par IP.

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
6. **Audit** de toutes les requêtes, y compris refusées et des connexions,
   dans `hub.dataquery_audit`, avec le **nom de la personne** et l'**identifiant
   de trace** MCP (`trace_id`) pour croiser avec les traces de la DMZ.
7. **Débit** : 300 requêtes / 10 min par clé.

## Mise en service

Procédure complète et pas à pas : [`DEPLOIEMENT_MCP.md`](../../../DEPLOIEMENT_MCP.md).


1. Créer le rôle, les tables et les droits (script idempotent, sans mot de passe),
   puis définir le mot de passe en saisie masquée :
   ```bash
   psql -h 10.103.130.106 -U postgres -d ivry_admin -f backend/modules/dataquery/sql/setup_global.sql
   psql -h 10.103.130.106 -U postgres -d ivry_admin
   ivry_admin=# \password dq_readonly        -- saisie masquée, deux fois
   ```
2. Variables d'environnement du backend (fichier `.env` à côté du
   `docker-compose.yml` racine, transmises par celui-ci), puis redémarrage (les droits sont
   appliqués au démarrage ; vérifier le log `Droits lecture seule appliqués`) :
   ```
   DATAQUERY_ENABLED=true
   DATAQUERY_PG_USER=dq_readonly
   DATAQUERY_PG_PASSWORD=<mot-de-passe-fort>
   DATAQUERY_SESSION_SECRET=<au moins 32 caractères aléatoires : openssl rand -base64 48>
   # facultatif :
   DATAQUERY_ALLOWED_USERS=prenom.nom,autre.compte   # en plus des superadmins
   DATAQUERY_SESSION_TTL_HOURS=8
   ```
3. Créer une clé dans `/admin/api-keys` : module **Interrogation SQL lecture
   seule**, permission **lecture**, **avec une date d'expiration**.
4. Redéployer le conteneur `chat/` (DMZ) : serveur MCP + page `/mcp/login`.

## Client CLI (LAN)

```bash
export DQ_BASE_URL=http://<backend>:3001 DQ_API_KEY=dsk_...
node backend/scripts/dataquery-cli.js login prenom.nom   # mot de passe demandé
node backend/scripts/dataquery-cli.js catalog
node backend/scripts/dataquery-cli.js describe hub_tickets.tickets
node backend/scripts/dataquery-cli.js sample transcript.transcripts 5
node backend/scripts/dataquery-cli.js query "SELECT status, count(*) FROM hub_tickets.tickets GROUP BY 1"
```

## Couper l'accès

- Immédiat, côté base : `ALTER ROLE dq_readonly NOLOGIN;`
- Une personne : `UPDATE hub.dataquery_sessions SET revoked_at = NOW() WHERE username = '…';`
- Par clé : désactiver/supprimer la clé dans `/admin/api-keys`.
- Module : `DATAQUERY_ENABLED=false` + redémarrage.
- Internet uniquement : commenter les blocs `/mcp` du nginx DMZ (`chat/nginx.conf.template`).

## Hors périmètre

- Données SQLite (paramètres AD/Azure, miroir utilisateurs) : non exposées.
- Écriture : aucune. Une future création de ticket passera par des actions
  dédiées appelant les services métier, pas par ce module.
