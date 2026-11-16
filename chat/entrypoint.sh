#!/bin/sh
# Substitue BACKEND_URL et CHAT_DOMAIN dans le template nginx, démarre le serveur
# MCP (Node, utilisateur non privilégié, écoute 127.0.0.1:5176) puis nginx.
# Si l'un des deux processus s'arrête, le conteneur s'arrête (Docker le relance).
: "${BACKEND_URL:?BACKEND_URL doit être défini (adresse LAN du backend joignable depuis la DMZ, ex: http://10.103.130.x:3001)}"
: "${CHAT_DOMAIN:=chat.ivry94.fr}"
: "${MCP_TRACE_DIR:=/var/log/appdsi-mcp}"
export BACKEND_URL CHAT_DOMAIN MCP_TRACE_DIR

envsubst '${BACKEND_URL} ${CHAT_DOMAIN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

mkdir -p "$MCP_TRACE_DIR"
chown -R nginx:nginx "$MCP_TRACE_DIR"
chmod 750 "$MCP_TRACE_DIR"

cd /opt/mcp && su-exec nginx node server.js &
MCP_PID=$!
nginx -g 'daemon off;' &
NGINX_PID=$!

trap 'kill -TERM $MCP_PID $NGINX_PID 2>/dev/null' TERM INT
while kill -0 $MCP_PID 2>/dev/null && kill -0 $NGINX_PID 2>/dev/null; do
    sleep 2
done
echo "[entrypoint] arrêt : le serveur MCP ou nginx s'est arrêté" >&2
kill -TERM $MCP_PID $NGINX_PID 2>/dev/null
wait
exit 1
