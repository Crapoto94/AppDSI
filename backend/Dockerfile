# Stage 1: Build the backend application
FROM node:lts-alpine AS builder
WORKDIR /app

# Installer les outils de build nécessaires pour Alpine
RUN apk add --no-cache make gcc g++ python3

# Copier les fichiers de package et installer les dépendances
COPY package*.json ./
RUN npm ci --omit=dev

# Copier le reste du code source
COPY . .

# Créer les répertoires de stockage avec permissions appropriées
RUN mkdir -p /app/uploads /app/file_commandes /app/file_factures /app/file_certif /app/file_telecom /app/magapp_img /app/file_reunions /app/file_projets /app/file_contrats /app/logs /app/data && \
    chmod 755 /app/uploads /app/file_commandes /app/file_factures /app/file_certif /app/file_telecom /app/magapp_img /app/file_reunions /app/file_projets /app/file_contrats /app/logs /app/data

# Exposer le port utilisé par le serveur backend
EXPOSE 3001

# Active le provider OpenSSL legacy : la lib smb2 (accès au partage UNC en SMB
# direct, sans montage CIFS) utilise NTLM (MD4/RC4) désactivé par défaut sous
# OpenSSL 3 (Node >= 18). Indispensable pour l'écriture sur le partage Samba.
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Commande pour démarrer le serveur backend
CMD [ "node", "server.js" ]