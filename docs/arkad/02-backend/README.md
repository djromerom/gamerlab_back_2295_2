# Backend de ARKAD

> **Audiencia:** Backend V5 · **Actualizado:** 2026-11-05 · **Estado:** completo (leído del código y contrastado con `origin/main`; ver nota de rama) · **Fuente:** `repo back` (`package.json`, `schema.prisma`, `main.ts`, `app.module.ts`, controladores, `docs/editions.md`)

> **Nota de rama:** esta documentación se leyó de la copia local `repo back` en la rama `fix/ARK-128-team-code-per-edition` (commit `b075066`), que estaba **por detrás** de producción. El 2026-11-05 se contrastó con `origin/main` (`bcfe237`, 61 migraciones, 40 carpetas en `src/`, mismo `schema.prisma`): el inventario de rutas, la suite de pruebas y los módulos nuevos (asignación automática, asistencia de jurados, cierre de edición) salen de esa versión. Si un detalle fino no aparece en un archivo, contrástalo con `origin/main` antes de dar por hecho que no existe.

## Stack
| Pieza | Detalle |
|---|---|
| Framework | NestJS ^11, Node 20, TypeScript ^5.7; build con SWC (`nest start -b swc`) |
| BD | PostgreSQL 15 con Prisma ^6.18 (`previewFeatures = ["views"]`, hay una vista `vw_team_final_scores`) |
| Auth | JWT (Passport) en cookies HttpOnly, refresh tokens rotados; login con contraseña o Microsoft Entra ID |
| Tiempo real | `@nestjs/websockets` + `socket.io` |
| Documentación API | Swagger en `/api`, **solo si `NODE_ENV !== production`** |
| Pruebas | Jest (unit en `src/**/*.spec.ts`, e2e en `test/`, specs de BD con `RUN_DB_TESTS=1`) |
| Integraciones | Azure Communication Services (correo), Azure Blob/Azurite (archivos), Gotenberg (PDF), reCAPTCHA, `exceljs`, `qrcode`, `jszip` |

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Arranque en watch (SWC) |
| `npm run build` / `build:all` | Compilar (y compilar `seed.ts`) |
| `npm run test` / `test:ci` / `test:e2e` / `test:db` | Pruebas (`test:ci` = `--runInBand --coverage`; `test:e2e` y `test:db` corren en serie contra una base desechable, ver [pruebas](pruebas.md)) |
| `npm run lint` | ESLint con `--fix` |
| `npm run prisma:migrate` / `prisma:migrate:deploy` | Migrar en desarrollo / en producción |
| `npm run db:seed` / `db:setup` / `db:reset` | Seed / migrar+seed / reset+seed |
| `npm run routes:inventory` | Genera el inventario de rutas y su acceso (`scripts/generate-route-inventory.ts`) |

Levantar todo en local: [04-devops/flujo-fullstack-y-ramas §5](../04-devops/flujo-fullstack-y-ramas.md) (`docker compose -f docker-compose.dev.yml up -d`; Swagger en `:3000/api`).

## Arranque (`src/main.ts`)
`IoAdapter` de sockets · `TRUST_PROXY` (número de saltos o valor) para que `req.ip` sea la IP real (de eso dependen los límites de rutas públicas) · `x-powered-by` desactivado · `cookie-parser` · `ValidationPipe` global con `whitelist`, `transform` y `enableImplicitConversion` · CORS para `FRONTEND_URL` y `http://localhost:5173` con credenciales y `Content-Disposition` expuesto · escucha `PORT` (3000).

## Índice
- [Arquitectura y módulos](arquitectura-modulos.md)
- [Diagnóstico de la estructura (TA-13)](diagnostico-estructura.md)
- [Estructura objetivo y convenciones (TA-14)](estructura-objetivo-y-convenciones.md)
- [Autenticación y sesiones](auth-y-sesiones.md)
- [Modelo de datos](modelo-de-datos.md)
- [Endpoints](endpoints.md)
- [Evaluación y ranking](evaluacion-y-ranking.md)
- [Integraciones](integraciones.md)
- [Caché y límites de peticiones](cache-y-throttling.md)
- [Migraciones y seed](migraciones-y-seed.md)
- [Pruebas](pruebas.md)
- [Guía de contribución](guia-de-contribucion.md)
- Documento del propio repo: `docs/editions.md` (qué es global y qué es por edición; **léelo antes de tocar cualquier consulta**) y `docs/frontend/HU-25-jurados-por-edicion.md`.

## Variables de entorno
Lista y significado: `.env.example` del repo y [04-devops/variables-y-accesos](../04-devops/variables-y-accesos.md). `npm run check:env` valida el ejemplo.
