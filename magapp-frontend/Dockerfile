# Stage 1: Build the magapp-frontend application using Vite
FROM node:lts-alpine AS builder
WORKDIR /app

# Copier les fichiers de package et installer les dépendances
COPY magapp-frontend/package*.json ./magapp-frontend/
RUN cd magapp-frontend && npm ci --omit=dev

# Copier le reste du code source magapp-frontend
COPY magapp-frontend/ .

# Construire l'application React/Vite
RUN cd magapp-frontend && npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:alpine
# Copier les fichiers statiques buildés dans le répertoire de Nginx
COPY --from=builder /app/magapp-frontend/dist /usr/share/nginx/html
# Copier un fichier de configuration Nginx personnalisé si nécessaire (optionnel)
# COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5174
CMD ["nginx", "-g", "daemon off;"]