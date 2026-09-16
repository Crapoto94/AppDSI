#!/bin/sh
# Substitue BACKEND_URL et VERIFY_DOMAIN dans le template nginx, puis démarre nginx.
: "${BACKEND_URL:?BACKEND_URL doit être défini (adresse LAN du backend joignable depuis la DMZ, ex: http://10.103.130.x:3001)}"
: "${VERIFY_DOMAIN:=chat.ivry94.fr}"

envsubst '${BACKEND_URL} ${VERIFY_DOMAIN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
