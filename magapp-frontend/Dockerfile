# Stage 1: Build the magapp-frontend application
FROM node:lts-alpine AS builder
WORKDIR /app

# Installer les outils de build nécessaires pour Alpine
RUN apk add --no-cache make gcc g++ python3

# Copier les fichiers de package et installer les dépendances
COPY package*.json ./
RUN npm ci

# Copier le reste du code source
COPY . .

# Construire l'application
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:alpine
# Copier les fichiers statiques buildés dans le répertoire de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html
# Copier le fichier de configuration Nginx personnalisé (qui écoute sur 5174)
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5174
CMD ["nginx", "-g", "daemon off;"]