# Etapa de build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ARG DIRECT_URL
ARG DATABASE_URL

RUN echo "DIRECT_URL=$DIRECT_URL" > .env && \
    echo "DATABASE_URL=$DATABASE_URL" >> .env

# Generar Prisma y construir
RUN npx prisma generate && \
    npm run build

# Etapa de producción
FROM node:22-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copiar solo lo necesario
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Verificación simplificada de variables (se ejecutará en runtime)
RUN echo "console.log('Iniciando con NODE_ENV:', process.env.NODE_ENV);" > runtime-check.js

EXPOSE 3000

CMD ["node", "dist/main.js"]
