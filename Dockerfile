# Etapa de build
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Generar Prisma y construir
RUN npx prisma generate && \
    npm run build

# Etapa de producción
FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copiar solo lo necesario
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Verificación simplificada de variables (se ejecutará en runtime)
RUN echo "console.log('Iniciando con NODE_ENV:', process.env.NODE_ENV);" > runtime-check.js

EXPOSE 3001

CMD ["node", "dist/main.js"]
