# Guía de contribución (backend)

> **Audiencia:** Backend · **Actualizado:** 2026-11-05 · **Estado:** completo (resumen en español de `CONTRIBUTING.md`, `BRANCHING.md` del repo) · **Fuente:** `back/CONTRIBUTING.md`

Ramas, PR y merges: [04-devops/flujo-fullstack-y-ramas](../04-devops/flujo-fullstack-y-ramas.md).

## Estructura de un módulo
Dónde va cada archivo, cómo se nombra y el checklist que va en cada PR: [estructura objetivo y convenciones](estructura-objetivo-y-convenciones.md) (TA-14). Resumen:
```
src/<modulo>/                (o src/<dominio>/<modulo>/ si el dominio tiene 3+ módulos, como src/jurors/)
  <modulo>.module.ts      imports, controllers, providers, exports
  <modulo>.controller.ts  delgado: rutas, extraer datos, llamar al servicio
  <modulo>.service.ts     reglas de negocio y acceso a BD (PrismaService)
  <tema>.logic.ts         lógica pura, con su spec
  dto/                    create-*.dto.ts, update-*.dto.ts (class-validator)
```
`npx nest g resource <nombre>` genera la base (REST API + CRUD).

## Flujo
1. Rama desde `dev`: `<tipo>/ARK-NN-descripcion`.
2. `docker compose -f docker-compose.dev.yml up` (hot reload; Swagger `http://localhost:3000/api`).
3. Cambios de modelo en `prisma/schema.prisma` (probablemente no los necesites); actualiza `seed-data.json` si hace falta.
4. **Lógica en el servicio, no en el controlador.**
5. DTO con `class-validator` (el `ValidationPipe` global valida y devuelve 400).
6. Protege el endpoint: `@Public()` o `@UseGuards(RolePermissionGuard)` + `@RequiredService('Nombre')` ([auth-y-sesiones](auth-y-sesiones.md)). El nombre debe coincidir con un `servicio` activo en la BD.
7. Prueba en Swagger y escribe `*.spec.ts` junto al código (`npx jest <carpeta>`); si depende de la BD real, e2e en `test/`.
8. Commit con prefijo, push, **PR a `dev`** (nunca merge directo a `dev` ni `main`; `main` solo recibe promociones de `dev`).

## Reglas de datos
- **Borrado lógico:** no usar `prisma.*.delete()`/`deleteMany()`; poner `isActive = false`. **Al leer, filtra por `isActive: true`** salvo que busques inactivos a propósito.
- **Edición:** nunca «la de id más alto». Usa `findActiveEdition`/`requireActiveEdition`/`ACTIVE_EDITION_WHERE`, `resolveListEdition` para listados y `assert*Writable` para escrituras ([arquitectura](arquitectura-modulos.md), `docs/editions.md`).
- Nada de `onDelete: Cascade` para usuarios/jurados/profesores.
- Archivos de menos de 500 líneas; código nuevo modular. Copia el checklist de [estructura](estructura-objetivo-y-convenciones.md#cómo-se-mantiene-el-orden) en la descripción del PR.
- Avisar a DevOps de migraciones; variables nuevas al `.env.example` y al `.env` del servidor **antes** de mergear ([variables-y-accesos §5.A](../04-devops/variables-y-accesos.md)).

## Comandos
Nest: `nest g module|controller|service|resource <nombre>`. Prisma: `npx prisma generate`, `migrate dev --name <n>`, `migrate deploy`, `db seed`, `studio`. Docker: `docker compose -f docker-compose.dev.yml up|down|down -v`, `docker compose logs -f app-dev`.

## Commits
`feat:`, `fix:`, `docs:`, `refactor:`, `chore:` + descripción clara. Canal de dudas: `back` en Discord.

## Ver también
README del repo (setup, producción, testing, módulos) y `BRANCHING.md`/`CONTRIBUTING.md` originales en `repo back`.
