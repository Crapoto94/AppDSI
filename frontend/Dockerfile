FROM node:20-slim as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# On s'assure de builder l'application Vite (crée le dossier dist/)
RUN npm run build

FROM nginx:alpine

# Copie des fichiers statiques générés vers le répertoire web de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copie de notre configuration Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
