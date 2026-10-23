# Build-Stufe: Frontend + API bündeln
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Laufzeit: nur API-Abhängigkeiten
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8090 APP_TZ=Europe/Vienna TZ=Europe/Vienna DATA_DIR=/app/data NODE_NO_WARNINGS=1
# /app/data: eigene Daten (Tarife, SQLite) – Volume in docker-compose, gehört node (neues Volume übernimmt das)
RUN apk add --no-cache tzdata && mkdir -p /app/data && chown node:node /app/data
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/api --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8090/api/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]
