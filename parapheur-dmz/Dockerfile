# Image DMZ autonome : construit le front MINIMAL du parapheur (signature +
# vérification publique) à partir de ce dossier seul — aucun besoin du front
# complet du Hub DSI ni de la racine du dépôt (contexte de build = "."
# dans docker-compose.yml).
#
# Un nginx restreint n'expose que les points d'API publics nécessaires :
#   - /api/health             (état de santé du backend, page d'accueil)
#   - /api/auth/magapp-login  (connexion du signataire, en POST uniquement)
#   - /api/parapheur/public/  (signature via jeton personnel)
#   - /api/parapheur/verify/  (vérification publique via jeton QR)

# ── Stage 1 : build du front minimal ─────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache make gcc g++ python3

COPY package*.json ./
# npm install (et non npm ci) : le lockfile n'est pas versionné pour ce module.
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ── Stage 2 : nginx restreint ────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5177
ENTRYPOINT ["/entrypoint.sh"]
