# Déploiement du module dataquery et du serveur MCP — procédure exacte

> **Destinataire : une session Claude Code locale** lancée dans `C:\dev\AppDSI` (Windows),
> qui accompagne Marc pas à pas. Le texte sert aussi de procédure lisible par un humain.
>
> Point de départ : le code est sur `main` et déjà déployé sur **dsihub.ivry.local** (LAN).
> Il reste la configuration (base, variables, clé), les tests, puis la DMZ.

---

## Règles pour la session Claude locale (à respecter strictement)

1. **Ne jamais voir, afficher ni écrire un secret.** Cela concerne :
   - les mots de passe (`postgres`, `dq_readonly`, AD) ;
   - la clé API `dsk_…` ;
   - `DATAQUERY_SESSION_SECRET` et `JWT_SECRET`.

   Conséquences :
   - Ne jamais demander à Marc de coller un secret dans la conversation.
   - Un secret est soit **saisi par Marc lui-même** dans son terminal (saisie masquée), soit **généré par une commande qui l'écrit directement dans le fichier de destination** sans l'afficher.
   - Les contrôles ne montrent que « présent / absent / longueur », jamais la valeur.
2. **Demander confirmation avant chaque action qui modifie la prod** : SQL, fichier `.env`, redémarrage de conteneur.
3. **Comparer chaque résultat au « résultat attendu ».** En cas d'écart, s'arrêter, expliquer et proposer une piste, sans improviser de contournement.
4. **Ne pas modifier le code applicatif ni committer** pendant cette procédure. Le fichier `.env` n'est jamais commité ; il est déjà dans `.gitignore`.
5. **Commandes interactives** (`psql` qui demande un mot de passe, `\password`, `login` du CLI) : les faire exécuter par Marc dans son propre terminal, puis lui demander de coller la **sortie** (qui ne contient pas de secret).
6. **À la fin**, produire un récapitulatif : chaque étape marquée *réussie*, *échouée (raison)* ou *non faite (raison)*.

---

## Architecture (rappel)

```
Internet ──HTTPS──▶ chat.ivry94.fr (conteneur DMZ « chat/ » : nginx + serveur MCP Node)
                         │  /mcp, /mcp/oauth/*, /.well-known/oauth-*   (page /mcp/login = front chat)
                         ▼  flux DMZ → LAN déjà ouvert : TCP 3001
LAN ─────────────▶ dsihub.ivry.local : conteneur appdsi-backend (port 3001)
                         │  /api/dataquery/*  (clé API + session personnelle AD)
                         ▼  rôle PostgreSQL dq_readonly (lecture seule)
                   PostgreSQL 10.103.130.106 / ivry_admin
```

- **Double authentification** : clé API `dsk_…` (module « Interrogation SQL lecture seule ») **et** identifiant + mot de passe Windows (AD), vérifiés par le backend.
- **Personnes autorisées** : tout compte du DSIHUB, c'est-à-dire présent dans la table `users` de SQLite (quel que soit son rôle), ou liste `DATAQUERY_ALLOWED_USERS`. Le verrou réel est la clé API (une par personne, avec expiration).
- **Traçabilité** :
  - côté DMZ, traces JSONL de tous les flux du MCP ;
  - côté backend, audit dans `hub.dataquery_audit` ;
  - les deux sont reliés par `trace_id`.
- **Détails** : `backend/modules/dataquery/README.md` et `chat/mcp/README.md`.

---

## Étape 0 — Préparer le poste

```bat
cd C:\dev\AppDSI
git pull origin main
git log --oneline -1
```
**Attendu** : le dernier commit mentionne `DEPLOIEMENT_MCP.md`.

Lire `pulldocker.bat` (à la racine de `C:\dev\AppDSI`, non versionné) pour savoir **comment le déploiement atteint dsihub.ivry.local**. Il faut en tirer :
- l'hôte ;
- l'accès (ssh ou autre) ;
- le dossier du projet sur le serveur ;
- les commandes lancées.

Les étapes 2 et 4 se font **sur ce serveur, dans ce dossier**, appelé ci-dessous `<DOSSIER_SERVEUR>`. C'est celui qui contient `docker-compose.yml`.

Vérifier les outils :
```bat
psql --version
node --version
curl --version
```
**Attendu** :
- `psql` présent (sinon : installer le client PostgreSQL, ou passer par pgAdmin aux étapes 3 et 6) ;
- `node` 18 ou plus ;
- `curl` présent.

