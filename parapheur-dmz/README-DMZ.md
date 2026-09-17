# Parapheur électronique — front minimal DMZ (`chat.ivry94.fr` ou sous-domaine dédié)

Ce dossier est une instance **autonome** du front du parapheur, destinée à
tourner sur votre Docker en DMZ, séparée de la stack AppDSI (qui reste sur le
LAN). Contrairement à la version précédente, il **ne dépend pas du front complet
du Hub DSI** : il embarque un front minimal (même approche que le module
[`../chat`](../chat)).

## Principe

Le conteneur ne contient **que** le front minimal (React buildé) + un nginx qui
sert ces fichiers statiques et reverse-proxy, côté serveur, les seuls appels
dont la signature, la vérification et l'état du service ont besoin vers le
backend LAN :

- `/api/health` — état de santé du backend (page d'accueil publique) ;
- `/api/auth/magapp-login` — connexion du signataire (POST uniquement) ;
- `/api/parapheur/public/` — signature via le jeton personnel du signataire
  (consultation des documents, signature, refus, code SMS) ;
- `/api/parapheur/verify/` — vérification publique via le jeton du QR code
  (lecture seule : informations, PDF signés, dossier de preuves).

Résultat : le navigateur ne parle **qu'à ce domaine** (même origine, pas de
CORS). Et surtout, **le reste de l'API interne n'est pas exposé** : le backend
(`server.js`) est un monolithe qui sert aussi les tickets, la finance, la RH,
l'admin, etc. sous `/api/*` — ce proxy ne laisse passer que les 4 chemins
ci-dessus, pas `/api/` en entier.

```
Internet ──HTTPS──▶ [Reverse proxy DMZ existant] ──HTTP:5177──▶ [conteneur appdsi-parapheur-dmz]
                                                                         │
                                                           (proxy nginx interne, server-side)
                                                                         │
DMZ ──────────────────────────── firewall (TCP 3001 uniquement) ──────▶ LAN [backend:3001]
```

## Arborescence (autonome)

```
parapheur-dmz/
├── Dockerfile              # build local (contexte = ce dossier)
├── docker-compose.yml
├── nginx.conf.template     # proxy restreint (3 routes)
├── entrypoint.sh
├── env.example
├── index.html
├── package.json / vite.config.ts / tsconfig*.json
├── scripts/copy-pdfjs-assets.mjs
└── src/
    ├── App.tsx / main.tsx / index.css
    ├── utils/pdfjs.ts
    ├── components/parapheur/…   # visionneuse PDF, pad de signature
    └── pages/Parapheur/
        ├── SignatureSignataire.tsx
        └── ParapheurVerification.tsx
```

> Le build n'a **pas** besoin de `../frontend` : il compile uniquement les
> sources présentes ici. Le front complet du Hub DSI reste sur le LAN.

## Pré-requis réseau (équipe réseau/firewall)

1. **Règle firewall DMZ → LAN** : autoriser uniquement le flux de l'hôte Docker
   DMZ vers l'adresse LAN du backend, **port TCP 3001**.
2. Le backend publie déjà ce port sur l'hôte (`docker-compose.yml` racine,
   service `backend`, `"3001:3001"`).
3. Le DNS public doit pointer vers l'hôte Docker DMZ (ou votre reverse proxy
   DMZ existant, qui termine le TLS).

## Configuration

```bash
cp env.example .env
```

Puis éditer `.env` :

```
BACKEND_URL=http://<ip-lan-du-serveur-appdsi>:3001
PARAPHEUR_DOMAIN=chat.ivry94.fr
```

## Build & lancement

```bash
docker compose up -d --build
```

Le conteneur écoute en HTTP simple sur le port **5177** de l'hôte DMZ.
`entrypoint.sh` refuse de démarrer si `BACKEND_URL` n'est pas défini.

