FROM node:20-slim

WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm install --production

# Copie du code source
COPY . .

# Exposition du port
EXPOSE 3001

# Commande de démarrage
CMD ["node", "server.js"]
