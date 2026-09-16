# Image DMZ : sert la page PUBLIQUE de vérification du parapheur (QR des PDF
# signés) depuis le front du Hub DSI, avec un nginx restreint qui n'expose QUE
# l'API de vérification publique (/api/parapheur/verify/), jamais le reste du
# backend monolithique (tickets, finance, RH, admin...).
#
# Le contexte de build est la RACINE du dépôt (voir docker-compose.yml :
# context: ..) afin de compiler le dossier ../frontend.

# ── Stage 1 : build du front Hub ─────────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache make gcc g++ python3

COPY frontend/package*.json ./
# npm install (et non npm ci) : le lockfile n'est pas versionné dans ce dépôt,
# ce qui rendrait npm ci inutilisable sur un checkout Git propre.
RUN npm install --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ── Stage 2 : nginx restreint ────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY parapheur-dmz/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY parapheur-dmz/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5176
ENTRYPOINT ["/entrypoint.sh"]
