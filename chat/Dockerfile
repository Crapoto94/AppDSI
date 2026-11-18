# ── Front du chat (React) ─────────────────────────────────────────────────────
FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache make gcc g++ python3

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Dépendances du serveur MCP (production uniquement) ────────────────────────
FROM node:lts-alpine AS mcpdeps
WORKDIR /mcp
COPY mcp/package*.json ./
RUN npm ci --omit=dev

# ── Image finale : nginx (front + reverse proxy) + serveur MCP Node ───────────
FROM nginx:alpine
# Node pour le serveur MCP ; su-exec pour le lancer sans les droits root.
RUN apk add --no-cache nodejs su-exec
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=mcpdeps /mcp/node_modules /opt/mcp/node_modules
COPY mcp/package.json mcp/server.js mcp/trace.js /opt/mcp/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5175
ENTRYPOINT ["/entrypoint.sh"]
