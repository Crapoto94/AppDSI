FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache make gcc g++ python3

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5175
ENTRYPOINT ["/entrypoint.sh"]