> Si le port hôte 5177 est déjà pris, ne changez que la partie **hôte** du
> mapping : `"5178:5177"` (nginx écoute sur 5177 dans le conteneur). Mapper
> `"5178:5178"` ne fonctionne pas.

## Brancher sur le reverse proxy DMZ

Pointer le reverse proxy DMZ vers `<ip-hote-dmz>:5177` en HTTP pour le host
`PARAPHEUR_DOMAIN` (TLS/HSTS/certificat restent gérés par le reverse proxy).

> **Important** : le host public utilisé pour les liens doit correspondre au
> réglage **« URL publique »** de `/admin/parapheur-certificats`
> (`parapheur.public_base_url`), car c'est lui qui construit les liens de
> signature et le QR code de vérification.

## Adresse des liens générés

- Accueil (état du service) : `https://<PARAPHEUR_DOMAIN>/`
- Signature : `https://<PARAPHEUR_DOMAIN>/signature/<jeton signataire>`
- Vérification : `https://<PARAPHEUR_DOMAIN>/parapheur/verification/<jeton QR>`
- PDF signé : `/api/parapheur/verify/<jeton>/doc/<id>?signed=1`
- Dossier de preuves (ZIP) : `/api/parapheur/verify/<jeton>/preuves`

## Sécurité

- **Seuls** les 4 préfixes d'API ci-dessus sont proxifiés (jamais `/api/` en
  entier). `/api/auth/magapp-login` est limité à la méthode `POST`.
- `/api/health` ne renvoie aucune donnée sensible (statut, horodatage,
  disponibilité, état de la base) : il est destiné à la page d'accueil et à la
  supervision.
- Les jetons de signature et de vérification sont aléatoires (32 octets) et non
  devinables ; la vérification est en lecture seule.
- ⚠️ Exposer la signature en DMZ expose aussi l'endpoint de connexion AD/Azure
  (`magapp-login`) à Internet : prévoir le durcissement habituel côté réseau
  (limitation de débit, WAF) et ne pas exposer d'autres routes d'authentification.

## Durcissement & WAF (nginx)

Le conteneur n'expose que les routes nécessaires et applique une **couche de
durcissement + un WAF nginx** (règles natives nginx, sans ModSecurity) :

- **WAF** : blocage des motifs d'attaque dans l'URI (traversée de chemin,
  injections SQL/script, scanners type `*.env`/`wp-*`/`phpmyadmin`), des
  user-agents d'outils offensifs (sqlmap, nikto, nmap, acunetix…) et des méthodes
  HTTP non autorisées (TRACE/TRACK/CONNECT).
- **Limitation de débit / connexions par IP** : plafond global, et limite
  renforcée sur l'endpoint de connexion (anti brute force). Dépassement → `429`.
- **Anti-slowloris** : timeouts de lecture/écriture et d'en-têtes réduits,
  `reset_timedout_connection`.
- **En-têtes de sécurité** : `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `Strict-Transport-Security` et une
  **Content-Security-Policy** adaptée au front (styles inline, images data:/blob:,
  worker/wasm pdf.js, iframe blob de la visionneuse).
- `server_tokens off` (pas de version nginx divulguée), refus des fichiers
  cachés/sauvegardes, API de vérification en **lecture seule** (GET/HEAD).
- La connexion `magapp-login` est limitée à la méthode `POST` et à une route
  exacte.

> ℹ️ C'est un **WAF nginx** (règles) et non ModSecurity/CRS. Pour une protection
> applicative plus poussée, ajouter ModSecurity + CRS (ou le WAF) au niveau du
> **reverse proxy DMZ en amont**, qui voit tout le trafic TLS.

## Vérification

```bash
# Depuis l'hôte Docker DMZ : le backend doit répondre (sinon = règle firewall manquante)
curl -i http://<ip-lan-du-serveur-appdsi>:3001/api/health

# Une fois le conteneur démarré et le reverse proxy branché :
curl -i https://<PARAPHEUR_DOMAIN>/
```
