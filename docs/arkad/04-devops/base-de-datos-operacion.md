# Base de datos: operación

> **Audiencia:** DevOps, Backend · **Actualizado:** 2026-11-05 · **Estado:** parcial (falta completar históricos y restauración con detalle) · **Fuente:** `03-base-de-datos/*`, `contexto-devops-arkad.md` §5, promociones. Modelo de datos: ver [02-backend/modelo-de-datos](../02-backend/modelo-de-datos.md).

## Resumen
- PostgreSQL 15 (`postgres:15-alpine`). Contenedores `arkad_db` (test) y `arkad_db_prod` (prod), **sin puerto publicado**.
- Migraciones con Prisma en `prisma/migrations` (a 2026-11-05: **61**, última `20261105010000_add_juror_attendance_view_permission`; **prod también en 61**). **Nunca editar una migración ya mergeada.**
- El entrypoint corre `prisma migrate deploy` en cada arranque (sin `set -e`) y el seed solo si `NODE_ENV` no es production.

## Seed (desarrollo y test)
`prisma/seed-data.json` (formato `[{ "table": "...", "data": [...] }]`) + `seed.ts` (usa `createMany` con `skipDuplicates`). Respetar el orden por dependencias entre tablas.

| Comando | Qué hace |
|---|---|
| `npm run db:seed` | Solo seed |
| `npm run db:setup` | Migraciones + seed |
| `npm run db:reset` | Resetea la BD y hace seed |
| `npm run prisma:migrate:deploy` | Aplica migraciones (producción) |

## Ensayar migraciones sobre una copia de producción
Antes de promover migraciones, ensayarlas. Regla de oro: **en producción solo se lee** (`SELECT`, `pg_dump`); todo lo que escribe ocurre en un Postgres descartable. La copia contiene datos personales reales: no se comparte y se borra al terminar.

1. **Chequeos de solo lectura** en prod: versión de Postgres, últimas migraciones y ninguna con `finished_at` nulo, y chequeos específicos de cada migración (p. ej. ediciones repetidas que detendrían una migración de único por año/semestre). Anotar conteos de referencia (equipos, integrantes, evaluaciones, usuarios, ediciones, históricos).
2. **Dump:** `umask 077` y `pg_dump -Fc --no-owner --no-acl` desde el contenedor de prod; registrar tamaño y `sha256sum`.
3. **Copia segura:** `scp` a la máquina local, verificar el hash y **`shred -u`** el dump en el servidor (es compartido).
4. **Postgres local descartable** (`postgres:15-alpine`, puerto atado a `127.0.0.1`, otro puerto que el de desarrollo): restaurar en una base plantilla (`pg_restore --no-owner --no-acl --exit-on-error`) y crear copias con `createdb -T` para repetir intentos.
5. **Código a ensayar:** una worktree temporal de `origin/dev`; comprobar `echo $DATABASE_URL` antes de cada comando de Prisma: **nunca** debe apuntar a test ni a prod.
6. `prisma migrate status` → `time prisma migrate deploy` (es la ventana de caída aproximada) → `migrate status` → chequeo de drift contra `schema.prisma`.
7. Comparar conteos y datos con los de referencia; borrar todo al terminar.

Alternativa usada en las promociones del 4 y 5-nov: base desechable `ensayo_prod` dentro del Postgres de **test** (ver [runbook de promoción](runbook-promocion-a-produccion.md)).

Detalle y las migraciones del Sprint 1 con sus riesgos: en la entrega original de DevOps (fuera del repo).

## Datos de prueba para test
Scripts SQL de datos de prueba **solo para test**; siempre se validan contra `origin/dev` (no contra la rama abierta), se envían en versión ASCII con `scp` y se verifica el hash. Detalle en la entrega original de DevOps (fuera del repo).

## Históricos (v1 + v2)
Se unificaron en `equipos_historico`, `integrante_historico` y `videojuegos_historico`:
- `historical_migration.sql` crea las tablas y copia desde las viejas; `generate_team_codes.sql` genera `codigo_equipo` (`N<semestre>-<materia>-<id>`) para v1; `update-ids.sql` renumera v2 desde 96 / 362 / 96.
- Entregables en `arkad_docs/arkad_docs/db_dumps/`: `v1_clean_historical_data.sql`, `v2_clean_historical_data.sql` y el consolidado `v1_v2_clean_data.sql`.
- **Verificación esperada en cualquier BD: 197 equipos / 723 integrantes / 197 videojuegos.**
- El consolidado corre en una transacción y lleva `\restrict` (requiere `psql` ≥ 15.14 o borrar esa línea).
- **El estado de carga en producción NO está confirmado.** Ejecutar la verificación antes de cargar y probar primero en test con un `pg_dump` previo.
- Los dumps contienen datos personales reales: no publicarlos ni sacarlos del equipo.

## Restauración del respaldo de código V3
`RESTAURACION.md` explica los bundles git del respaldo de código v3 (requiere Git ≥ 2.45 y formato `reftable`, por ramas que solo difieren en mayúsculas). **No incluye datos de BD.** Detalle en la entrega original de DevOps (fuera del repo).

## Pendientes
- [ ] Backup automático antes de migraciones en producción.
- [ ] Confirmar y/o cargar históricos en producción.
- [ ] Organizar `db_dumps` y limpiar los archivos de datos personales (TA-09).
