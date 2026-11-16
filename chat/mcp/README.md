# Serveur MCP AppDSI — DMZ (`https://chat.ivry94.fr/mcp`)

Serveur [MCP](https://modelcontextprotocol.io) qui permet à Claude (ou tout
client MCP) d'interroger **en lecture seule** les données de tous les modules
de l'application, depuis Internet. Il tourne dans le conteneur DMZ du chat
(`chat/`), à côté de nginx, et s'appuie sur l'API backend `/api/dataquery`
(LAN, port 3001 — le seul flux DMZ → LAN déjà ouvert).

## Outils exposés

| Outil | Rôle |
|---|---|
| `dsi_catalog` | modules (schémas) et tables accessibles |
| `dsi_describe_table` | colonnes, PK, FK d'une table |
| `dsi_query` | requête SQL en lecture seule (SELECT/WITH…) |
| `dsi_whoami` | personne connectée, limites |

## Double authentification

Flux OAuth 2.1 standard MCP (inscription dynamique, PKCE S256 obligatoire) :

1. Le client MCP découvre l'autorisation (`/.well-known/oauth-protected-resource/mcp`),
   s'inscrit, puis ouvre le navigateur sur `/mcp/oauth/authorize`.
2. La personne arrive sur la page **`/mcp/login`** (frontend chat,
   `src/McpAuthorizePage.tsx`) et saisit :
   - sa **clé API** dataquery (`dsk_…`, fournie par la DSI, avec expiration) ;
   - son **identifiant et mot de passe Windows** (AD).
3. Le backend vérifie les deux facteurs et l'autorisation (superadmin ou
   `DATAQUERY_ALLOWED_USERS`), puis ouvre une session personnelle de 8 h max.
4. Le client reçoit un jeton d'accès valable jusqu'à la fin de cette session,
   **sans jeton de rafraîchissement** : reconnexion obligatoire ensuite.

Le jeton, la clé et la session restent **en mémoire** du serveur MCP (jamais sur
disque) ; un redémarrage du conteneur impose une nouvelle autorisation. Chaque
appel au backend présente à nouveau clé + session, et une session révoquée en
base invalide immédiatement le jeton MCP.

Redirections OAuth acceptées : `https://…` et `http://localhost` (clients de bureau).

## Traçage

**Tous** les flux sont tracés, une ligne JSON par échange, dans
`/var/log/appdsi-mcp/mcp-trace-AAAA-MM-JJ.jsonl` (volume `./logs` sur l'hôte DMZ) :

- `"flow": "entrant"` — chaque requête reçue (client MCP, navigateur) et sa réponse :
  IP, personne, client OAuth, méthode/URL, en-têtes, corps, statut, durée, et pour
  le MCP la méthode JSON-RPC appelée (`rpc: "tools/call:dsi_query"`) ;
- `"flow": "sortant"` — chaque appel au backend et sa réponse.

Le même `trace_id` relie l'échange entrant, l'appel sortant et la ligne d'audit
backend (`hub.dataquery_audit.trace_id`), qui porte aussi le nom de la personne.

Secrets **jamais écrits en clair** : mots de passe, clés API, jetons, sessions,
codes OAuth et verifier PKCE sont remplacés par une empreinte
(`[masqué sha256:…]`), y compris dans les URL de redirection.

`MCP_TRACE_BODIES=meta` n'écrit que la taille et l'empreinte des corps (aucune
donnée métier en DMZ) ; par défaut `full` (corps complets, tronqués à 2 Mo).
Les traces contiennent des données : prévoir conservation, sauvegarde et purge.

## Configuration (conteneur `chat/`)

| Variable | Défaut | Rôle |
|---|---|---|
| `BACKEND_URL` | — (obligatoire) | backend LAN, déjà utilisé par nginx |
| `CHAT_DOMAIN` | `chat.ivry94.fr` | URL publique = `https://$CHAT_DOMAIN` |
| `MCP_PUBLIC_URL` | `https://$CHAT_DOMAIN` | à forcer si l'URL publique diffère |
| `MCP_TRACE_DIR` | `/var/log/appdsi-mcp` | dossier des traces |
| `MCP_TRACE_BODIES` | `full` | `full` ou `meta` |
| `MCP_TRACE_MAX_BYTES` | `2097152` | taille max d'un corps tracé |

## Connexion d'un client

- **Claude (claude.ai / Desktop)** : Paramètres → Connecteurs → Ajouter un
  connecteur personnalisé → `https://chat.ivry94.fr/mcp`.
- **Claude Code** : `claude mcp add --transport http appdsi https://chat.ivry94.fr/mcp`.

Le navigateur s'ouvre sur la page de connexion ; après validation, les outils
`dsi_*` sont disponibles.

## Développement local

```bash
cd chat/mcp && npm install
BACKEND_URL=http://127.0.0.1:3001 MCP_PUBLIC_URL=http://localhost:5175 MCP_TRACE_DIR=./logs node server.js
cd .. && npm run dev   # Vite proxifie /mcp, /mcp/oauth et /.well-known vers :5176
```