> ⚠️ **Le commit de cette procédure modifie `docker-compose.yml`** : il ajoute la transmission des variables `DATAQUERY_*` au conteneur backend. Il faut donc **redéployer** (`pulldocker.bat`) pour que le serveur ait ce fichier à jour. C'est fait à l'étape 4, après la configuration.

---

## Étape 1 — Vérifier le déploiement actuel

```bat
curl -s http://dsihub.ivry.local:3001/api/dataquery/health
```
**Attendu** : `{"error":"Module dataquery désactivé (DATAQUERY_ENABLED != true)"}`.
Cela prouve que le nouveau backend tourne et que le module est encore éteint, ce qui est normal à ce stade.

Dans le navigateur : `https://dsihub.ivry.local/admin/api-keys` → **Nouvelle clé**.
**Attendu** : la liste « Module (scope) » propose **Interrogation SQL lecture seule (tous modules, IA)**.
Fermer sans créer.

---

## Étape 2 — Contrôles de sécurité (sur le serveur, sans afficher de secret)

Sur le serveur dsihub, dans `<DOSSIER_SERVEUR>` :

```bash
docker exec appdsi-backend sh -c 'for v in JWT_SECRET POSTGRES_PASSWORD; do eval x=\$$v; case "$x" in ""|supersecretjwtkey|votre_cle_secrete_ici|ivrypassword) echo "$v : FAIBLE (vide ou valeur par défaut publique)";; *) echo "$v : OK (longueur ${#x})";; esac; done'
```

**Attendu** : deux lignes `OK`.

### Si `JWT_SECRET : FAIBLE`

N'importe qui peut fabriquer un jeton administrateur, car la valeur par défaut est dans le dépôt. **C'est à corriger, avec l'accord de Marc.** Conséquence de la correction : **tout le monde devra se reconnecter**, et les anciens jetons kiosque et liens SMS cesseront de fonctionner.

Génération sans affichage, dans le `.env` du serveur :
```bash
cd <DOSSIER_SERVEUR>
grep -q '^JWT_SECRET=' .env 2>/dev/null && echo "JWT_SECRET déjà présent dans .env : le remplacer à la main" \
  || echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')" >> .env
```
La prise en compte se fait au redéploiement de l'étape 4.

### Si `POSTGRES_PASSWORD : FAIBLE`

Le mot de passe du superutilisateur PostgreSQL est la valeur publique du dépôt. **Signaler à Marc, ne pas corriger ici.** Le changer implique :
- `ALTER ROLE postgres` ;
- la mise à jour du `.env` ;
- la mise à jour de tous les autres outils qui se connectent en `postgres`.

C'est une opération à planifier à part.

### Clé en dur `nhk_…`

Rappeler aussi à Marc la clé API en dur, sans la recopier : `backend/shared/pg_db.js`, insertion `reseau_links` dans `hub.infra_apis`. Elle est à régénérer côté API réseau, puis à mettre à jour dans `hub.infra_apis`.

---

## Étape 3 — Base de données (rôle lecture seule, tables, droits)

### 3a. Script global

Le script est idempotent et ne contient **aucun mot de passe**. Marc le lance dans son terminal ; `psql` demande le mot de passe `postgres`.

```bat
cd C:\dev\AppDSI
psql -h 10.103.130.106 -U postgres -d ivry_admin -f backend\modules\dataquery\sql\setup_global.sql
```

