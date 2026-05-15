# Etapa de build
FROM node:20-alpine AS builder

# Install PostgreSQL client for database operations
RUN apk add --no-cache postgresql-client

WORKDIR /usr/src/app

# Skip chromium download during npm install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

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


# Install chromium for pdf generation (puppeteer)
RUN apk add -q --update --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Set chromium path for puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /usr/src/app

# Copiar solo lo necesario
COPY --from=builder /usr/src/app/dist ./dist

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

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
