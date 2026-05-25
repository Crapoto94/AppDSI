#!/bin/sh
# Substitute BACKEND_URL into nginx config template, then start nginx
: "${BACKEND_URL:=http://backend:3001}"

envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
