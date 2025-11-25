# Etapa de build
FROM node:20-alpine AS builder

# Install PostgreSQL client for database operations
RUN apk add --no-cache postgresql-client

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Generar Prisma y construir
RUN npx prisma generate && \
    npm run build

# Etapa de producción
FROM node:20-alpine

# Install PostgreSQL client in production stage
RUN apk add --no-cache postgresql-client

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copiar solo lo necesario
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Copiar directorio de prisma para las migraciones Y el archivo de seeding
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/seed.ts ./seed.ts
COPY --from=builder /usr/src/app/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