(Sans `psql` : ouvrir le fichier dans pgAdmin, sur la base `ivry_admin` en `postgres`, et l'exécuter. La ligne `\set ON_ERROR_STOP on` est propre à psql : la supprimer dans pgAdmin.)

**Attendu en fin de sortie** :

| Vérification | Résultat attendu |
|---|---|
| 4a | `rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolbypassrls` à `f` ; `rolcanlogin` à `t` ; `a_un_mot_de_passe` à `f` (normal à ce stade) |
| 4b | une grande majorité de `lisibles`, quelques `colonnes_masquees`, quelques `interdites` |
| 4c | liste des tables interdites : `hub.api_keys`, `hub.dataquery_*`, tables `*settings*` / `*config*` / `*otp*`… **La relire avec Marc** : si une table métier utile y figure, le signaler (le filtre porte sur le nom) |
| 4d | `0` |
| 4e | `f` |

### 3b. Mot de passe du rôle

**Marc seul**, saisie masquée : le mot de passe ne passe ni par Claude, ni par un fichier.

```bat
psql -h 10.103.130.106 -U postgres -d ivry_admin
```
```
ivry_admin=# \password dq_readonly
Enter new password for user "dq_readonly":   ← mot de passe fort, à conserver
Enter it again:
ivry_admin=# \q
```
Marc conserve ce mot de passe (gestionnaire de mots de passe) pour l'étape 4.

### 3c. Contrôle

Marc lance la commande ; `psql` demande le mot de passe de `dq_readonly`.

```bat
psql -h 10.103.130.106 -U dq_readonly -d ivry_admin -c "SELECT current_user, current_setting('default_transaction_read_only') AS lecture_seule" -c "DELETE FROM hub_copieurs.copieurs WHERE false"
```

**Attendu** :
- première commande : `dq_readonly | on` ;
- deuxième commande : `ERROR: cannot execute DELETE in a read-only transaction`.

Si la connexion est refusée (`pg_hba.conf`), il faut autoriser `dq_readonly` depuis l'IP du serveur dsihub. Ce sera de toute façon nécessaire pour le backend : ajouter la même règle que pour `postgres`.

---

## Étape 4 — Variables du backend et redéploiement

Sur le serveur dsihub, dans `<DOSSIER_SERVEUR>`, à côté de `docker-compose.yml`.

### 4a. Vérifier que `.env` est ignoré par git

```bash
cd <DOSSIER_SERVEUR>
git check-ignore .env && echo "OK : .env ignoré par git"
```

### 4b. Ajouter les variables non secrètes et le secret de session

Le secret de session est généré sans être affiché.

```bash
grep -q '^DATAQUERY_' .env 2>/dev/null && echo "Des variables DATAQUERY_ existent déjà : vérifier à la main" || {
  {
    echo ""
    echo "# Module dataquery / serveur MCP (cf. DEPLOIEMENT_MCP.md)"
    echo "DATAQUERY_ENABLED=true"
    echo "DATAQUERY_PG_USER=dq_readonly"
    echo "DATAQUERY_SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
    echo "DATAQUERY_SESSION_TTL_HOURS=8"
    echo "DATAQUERY_ALLOWED_USERS="
  } >> .env
  chmod 600 .env
  echo "Variables ajoutées"
}
```

`DATAQUERY_ALLOWED_USERS` reste vide si Marc est `superadmin` dans l'application. Sinon, y mettre son identifiant Windows (par exemple `marc.xxx`).

Pour vérifier : `SELECT username, role FROM hub.users WHERE role = 'superadmin';`

### 4c. Mot de passe du rôle

**Marc seul.** Ajouter la ligne au `.env` avec son éditeur, ou avec cette commande à saisie masquée :

```bash
read -rs -p "Mot de passe dq_readonly : " P && echo && echo "DATAQUERY_PG_PASSWORD=$P" >> .env && unset P
```

### 4d. Redéployer

Utiliser `pulldocker.bat` : il récupère le `docker-compose.yml` mis à jour et recrée le backend. Ou, sur le serveur :

```bash
git pull origin main && docker compose up -d --build backend
```

### 4e. Contrôles (aucune valeur affichée)

```bash
docker exec appdsi-backend sh -c 'echo "ENABLED=$DATAQUERY_ENABLED USER=$DATAQUERY_PG_USER PG_PASSWORD=$([ -n "$DATAQUERY_PG_PASSWORD" ] && echo présent || echo ABSENT) SESSION_SECRET_LEN=${#DATAQUERY_SESSION_SECRET}"'
docker logs appdsi-backend 2>&1 | grep -E "Droits lecture seule|\[PG DB\] dataquery"
```

**Attendu** :
- `ENABLED=true USER=dq_readonly PG_PASSWORD=présent SESSION_SECRET_LEN=64` (64 ou plus) ;
- dans les logs : `[PG DB] Droits lecture seule appliqués au rôle dq_readonly`, sans ligne `[PG DB] dataquery:` d'erreur.

Depuis le poste :
```bat
curl -s http://dsihub.ivry.local:3001/api/dataquery/health
```
**Attendu** : `{"error":"Clé API de périmètre « dataquery » requise (X-API-Key)"}`.
Le module est maintenant actif et exige la clé.

---

## Étape 5 — Clé API (Marc, dans l'interface)

Dans `https://dsihub.ivry.local/admin/api-keys` → **Nouvelle clé** :
- **Nom** : `MCP Claude – Marc`
- **Module** : **Interrogation SQL lecture seule (tous modules, IA)**
- **Permission** : **lecture**
- **Expiration** : obligatoire, par exemple dans 3 mois. Une clé sans expiration est refusée par le module.

Copier la clé `dsk_…` **directement dans le gestionnaire de mots de passe** : elle ne sera plus affichée. **Ne pas la donner à Claude.**

---

## Étape 6 — Test complet sur le LAN (Marc, dans son terminal)

Dans PowerShell (`-MaskInput` demande PowerShell 7 ; sinon, `set DQ_API_KEY=...` dans cmd) :
```powershell
cd C:\dev\AppDSI
$env:DQ_BASE_URL = "http://dsihub.ivry.local:3001"
$env:DQ_API_KEY  = Read-Host -MaskInput "Clé API dsk_"
node backend\scripts\dataquery-cli.js login <identifiant.windows>
node backend\scripts\dataquery-cli.js health
node backend\scripts\dataquery-cli.js catalog hub_copieurs
node backend\scripts\dataquery-cli.js query "SELECT count(*) AS nb FROM hub_tickets.tickets"
node backend\scripts\dataquery-cli.js query "SELECT password FROM hub.users"
node backend\scripts\dataquery-cli.js query "DELETE FROM hub_copieurs.copieurs"
node backend\scripts\dataquery-cli.js logout
node backend\scripts\dataquery-cli.js health
```
Marc colle la sortie à Claude (elle ne contient aucun secret).

**Attendu**, commande par commande :

| Commande | Résultat attendu |
|---|---|
| `login` | demande le mot de passe Windows (masqué), puis `Session ouverte pour <Nom> jusqu'au …` (8 h) |
| `health` | JSON avec `"readonly_role": {"ok": true, "role": "dq_readonly"}` et `"user": {"username": "<identifiant>"}` |
| `catalog` | `■ hub_copieurs — Photocopieurs (N tables)` et la liste des tables |
| `query count` | un tableau avec `nb` |
| `query password` | `HTTP 400: permission denied for table users`, avec un indice sur les colonnes masquées |
| `query DELETE` | `HTTP 400: Seules les requêtes SELECT / WITH / TABLE / VALUES / EXPLAIN sont acceptées` |
| `logout` | `Session révoquée` |
| `health` final | `HTTP 401: Identification personnelle requise…` |

### Diagnostics si ça ne passe pas

| Message | Cause probable |
|---|---|
| `login` → `Authentification AD non disponible` | AD non configuré ou désactivé dans `ad_settings` (le même que pour le chat) |
| `login` → `Compte non autorisé…` | Marc n'est ni `superadmin` ni dans `DATAQUERY_ALLOWED_USERS` (étape 4b) |
| `Une clé dataquery doit avoir une date d'expiration` | recréer la clé avec une expiration |
| `health` → `readonly_role.ok: false` | mot de passe `dq_readonly` incorrect dans `.env`, ou règle `pg_hba.conf` manquante pour l'IP du serveur dsihub |
| `DATAQUERY_SESSION_SECRET absent ou trop court` | étape 4b |

### Vérifier l'audit

Marc, en `postgres` :
```sql
SELECT created_at, username, action, left(sql_text, 60) AS sql, row_count, left(error, 50) AS erreur
FROM hub.dataquery_audit ORDER BY id DESC LIMIT 15;

SELECT username, display_name, client, created_at, expires_at, revoked_at, revoked_reason
FROM hub.dataquery_sessions ORDER BY created_at DESC LIMIT 5;
```
**Attendu** :
- une ligne par commande du test, au nom de Marc : `login`, `catalog`, `query`, `query_refusee` pour le DELETE, `logout` ;
- une session révoquée avec `revoked_reason = déconnexion`.

**À ce stade, le côté LAN est validé.**

---

## Étape 7 — DMZ (quand l'accès sera disponible)

Sur l'hôte Docker de la DMZ, dans le clone du dépôt :

```bash
git pull origin main
cd chat
cp -n env.example .env
```

Éditer `chat/.env` :
```
BACKEND_URL=http://<IP-LAN-de-dsihub>:3001     # joignable depuis la DMZ (flux TCP 3001 déjà ouvert pour le chat)
CHAT_DOMAIN=chat.ivry94.fr
MCP_TRACE_BODIES=full                          # ou "meta" : aucune donnée métier écrite en DMZ
```

Puis :
```bash
docker compose up -d --build
docker logs appdsi-chat-dmz 2>&1 | grep MCP
ls -la logs/
```

**Attendu** :
- dans les logs : `[MCP] https://chat.ivry94.fr/mcp → écoute 127.0.0.1:5176, backend http://…:3001, traces /var/log/appdsi-mcp (full)` ;
- le dossier `logs/` existe.

Reverse proxy DMZ en amont : vérifier que `/mcp`, `/mcp/oauth/…` et `/.well-known/…` sont transmis au conteneur, et que le délai de réponse est d'au moins 60 s.

### Vérifications depuis Internet (par exemple depuis un téléphone en 4G, ou un poste hors LAN)

```bash
curl -s https://chat.ivry94.fr/.well-known/oauth-protected-resource/mcp
curl -si -X POST https://chat.ivry94.fr/mcp -H "Content-Type: application/json" -d "{}" | head -5
curl -s https://chat.ivry94.fr/api/dataquery/health | head -c 120
```

**Attendu** :
1. du JSON contenant `"resource":"https://chat.ivry94.fr/mcp"` ;
2. `HTTP/… 401` avec `WWW-Authenticate: Bearer resource_metadata="https://chat.ivry94.fr/.well-known/oauth-protected-resource/mcp"` ;
3. **du HTML** (la page du chat), **pas du JSON** : l'API interne n'est pas exposée.

---

## Étape 8 — Connecter Claude

- **Claude Code** :
  ```bat
  claude mcp add --transport http appdsi https://chat.ivry94.fr/mcp
  ```
  Puis `/mcp` dans Claude Code pour lancer l'authentification.
- **claude.ai / Claude Desktop** : Paramètres → Connecteurs → *Ajouter un connecteur personnalisé* → `https://chat.ivry94.fr/mcp`.

Le navigateur ouvre **Autoriser l'accès aux données**. Marc y saisit son identifiant, son mot de passe Windows et la clé `dsk_…`, puis clique sur **Autoriser**.

**Test** : demander à Claude *« Liste les modules disponibles »*, puis *« Combien de tickets par statut ? »*.

**Attendu** :
- les outils `dsi_catalog` et `dsi_query` sont appelés ;
- de nouvelles lignes apparaissent dans `hub.dataquery_audit`, avec un `trace_id` ;
- les mêmes `trace_id` se retrouvent dans `chat/logs/mcp-trace-AAAA-MM-JJ.jsonl` sur l'hôte DMZ.

---

## Retour arrière

| Portée | Action |
|---|---|
| Couper tout, immédiatement (base) | `ALTER ROLE dq_readonly NOLOGIN;` |
| Couper le module | `DATAQUERY_ENABLED=false` dans `.env`, puis redéployer le backend |
| Couper une personne | `UPDATE hub.dataquery_sessions SET revoked_at = NOW(), revoked_reason = 'manuel' WHERE username = '…' AND revoked_at IS NULL;` |
| Couper une clé | la désactiver dans `/admin/api-keys` |
| Couper l'accès Internet seulement | commenter les blocs `/mcp` de `chat/nginx.conf.template`, puis `docker compose up -d --build` dans `chat/` |

Supprimer complètement le rôle :
```sql
REASSIGN OWNED BY dq_readonly TO postgres;
DROP OWNED BY dq_readonly;
DROP ROLE dq_readonly;
```
Les tables `hub.dataquery_audit` et `hub.dataquery_sessions` peuvent être conservées pour l'historique.

---

## Récapitulatif à produire en fin de session

| Étape | Statut | Remarque |
|---|---|---|
| 0 Poste prêt | | |
| 1 Déploiement vérifié | | |
| 2 Contrôles sécurité (JWT_SECRET / POSTGRES_PASSWORD / clé nhk) | | |
| 3 Base : script global, mot de passe, contrôle | | |
| 4 Variables backend et redéploiement | | |
| 5 Clé API créée (avec expiration) | | |
| 6 Test LAN et audit | | |
| 7 DMZ | | (en attente d'accès) |
| 8 Connecteur Claude | | |
