# Stage 1: Build the frontend application using Vite
FROM node:lts-alpine AS builder
WORKDIR /app

# Installer les outils de build nécessaires pour Alpine
RUN apk add --no-cache make gcc g++ python3

# Copier les fichiers de package et installer les dépendances
COPY package*.json ./
RUN npm ci

# Copier le reste du code source frontend
COPY . .

# Construire l'application React/Vite
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:alpine
# Copier les fichiers statiques buildés dans le répertoire de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html
# Copier un fichier de configuration Nginx personnalisé
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]