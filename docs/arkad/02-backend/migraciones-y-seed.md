# Migraciones y seed

> **Audiencia:** Backend, DevOps · **Actualizado:** 2026-11-05 · **Estado:** completo · **Fuente:** `back/prisma/`, `seed.ts`, `SEEDING_README-back.md`, `entrypoint.sh`

## Migraciones
- Directorio `prisma/migrations` (formato `YYYYMMDDHHMMSS_nombre`). En la rama local leída hay **59** (la última, `20261103010000_add_edition_students_permission`); **producción está en 61** (última `20261105010000_add_juror_attendance_view_permission`). Siempre compara con `origin/dev` y `origin/main`.
- **Nunca editar una migración ya mergeada.** Cambios nuevos = migración nueva.
- Crear: modificar `schema.prisma` → `npx prisma migrate dev --name <nombre>` (en el entorno Docker de desarrollo se detecta solo).
- **Avisar a DevOps** de toda migración: se ensaya sobre copia de producción antes de promover ([base-de-datos-operacion](../04-devops/base-de-datos-operacion.md), [runbook de promoción](../04-devops/runbook-promocion-a-produccion.md)).
- **Permisos y roles se crean por migración** (no hay UI): servicio + permiso + asignación al rol. Tras desplegar, reinicia/recrea el contenedor por la caché de permisos ([cache-y-throttling](cache-y-throttling.md)).
- Cosas que Prisma no expresa viven en SQL de la migración: índices únicos parciales (escarapelas activas, asistencia activa, NRC `(codigo,id_edicion) WHERE activo`). Revísalos si regeneras el esquema.
- Migraciones destructivas o con `UPDATE` masivo (p. ej. BG-17/ARK-128, código de verificación): deben ser idempotentes, ensayadas y con plan de vuelta atrás que incluya restaurar el dump.
- Scripts SQL manuales: `prisma/scripts/` (p. ej. `bg16-deactivate-ineligible-badges.sql`, que desactiva —no borra— escarapelas de quien no es de la edición; lo ejecuta DevOps en producción con respaldo previo). Vistas: `prisma/views`.

## Entrypoint en contenedor
`prisma generate` → `prisma migrate deploy` → seed (**se salta si `NODE_ENV=production`**) → app. Corre **sin `set -e`**: si una migración falla, la app arranca igual; revisar el log.

## Seed
- `prisma/seed-data.json` (formato `[{ "table": "...", "data": [...] }]`, orden = orden de inserción; respetar llaves foráneas) y `seed.ts` (`createMany` con `skipDuplicates`; hay que añadir el caso de cada tabla nueva en el script).
- Comandos: `npm run db:seed`, `db:setup` (migrar + seed), `db:reset` (reset + seed), `prisma:migrate:reset`.
- Contiene catálogos, permisos, edición, ponderado, criterios, usuarios y equipos de ejemplo, e históricos. **Las contraseñas por defecto del seed son de desarrollo**: no deben existir en producción (> A CONFIRMAR si test las ejecuta).
- Para agregar datos: editar el JSON, ajustar `seed.ts`, `npm run prisma:seed`.

## Datos de prueba en test
Scripts SQL de datos de prueba solo para test, validados contra `origin/dev`: ver [base-de-datos-operacion](../04-devops/base-de-datos-operacion.md).

## Archivos que ensucian el repo (TA-09)
`init-db.sql`, `cookies.txt`, `output.sql`, `big-seed.py`: pendientes de limpiar. No versionar dumps ni datos personales.
