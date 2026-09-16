# Vérification publique du parapheur — déploiement DMZ (`chat.ivry94.fr`)

Ce dossier est un déploiement **autonome** du front du Hub DSI, limité à la
**page publique de vérification du parapheur** (cible du QR code apposé sur les
PDF signés). Il est destiné à tourner sur votre Docker en DMZ, séparé de la
stack AppDSI (qui reste sur le LAN).

## Principe

```
Internet ──HTTPS──▶ [Reverse proxy DMZ existant] ──HTTP:5176──▶ [conteneur appdsi-parapheur-dmz]
                                                                        │
                                                          (proxy nginx interne, server-side)
                                                                        │
DMZ ──────────────────────────── firewall (TCP 3001 uniquement) ──────▶ LAN [backend:3001]
```

Le conteneur sert le front du Hub (React buildé) et un nginx qui ne relaie
**qu'** un seul point d'entrée backend :

- `/api/parapheur/verify/` — API **publique** de vérification (jeton aléatoire,
  lecture seule) : informations du parapheur, téléchargement des PDF signés et
  du dossier de preuves.

⚠️ Le backend (`server.js`) est un monolithe qui expose aussi les tickets, la
finance, la RH, l'admin, etc. sous `/api/*`. Ce proxy ne laisse **jamais** passer
`/api/` en entier — uniquement `/api/parapheur/verify/`.

## Pré-requis réseau (équipe réseau/firewall)

1. **Règle firewall DMZ → LAN** : autoriser uniquement le flux de l'hôte Docker
   DMZ vers l'adresse LAN du backend, **port TCP 3001**.
2. Le backend publie déjà ce port sur l'hôte (`docker-compose.yml` racine,
   service `backend`, `"3001:3001"`).
3. Le DNS public (`chat.ivry94.fr` ou un sous-domaine dédié, ex.
   `parapheur.ivry94.fr`) doit pointer vers l'hôte Docker DMZ (ou votre reverse
   proxy DMZ existant, qui termine le TLS).

## Configuration

```bash
cp env.example .env
```

Puis éditer `.env` :

```
BACKEND_URL=http://<ip-lan-du-serveur-appdsi>:3001
VERIFY_DOMAIN=chat.ivry94.fr
```

## Build & lancement

```bash
docker compose up -d --build
```

Le conteneur écoute en HTTP simple sur le port `5176` de l'hôte DMZ.
`entrypoint.sh` refuse de démarrer si `BACKEND_URL` n'est pas défini.

## Brancher sur le reverse proxy DMZ

Pointer le reverse proxy DMZ vers `<ip-hote-dmz>:5176` en HTTP pour le host
`VERIFY_DOMAIN` (TLS/HSTS/certificat restent gérés par le reverse proxy).

> **Important** : le host public utilisé pour les liens doit être le même que le
> réglage **« URL publique »** de `/admin/parapheur-certificats`
> (`parapheur.public_base_url`). Si `chat.ivry94.fr` sert déjà le chat interne,
> utilisez de préférence un sous-domaine dédié (ex. `parapheur.ivry94.fr`) :
> les deux applications ont chacune leurs propres assets à la racine.

## Adresse des liens générés

- Page de vérification : `https://<VERIFY_DOMAIN>/parapheur/verification/<jeton>`
- Téléchargement PDF signé : `/api/parapheur/verify/<jeton>/doc/<id>?signed=1`
- Dossier de preuves (ZIP) : `/api/parapheur/verify/<jeton>/preuves`

Le jeton de vérification (32 octets aléatoires) est créé à la première
génération d'un PDF signé et stocké sur le parapheur.

## Vérification

```bash
# Depuis l'hôte Docker DMZ : le backend doit répondre (sinon = règle firewall manquante)
curl -i http://<ip-lan-du-serveur-appdsi>:3001/api/frizbi-test-public

# Une fois le conteneur démarré et le reverse proxy branché :
curl -i https://<VERIFY_DOMAIN>/parapheur/verification/<jeton>
```
