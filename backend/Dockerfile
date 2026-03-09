# Stage 1: Build the backend application
FROM node:lts-alpine AS builder
WORKDIR /app

# Copier les fichiers de package et installer les dépendances
COPY package*.json ./
RUN npm ci --omit=dev

# Copier le reste du code source
COPY . .

# Exposer le port utilisé par le serveur backend
EXPOSE 3001

# Commande pour démarrer le serveur backend
CMD [ "node", "server.js" ]