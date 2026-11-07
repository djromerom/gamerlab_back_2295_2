# Estructura del proyecto

> **Audiencia:** Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (estructura leída de `origin/main`; no se leyó cada componente) · **Fuente:** `git ls-tree origin/main src`

```
src/
├─ routes/        RoutesConfiguration.tsx (router único, lista `routes` con roles), RegistrationGate.tsx
├─ layouts/       LayoutAplication.tsx (menú lateral por rol)
├─ contexts/      AuthContext, SocketContext, MultiFormContext, TextSizeContext
├─ pages/         pantallas (ver abajo)
├─ components/    por «grupo» + admin + ui + staff + jurados-modals + videogamePage
├─ fetchs/        llamadas a la API por tema (editions, ranking, jurorEdition, jurorCheckIn…)
├─ hooks/         lógica reutilizable (useFetch, useWorkingEdition, useTeacherDashboard, juryManagement…)
├─ lib/           utilidades puras y su prueba (api.ts, session.ts, grades.ts, workingEdition.ts, schemas.ts…)
├─ types/         auth, criterion, jurados, Team, teamMembers, teamVideogames
├─ supabase/      client.ts (heredado de V3, sin uso real)
├─ assets/, data/, styles/
```

## Convención de «grupos» (herencia de V3)
Las carpetas `grupo 1`, `grupo 5`, `grupo 8`, `grupo 9`, `grupo 11`, `grupo 12` son el reparto de **equipos de semestres anteriores** (una carpeta por grupo de estudiantes), no un criterio funcional. Aproximadamente:

| Carpeta | Contenido |
|---|---|
| `grupo 1` | `StatisticsPage` (estadísticas del admin), contexto global de criterios |
| `grupo 5` | Pantallas **públicas y de estudiante**: Landing, Ranking, Información, Ediciones pasadas, Historical*, Créditos, HomeStudent, HomeTeacher, EditTeam, MisJurados, Maintenance |
| `grupo 8` | **Calificación**: PendingGrades, Rate, Graded, BatchRate (lote), School* (colegios N0) |
| `grupo 9` | **Administración y acceso**: Login, Forget/ResetPassword, Verification, Home, Subjets, Criterion, Nrcs, Professors, TeamsManagement, GradeWeights, Tiebreaker, ProfessorRankingTies, Unauthorized/AuthError; `ProtectedRoute`; `EventConfigurationPage` |
| `grupo 11` | Páginas del profesor/jurado/consultor (en `main` quedan pocas; ver `RatedPage`) |
| `grupo 12` | `JuryManagementPage` (gestión de jurados) |

`pages/admin/` (Ediciones, Escarapelas, Jurados de la edición, Cuentas staff), `pages/staff/` (Check-in, Asistencia), `pages/teams/` (registro de equipos y galería de videojuegos), `pages/gameplayer/` (reproductor de juegos web), `pages/settingsAdmin/`, y sueltas: `JuradosAssignment`, `RealtimeTrackingPanel`, `RegistrationClosedPage`, `NotFoundPage`.

> Los nombres con espacio (`grupo 9`) rompen algunas herramientas; es parte del plan de la Épica VII (TA-13/14/15: ordenar repos de forma incremental). No renombrar masivamente sin acuerdo: toca muchos imports (`@/…`).

## Alias e imports
Alias `@/` → `src/`. UI base en `components/ui` (shadcn: Button, Dialog, Table, etc.).

## Pruebas
Archivos `*.test.ts(x)` junto al código (`lib/`, `hooks/`, `fetchs/`, páginas clave, `AuthContext.test.tsx`, `RoutesConfiguration.test.tsx`). Ver [guía de contribución](guia-de-contribucion.md).

## Tamaño de archivos
Regla del equipo: máximo 500 líneas por archivo; hay archivos que la superan (F6, fuera de alcance en V4).

## Pantallas más grandes (líneas en `origin/main`, 2026-11-05)
| Archivo | Líneas | Nota |
|---|---|---|
| `pages/JuradosAssignment.tsx` | **~1960** | La pantalla de asignación de jurados. Es el archivo más grande y rompe la regla de 500 líneas; define **su propio** `apiFetch` y su propia llamada a `/auth/refresh` en lugar de usar `lib/api.ts`. Candidato a dividir en hooks y componentes antes de tocarlo (BG-33 vive aquí: pide 300 jurados y el servidor acepta 100 por página) |
| `pages/grupo 8/BatchRatePage.tsx` | ~640 | Calificación por lote (`POST /evaluation/batch`) |
| `pages/RealtimeTrackingPanel.tsx` | ~275 | Seguimiento por hora (HU-21): `fetchEvaluationTracking(nivel, fecha)` con recarga periódica; usa Popover (no Tooltip) porque el Tooltip de Radix no abre con un toque en celular (BG-28) |
| `pages/teams/TeamRegisterPage.tsx` | ~40 | Solo orquesta el registro; los pasos están en `components/` y el estado en `MultiFormContext` |
