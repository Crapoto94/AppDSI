# Chat AppDSI — déploiement DMZ (`chat.ivry94.fr`)

Ce dossier est une instance **autonome** du chat (copie de [`../chat-frontend`](../chat-frontend)),
destinée à tourner sur votre Docker en DMZ, séparée du reste de la stack AppDSI
(qui reste sur le LAN). Le dossier `chat-frontend/` d'origine n'est pas modifié
et continue de servir le chat interne (même serveur que le backend).

## Principe

Le conteneur ne contient **que** le front (React buildé) + un nginx qui sert ces
fichiers statiques et reverse-proxy en interne, côté serveur, les seuls appels
dont le chat a besoin vers le backend LAN :

- `/api/live/` — auth, sessions, messages du chat
- `/api/storage/` — pièces jointes
- `/socket.io/` — websocket temps réel

Résultat : le navigateur ne parle **qu'à `chat.ivry94.fr`** (même origine), donc
pas de souci CORS. Et surtout, **le reste de l'API interne n'est pas exposé** :
le backend (`server.js`) est un monolithe qui sert aussi les tickets, la finance,
la RH, l'admin, etc. sous `/api/*` — ce proxy ne laisse passer que les 3 chemins
ci-dessus, pas `/api/` en entier.

```
Internet ──HTTPS──▶ [Reverse proxy DMZ existant] ──HTTP:5175──▶ [conteneur chat-frontend-dmz]
                                                                        │
                                                          (proxy nginx interne, server-side)
                                                                        │
DMZ ──────────────────────────── firewall (TCP 3001 uniquement) ──────▶ LAN [backend:3001]
```

## Pré-requis réseau (à faire faire par l'équipe réseau/firewall)

1. **Règle firewall DMZ → LAN** : autoriser uniquement le flux depuis l'hôte
   Docker DMZ vers l'adresse LAN du backend, **port TCP 3001**. Rien d'autre
   (pas d'accès LAN généralisé depuis la DMZ).
2. Aucun flux LAN → DMZ n'est nécessaire pour ce sens de communication.
3. Le backend écoute déjà sur `0.0.0.0:3001` et publie ce port sur l'hôte
   (`docker-compose.yml` racine, service `backend`, `"3001:3001"`), donc il est
   déjà joignable par IP dès que le firewall laisse passer le flux.
4. Le DNS public `chat.ivry94.fr` doit pointer vers l'hôte Docker DMZ (ou vers
   votre reverse proxy DMZ existant), qui termine déjà le TLS pour vos autres
   services.

## Configuration

```bash
cp env.example .env
```

Puis éditer `.env` :

```
BACKEND_URL=http://<ip-lan-du-serveur-appdsi>:3001
CHAT_DOMAIN=chat.ivry94.fr
```

`BACKEND_URL` doit être une adresse **joignable depuis la DMZ** — pas
`http://backend:3001` (ce nom Docker n'existe que sur le réseau interne
`app-network` du serveur applicatif, cf. `docker-compose.yml` racine).

## Build & lancement

```bash
docker compose up -d --build
```

Le conteneur écoute en HTTP simple sur le port `5175` de l'hôte DMZ. Le
`entrypoint.sh` refuse de démarrer si `BACKEND_URL` n'est pas défini
(erreur explicite plutôt qu'un proxy cassé silencieusement).

## Brancher sur le reverse proxy DMZ existant

Comme vous avez déjà un reverse proxy en DMZ qui gère le TLS pour d'autres
services, il suffit de le pointer vers `<ip-hôte-dmz>:5175` en HTTP pour le
host `chat.ivry94.fr` (le TLS/HSTS/certificat restent gérés là-bas, comme pour
vos autres services).

Si ce reverse proxy route par réseau Docker plutôt que par port publié
(ex. Traefik avec le *provider docker*), voir le bloc commenté dans
`docker-compose.yml` (réseau externe + labels Traefik) à adapter au nom réel
de votre réseau.

## Vérification

```bash
# Depuis l'hôte Docker DMZ : le backend doit répondre (sinon = règle firewall manquante)
curl -i http://<ip-lan-du-serveur-appdsi>:3001/api/live/public-config

# Une fois le conteneur démarré et le reverse proxy branché :
curl -i https://chat.ivry94.fr/
```

Puis ouvrir `https://chat.ivry94.fr` dans un navigateur : connexion (AD / OTP /
invité), envoi de message, upload de pièce jointe.

## Différences avec `chat-frontend/` (usage interne)

| | `chat-frontend/` (LAN) | `chat/` (DMZ) |
|---|---|---|
| `BACKEND_URL` | `http://backend:3001` (nom Docker interne) | IP/hostname LAN réel, via `.env` |
| Proxy nginx | `/api/`, `/socket.io/`, `/uploads/` (tout `/api/`) | `/api/live/`, `/api/storage/`, `/socket.io/` uniquement |
| Réseau Docker | `app-network` (avec le backend) | isolé, hôte Docker DMZ |
| TLS | non concerné (interne) | terminé par le reverse proxy DMZ existant |
| `server_name` nginx | `localhost` | `chat.ivry94.fr` (`CHAT_DOMAIN`) |

Le code source (`src/`) est identique — même appli, même comportement
fonctionnel ; seule la configuration réseau/proxy change.
