# Pruebas del backend

> **Audiencia:** Backend, DevOps · **Actualizado:** 2026-11-14 · **Estado:** parcial (conteos de la rama leída; no se ejecutó la suite para esta documentación) · **Fuente:** `package.json`, `test/`, `src/**/*.spec.ts`, backlog TA-10/TA-11

## Dónde están
- **Unitarias:** `src/**/*.spec.ts` junto al código (≈126 archivos en la rama leída).
- **e2e (integración):** `test/*.e2e-spec.ts`, 15 archivos (verificado el 2026-11-14): `app`, `certificates`, `confirmed-teams`, `evaluation-batch-idempotency`, `evaluation-drafts`, `external-presenters`, `find-user-by-email`, `juror-reassigned-team`, `juror-survey`, `nrc-por-materia`, `push-notifications`, `ranking`, `refresh-token-revocation`, `student-edit-permissions`, `team-access`. Config en `test/jest-e2e.json`, ayudantes en `test/helpers`. Corren con **`INTEGRATION_DATABASE_URL`**; sin ella se omiten.
- **De BD real** (SQL crudo, bloqueos, `mode: 'insensitive'`, restricciones): `src/**/*.db.spec.ts`, 29 archivos. Corren con **`RUN_DB_TESTS=1`** contra `DATABASE_URL`.
- **Una base desechable, un archivo a la vez.** Las dos suites usan la misma base (en CI, un Postgres 15 efímero), así que corren en serie: `maxWorkers: 1` en `test/jest-e2e.json` y `--runInBand` en `npm run test:db`. En paralelo un archivo puede pisar los datos de otro: así se reportó en ARK-208 (fallos intermitentes en CI, cada archivo solo pasaba). Con el modo en serie, las 15 e2e (137 pruebas) tardan ≈ 1,5 min y los `*.db.spec.ts` (147 pruebas) ≈ 1,5 min. Cómo levantar la base y correrlas: README del repo, «Integration tests».
- Pruebas de regresión útiles: `active-edition.regression.spec.ts` (nadie filtra la edición a mano), `public-routes-personal-data.spec.ts` (rutas públicas sin datos personales), `route-access.spec.ts` (si está en tu rama), `team-visibility.spec.ts`.

## Comandos
`npm test` · `npx jest <carpeta>` · `npm run test:ci` (`--runInBand --coverage`, el de CI) · `npm run test:e2e` (en serie) · `npm run test:db` (en serie, con `RUN_DB_TESTS=1`) · `npm run test:watch`.

## En CI (workflow `Test-back`, en PR a `dev`/`main`)
build · lint (`continue-on-error`) · `npm run test:ci` · job de integración con Postgres 15 efímero (migrate, seed, `npm run test:e2e` y `npm run test:db`). **«Pull requests fail if any test fails»** (CONTRIBUTING).

## Estado conocido
- TA-10: según el backlog, 6 de 119 pruebas fallaban y había `continue-on-error`; corregirlas y quitarlo era trabajo de Samuel en el Sprint 2 (marcado Hecho en Jira el 3-nov). **Verificado el 2026-11-05** corriendo `npm run test:ci` (`jest --runInBand --coverage`) sobre `origin/main` (`bcfe237`): **136 suites pasan y 15 se omiten** (151 en total); **1313 pruebas pasan, 77 se omiten, 0 fallan**. Las omitidas son las de base de datos (`*.db.spec.ts`), que solo corren con `RUN_DB_TESTS` y una BD de prueba.
- TA-11 (integración en el pipeline) y TA-06 (pruebas funcionales del flujo de evaluación, tras HU-18): pendientes en el plan.
- El frontend tiene sus propias pruebas con Vitest ([03-frontend](../03-frontend/README.md)).

## Reglas
Toda regla de negocio nueva lleva su `*.spec.ts` junto al código; si depende de comportamiento real de la BD, añade un e2e/DB test. Rutas nuevas con permiso: prueba de que los roles sin permiso reciben error.
