# Dependencias: capa cacheada mientras no cambien package.json / package-lock.json
FROM node:20-alpine AS deps

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Desarrollo (docker-compose.dev.yml): dependencias ya instaladas en la imagen,
# el código se monta por volumen. Uso: build.target = dev
FROM deps AS dev

COPY prisma ./prisma
RUN npx prisma generate

CMD ["npm", "run", "start:dev"]

# Etapa de build
FROM deps AS builder

COPY . .

# Generar Prisma y construir
RUN npx prisma generate && \
    npm run build

# Dependencias de producción: capa cacheable, no se repite al cambiar el código.
# Solo depende de package*.json y schema.prisma (no de las migraciones ni del código).
FROM node:20-alpine AS prod-deps

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npx prisma generate

# Etapa de producción
FROM node:20-alpine

# Install PostgreSQL client in production stage
RUN apk add --no-cache postgresql-client

WORKDIR /usr/src/app

# Copiar solo lo necesario
COPY --from=builder /usr/src/app/dist ./dist

COPY --from=builder /usr/src/app/package.json ./
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules

# Templates y certificados
COPY --from=builder /usr/src/app/src/email/templates ./dist/src/email/templates
COPY --from=builder /usr/src/app/src/certificates/assets ./dist/src/certificates/assets

# Copiar directorio de prisma para las migraciones Y el archivo de seeding
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/seed.ts ./seed.ts
COPY --from=builder /usr/src/app/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
