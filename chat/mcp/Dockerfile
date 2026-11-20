# Serveur MCP AppDSI — image AUTONOME (sans nginx ni front React).
# Usage : exposition INTERNE (service `mcp` du docker-compose racine) derrière le reverse proxy interne / le chat interne.
# La page de connexion (/mcp/login) est servie par le serveur lui-même (login-page.js).
FROM node:lts-alpine
WORKDIR /opt/mcp
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js trace.js login-page.js ./
# Traces JSONL (un fichier par jour) : volume à monter sur /var/log/appdsi-mcp, appartenant à l'utilisateur « node ».
RUN mkdir -p /var/log/appdsi-mcp && chown -R node:node /var/log/appdsi-mcp
ENV MCP_HOST=0.0.0.0 MCP_PORT=5176 MCP_TRACE_DIR=/var/log/appdsi-mcp NODE_ENV=production
USER node
EXPOSE 5176
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5176/.well-known/oauth-protected-resource/mcp >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
