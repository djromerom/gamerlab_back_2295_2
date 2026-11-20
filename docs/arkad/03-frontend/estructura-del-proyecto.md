# Estructura del proyecto

> **Audiencia:** Frontend · **Actualizado:** 2026-11-19 (TA-15, ARK-51) · **Estado:** vigente · **Fuente:** `git ls-tree` de `dev-deploy` tras TA-15. Las reglas para ubicar y nombrar archivos están en [estructura objetivo y convenciones](estructura-objetivo-y-convenciones.md).

```
src/
├─ features/      un dominio funcional por carpeta, con pages/, components/, hooks/, api/, lib/, types/ y contexts/ según necesite
│   ├─ auth/  home/  academic/  teams/  games/  grading/  results/  editions/
│   ├─ external-presenters/  public/  notifications/  pwa/  staff-accounts/
│   └─ jurors/    assignment/  management/  attendance/  presence/  badges/  survey/  edition/  (y types/, común a varios)
├─ api/           llamadas al back compartidas (editions, evaluationProgress, registrations)
├─ components/    componentes compartidos (NavBar, LoadingScreen, TeamCode, background/…) y ui/ (shadcn)
├─ contexts/      AuthContext, SocketContext, TextSizeContext, GlobalStateContext
├─ hooks/         hooks compartidos (useFetch, useWorkingEdition, useCriteria, useLockViewportZoom, use-mobile)
├─ lib/           cliente HTTP único (api.ts), sesión y utilidades puras con su prueba
├─ types/         auth, team
├─ routes/        RoutesConfiguration.tsx (router único, lista `routes` con roles), ProtectedRoute, RegistrationGate, RestoreInteraction
├─ layouts/       LayoutApplication.tsx (menú lateral por rol), AppSidebar, NavContent, NavUser, Breadcrumbs
└─ assets/  styles/
```

**Para encontrar una pantalla:** la URL está en `routes/RoutesConfiguration.tsx`, que importa la página desde `features/<dominio>/pages/`. Qué contiene cada dominio: tabla de [dominios](estructura-objetivo-y-convenciones.md#dominios).

> Hasta TA-15 (19-nov) el código estaba repartido en carpetas `grupo N` (una por equipo de estudiantes de V3), `pages/` y `fetchs/`. El [diagnóstico](diagnostico-estructura.md) y el [mapa de movimientos](../06-referencia/mapa-de-movimientos-ark-51.md) registran de dónde salió cada archivo.

## Alias e imports
Alias `@/` → `src/`, sin extensión `.ts`/`.tsx`. UI base en `components/ui` (shadcn: Button, Dialog, Table, etc.).

## Pruebas
Archivos `*.test.ts(x)` junto al código (`lib/`, `hooks/`, `api/`, `features/*/api/`, páginas clave, `AuthContext.test.tsx`, `RoutesConfiguration.test.tsx`). Ver [guía de contribución](guia-de-contribucion.md).

## Tamaño de archivos
Regla del equipo: máximo 500 líneas por archivo. Medición vigente (22 archivos la superan al 13-nov) y hallazgos de estructura: [diagnóstico de la estructura](diagnostico-estructura.md) (TA-13, ARK-49).

## Pantallas más grandes (líneas en `origin/main`, 2026-11-05; cifras vigentes en el [diagnóstico](diagnostico-estructura.md))
| Archivo | Líneas | Nota |
|---|---|---|
| `features/jurors/assignment/pages/JurorAssignmentPage.tsx` | **~1960** | La pantalla de asignación de jurados. Es el archivo más grande y rompe la regla de 500 líneas; define **su propio** `apiFetch` y su propia llamada a `/auth/refresh` en lugar de usar `lib/api.ts`. Candidato a dividir en hooks y componentes antes de tocarlo (BG-33 vive aquí: pide 300 jurados y el servidor acepta 100 por página) |
| `features/grading/pages/BatchRatePage.tsx` | ~640 | Calificación por lote (`POST /evaluation/batch`) |
| `features/grading/pages/RealtimeTrackingPage.tsx` | ~275 | Seguimiento por hora (HU-21): `fetchEvaluationTracking(nivel, fecha)` con recarga periódica; usa Popover (no Tooltip) porque el Tooltip de Radix no abre con un toque en celular (BG-28) |
| `features/teams/pages/TeamRegisterPage.tsx` | ~40 | Solo orquesta el registro; los pasos están en `components/` y el estado en `MultiFormContext` |
