# Consumo de la API

> **Audiencia:** Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (`lib/api.ts` y hooks leídos en `origin/main`; las funciones de API listadas pero no leídas a fondo) · **Fuente:** `src/lib/api.ts`, `src/api/*`, `src/features/*/api/*`, `src/hooks/useFetch.ts`

## `apiFetch` (`src/lib/api.ts`)
Envoltorio sobre `fetch` que debe usarse en lugar de `fetch` directo:
- `credentials: "include"` por defecto (cookies HttpOnly).
- Reintentos **solo** si es seguro: `GET/HEAD/OPTIONS`, o escritura con cabecera `Idempotency-Key`. Hasta **2 reintentos** con espera creciente (1 s, 2 s) en 5xx o error de red. Un error de red en reintento devuelve «No pudimos completar la acción, inténtalo de nuevo».
- 401 fuera de `/auth/` → un refresh y repetir; refresh rechazado (401/403) → `SessionRejectedError` + evento `auth:session-expired`.
- Acepta un `AuthHandlers` (`accessToken`, `refreshAccessToken`, `logout`).
- **Antes** (backlog, 21-oct, HU-06): solo 39 de 135 llamadas usaban `apiFetch`. **Hoy** (`origin/main`, 2026-11-05) hay unas 153 llamadas a `apiFetch` y solo **2 usos de `fetch` directo fuera de `lib/api.ts`**: `api/registrations.ts` (`GET /settings/registrations`, pública, la usa `RegistrationGate`) y `features/games/hooks/useGameLoader.ts` (descarga del `.zip` del juego desde una URL firmada). Es razonable que sigan así; no los migres sin revisar. Ojo: `features/jurors/assignment/pages/JurorAssignmentPage.tsx` define **su propio** `apiFetch` local (con su propio refresh), así que el conteo anterior no basta para decir que toda la app usa el de `lib/api.ts`.

## Funciones de API (una por tema)
Compartidas, en `api/`: `editions`, `evaluationProgress`, `registrations`. El resto vive en `features/<dominio>/api/`:
- `teams`: `editionStudents`, `teamVerification`, `teamGradable`.
- `grading`: `evaluationTracking`. `results`: `finalGrade`, `ranking`. `academic`: `nrcs`. `games`: `gameFrame`.
- `jurors`: `juryManagement` (management), `automaticAssignment` y `jurorsExport` (assignment), `jurorEdition`, `jurorAttendance`, `jurorCheckIn`, `jurorBadges`, `jurorSurvey`, `jurorPresence`, `absenceAlert`, `absentJurorResponses`.
- `external-presenters`: `externalPresenters`. `notifications`: `pushNotifications`.

Muchos tienen su `*.test.ts` al lado.

## Patrones
- Base de URL: `import.meta.env.VITE_ENDPOINT_BACKEND` + ruta (ver [02-backend/endpoints](../02-backend/endpoints.md)).
- Listados con `?editionId=`; sin él el back usa la edición activa. El front nombra la **edición de trabajo** con `useWorkingEdition()` / `findWorkingEdition` (la `ACTIVE`, nunca «la de id más alto»).
- Errores del back relevantes: **400** `EDITION_READ_ONLY`, **404** `NO_ACTIVE_EDITION`, **404** `WEIGHTS_NOT_CONFIGURED`, **403** con motivo al calificar sin permiso/asignación. Mostrar el mensaje real del back (BG-15).
- Descargas (Excel/PDF): leer `Content-Disposition` para el nombre.
- Notas: mostrar siempre con **2 decimales** (`toFixed(2)`, BG-30; ver `features/results/lib/grades.ts`).
- Calificación en lote: `POST /evaluation/batch` (1 a 50 filas, todo o nada) con `Idempotency-Key`.
- Datos de equipos propios: `lib/ownTeam.ts`; no asumir un solo equipo por usuario (BG-17).

## Hooks de datos
`useFetch` (genérico), `useTeacherDashboard`, `useAssignmentWarnings` (+ `features/jurors/assignment/lib/assignmentWarnings.ts`), `useJurorAttendance`, `useTeamVerification`, `useWorkingEdition`, `useGameLoader`, `useCriteria`.

## Contrato front↔back
Antes de implementar, acordar por escrito endpoints, payloads, errores y permisos en el ticket ([flujo-fullstack-y-ramas §4](../04-devops/flujo-fullstack-y-ramas.md)). El front puede avanzar con mocks.
