# Etapa de build
FROM node:18-alpine AS builder

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
FROM node:18-alpine

# Install PostgreSQL client in production stage
RUN apk add --no-cache postgresql-client

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copiar solo lo necesario
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Copiar directorio de prisma para las migraciones
COPY --from=builder /usr/src/app/prisma ./prisma

# Verificación simplificada de variables (se ejecutará en runtime)
RUN echo "console.log('Iniciando con NODE_ENV:', process.env.NODE_ENV);" > runtime-check.js

EXPOSE 3000

CMD ["node", "dist/main.js"]
