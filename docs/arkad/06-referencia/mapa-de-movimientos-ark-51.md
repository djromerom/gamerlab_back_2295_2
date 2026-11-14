# Mapa de movimientos para TA-15

> **Audiencia:** quien ejecute TA-15 (ARK-51), revisores · **Actualizado:** 2026-11-13 · **Estado:** decidido por el equipo el 13-nov (se presenta al profesor el 17-nov) y ensayado en local el 13-nov sin regresiones; las cifras se recalculan el 19-nov antes de mover · **Fuente:** `origin/dev` y `origin/dev-deploy` del 13-nov ([diagnóstico back](../02-backend/diagnostico-estructura.md), [diagnóstico front](../03-frontend/diagnostico-estructura.md)). Estructura destino: [back](../02-backend/estructura-objetivo-y-convenciones.md) y [front](../03-frontend/estructura-objetivo-y-convenciones.md). Ticket: ARK-50 (TA-14).

TA-15 **solo mueve, renombra (archivos y símbolos) y borra código sin uso, y corrige imports**. No cambia comportamiento, URLs ni contratos de la API. Lo que cambia código (partir archivos grandes, quitar duplicación, sacar `apiFetch` de las vistas) queda fuera.

## Cuándo y con qué reglas

- **Jueves 19-nov en la mañana**, después de que el miércoles 18 entren todos los PR de features. Mover archivos con PR abiertos genera conflictos para todos.
- **Lo hace una sola persona (Santiago)**, en el orden de la tabla. Cada PR se mergea antes de empezar el siguiente.
- **Corte a mediodía:** lo que no esté en verde a esa hora se para. Queda anotado en este documento como «pendiente» y no se fuerza antes del congelamiento del 23.
- **Antes de empezar:** `gh pr list --state open --json number,files` en los dos repos. Si un PR abierto toca un archivo de la lista, ese bloque espera o se coordina con su autor.

## Orden de los PR

| # | Repo | PR | Archivos | Riesgo |
|---|---|---|---|---|
| B1 | back | Borrar código muerto confirmado y mudar `update-member.dto.ts` a `teams/dto/` | 11 (1 se muda, 10 se borran) | Bajo |
| B2 | back | Renombrar `gg.*` y `pg.*`, nombres de clase únicos, `create-upload.dto.ts` a `dto/` | 8, más sus importadores (detalle abajo) | Bajo |
| B3 | back | Anidar los 10 módulos de jurados en `src/jurors/` | 130 + 247 líneas de import | Medio |
| FA | front | Features pequeñas | ver abajo | Bajo |
| FB | front | Jurados | ver abajo | Medio |
| FC | front | Calificación y resultados | ver abajo | Medio |
| FD | front | Ediciones y equipos | ver abajo | Medio |
| FE | front | Compartido: layouts, routes, components, contexts, api | ver abajo | Medio (lo usa todo) |

Back y front son independientes: si el back se atrasa, el front puede seguir, y al revés.

## Procedimiento de cada PR

1. Rama `refactor/ARK-51-<bloque>` desde `origin/dev` (back) o `origin/dev-deploy` (front), **ya actualizada** con el squash del bloque anterior. Los commits del ensayo del 13-nov no se rebasean: se vuelve a correr el script.
2. Correr el script de un solo uso `ark51.mjs` (se adjunta al PR): primero con `--dry`, después sin él. El script:
   - hace `git mv` de cada archivo de la tabla, con su prueba al lado, y `git rm` de las filas «(se borra)»;
   - reescribe los imports que dejarían de resolver: lee cada `import`, lo resuelve contra el árbol **viejo** y lo escribe contra el **nuevo**. No se edita a mano.
     - **Front:** siempre con `@/` y sin extensión `.ts`/`.tsx`.
     - **Back:** dentro del mismo módulo, relativos; hacia **otro** módulo, `src/...`, también entre módulos hermanos de `src/jurors/`.
   - renombra los símbolos de la tabla «Símbolos que se renombran» con el servicio de lenguaje de TypeScript (declaración y todos sus usos; no toca cadenas ni comentarios);
   - reemplaza la ruta completa en documentos, código y `.sql`, y al final lista las rutas viejas que todavía aparecen.
3. Primer commit: la salida exacta del script. Segundo commit: los ajustes manuales (documentos y comentarios que el script listó). Así quien revisa puede volver a correr el script sobre la base y comparar.
4. Verificar, sin errores nuevos respecto de la integración:
   - **Back:** `npm run build`, `npm run test:ci`, `npm run test:e2e` y los `*.db.spec.ts` con base (como el job `integration` del CI), `npx eslint src` y `docker build .`.
   - **Front:** `npm run build`, `npm run test:ci`, `npx eslint .` y `docker build .`.
   - **Ambos:** `npx tsc --noEmit` (incluye las specs) y `git grep` de cada ruta vieja da 0 resultados (fuera de los documentos fechados y de las convenciones).
5. PR a `dev` / `dev-deploy` con el comando exacto, la línea de resumen del dry-run, la lista de ajustes manuales y la frase «no cambia URLs ni contratos»; squash al mergear.

## Backend

### B1. Código muerto (H4)

| Acción | Ruta |
|---|---|
| Mover a `src/teams/dto/update-member.dto.ts` y corregir sus 4 importadores (`teams/dto/update-team.dto.ts`, `teams/interfaces/team-repository.interface.ts`, `teams/repositories/team.repository.ts`, `teams/registro-validaciones.spec.ts`) | `src/members/dto/update-member.dto.ts` |
| Borrar (el módulo no está montado: sus rutas no existen hoy) | `src/members/members.module.ts`, `members.controller.ts`, `members.service.ts`, `members.controller.spec.ts`, `members.service.spec.ts`, `dto/create-member.dto.ts` |
| Borrar (nadie los importa) | `src/pending-games/dto/create-videogame.dto.ts`, `src/pending-games/dto/update-videogame.dto.ts`, `src/students/dto/update-member.dto.ts` |
| Borrar (sin referencias) | `src/templates/email/account-verification.html` |

**Por qué se borra `members`:** ARK-175 lo dejó sin tocar para no ampliar ese PR, no porque se fuera a usar. `MembersModule` no lo importa ningún módulo, así que sus rutas nunca existieron en la API; el historial queda en git. Decisión del equipo del 13-nov.

Los dudosos del diagnóstico (`prisma/seed-test-juror.ts`, `scripts/migrate-blob-references.ts`) **no se tocan**.

**Documentos a actualizar en el mismo PR:** `docs/arkad/02-backend/endpoints.md:14` (la fila `/teams/:teamId/members` sale), `arquitectura-modulos.md` (`members` y `templates` salen de la tabla), `integraciones.md:29` (`src/templates/email/` deja de existir) y `04-devops/riesgos-y-deuda.md:42` (el punto de código sin montar se cierra).

### B2. Nombres (H5)

| Ruta actual | Ruta nueva | Notas |
|---|---|---|
| `src/graded-games/gg.module.ts`, `gg.controller.ts`, `gg.service.ts` | `graded-games.module.ts`, `graded-games.controller.ts`, `graded-games.service.ts` | 9 archivos los importan (incluidos `app.module.ts` y 5 specs) |
| `src/pending-games/pg.module.ts`, `pg.controller.ts`, `pg.service.ts`, `pg.service.spec.ts` | `pending-games.module.ts`, `pending-games.controller.ts`, `pending-games.service.ts`, `pending-games.service.spec.ts` | Hay 14 líneas de import. Además, las clases `VideogamesService` y `VideogamesController` de este módulo pasan a `PendingGamesService` y `PendingGamesController`: hoy se llaman igual que las del módulo `videogames`, y varias specs las importan con alias (`as PendingGamesService`). La ruta HTTP del controlador no cambia |
| `src/upload/create-upload.dto.ts` | `src/upload/dto/create-upload.dto.ts` | 1 importador (`videogames/dto/create-videogame.dto.ts`) |

El renombre de clases solo toca el import que viene de `pending-games`: `upload/blob-reference.read-paths.spec.ts` importa también el `VideogamesService` de `videogames/`, que no cambia.

**Inventario de rutas:** las 4 filas `/pending-games*` de `docs/arkad/02-backend/inventario-de-rutas.md` pasan a mano de `## VideogamesController` a una sección nueva `## PendingGamesController`. No se regenera el documento dentro de este PR: generado desde `dev` traería 43 rutas ajenas a TA-15; eso va en un PR de documentación aparte.

**Swagger** (solo fuera de producción): `/pending-games` pasa de la etiqueta «Videogames» a «PendingGames» y cambian sus `operationId`. Los permisos (`@RequiredService('PendingGamesService')`) no cambian. Se menciona en la descripción del PR.

### B3. `src/jurors/`

Cada carpeta se mueve **con su nombre**: `src/<módulo>/` pasa a `src/jurors/<módulo>/`. Se reescriben los imports que cruzan la frontera del grupo y, para cumplir la convención, los imports relativos entre módulos hermanos (`../juror-edition/...`) pasan a `src/jurors/...`. Los imports dentro de un mismo módulo no cambian. Las rutas escritas como texto en `editions/active-edition.regression.spec.ts` (lista `ALLOWED`) se actualizan en el mismo commit.

| Módulo | Archivos (specs) | Imports relativos que salen del grupo | Imports que entran desde fuera |
|---|---|---|---|
| `juror` | 45 (21) | 60 | 4 |
| `juror-edition` | 20 (8) | 22 | 13 |
| `absence-alert` | 12 (4) | 19 | 2 |
| `juror-presence` | 10 (3) | 10 | 1 |
| `juror-attendance` | 9 (3) | 11 | 1 |
| `juror-badges` | 8 (2) | 13 | 2 |
| `juror-survey` | 8 (2) | 9 | 1 |
| `absent-juror-responses` | 6 (2) | 10 | 1 |
| `juror-checkin` | 5 (1) | 10 | 1 |
| `substitute-notices` | 7 (2) | 12 | 1 |
| **Total** | **130 (48)** | **176** | **27** (10 en `app.module.ts`) |

**No se afecta:** el Dockerfile (solo fija `src/email/templates` y `src/certificates/assets`), `nest-cli.json` (los assets van por patrón), el `moduleNameMapper` de Jest (`^src/(.*)$`, válido para cualquier profundidad) y ningún `jest.mock` (ninguno apunta a estas rutas).

**Documentos a actualizar en el mismo PR:** `README.md:204` (`npx jest src/jurors`), `docs/editions.md` (ruta de `juror-edition/edition-resolver.ts`) y `docs/arkad/02-backend/arquitectura-modulos.md` (tabla de dominios y rutas de archivo). El inventario de rutas no cambia en B3: agrupa por clase de controlador, no por archivo.

## Frontend

Hay 311 archivos que se mueven: 237 de código y 74 pruebas, que acompañan a su archivo; además se borra 1 (`FairStartedAnnouncement`, sin importadores). El script reescribe 649 líneas de import (las que dejarían de resolver tras mover) y renombra 40 símbolos. Las rutas URL no cambian: solo cambian los imports en `routes/RoutesConfiguration.tsx`.

**Cómo se asignó cada archivo:** las carpetas `grupo N`, `pages/` y `components/` se asignaron a mano según la tabla de dominios. Los archivos de `lib/`, `hooks/`, `fetchs/` y `types/` sin regla explícita se asignaron por sus consumidores: si todos sus importadores van al mismo dominio, se van con ellos (marcados como «asignado por consumidores»); si no, se quedan compartidos. Lo que usan 3 o más dominios va a compartido (`api/`, `components/`, `hooks/`). Dos excepciones, según la convención: lo **genérico** (no habla de ningún dominio, como `pluralize` o `CircularProgress`) se queda en compartido aunque hoy lo use un solo dominio, y lo que comparten **dos subdominios de `jurors`** va al nivel `features/jurors/<tipo>/`. Con este mapa quedan 17 imports entre dos dominios, que la convención permite.

**Nombres:** el archivo y su símbolo principal se llaman igual. Cuando el mapa renombra un archivo o el símbolo no coincide con el nombre del archivo, el símbolo se renombra en la tabla «Símbolos que se renombran» de su bloque (el script usa el *rename* de TypeScript, que cambia la declaración y todos sus usos). Quedan como están, por convención: los contextos (`XContext.tsx` exporta `XProvider` y `useX`), los archivos que agrupan varias piezas del mismo tema (`EvaluationDrafts.tsx`, `TeamSkeleton.tsx`, `TeamVerification.tsx`, `validationTeamsAdmin.tsx`) y lo generado por shadcn (`components/ui/`, `hooks/use-mobile.ts`).

**Documentos a actualizar en el mismo PR que mueve sus rutas:** `README.md:56`, `docs/arkad/03-frontend/estructura-del-proyecto.md` (el árbol y la sección de grupos se reescriben en el PR de FE), `consumo-de-api.md`, `deuda-tecnica.md`, `estado-auth-y-sockets.md`, `rutas-y-pantallas.md`, `guia-de-contribucion.md` y `01-negocio/ediciones.md`, más `docs/frontend/HU-25-jurados-por-edicion.md` en el back. `docs/arkad` está duplicado en los dos repos: el cambio se replica en el otro repo en el PR de documentación que cierra TA-15. Los diagnósticos, el changelog y los documentos de convenciones **no** se actualizan: son registros fechados o describen el «antes» a propósito.

| PR | Contenido | Archivos (de ellos, pruebas) | Líneas de import que apuntan a ellos |
|---|---|---|---|
| FA | Features pequeñas: `staff-accounts`, `home`, `notifications`, `pwa`, `auth`, `games`, `public`, `academic`, `external-presenters` | 69 (15) + 1 borrado | 93 |
| FB | Jurados: `jurors/badges`, `jurors/edition`, `jurors/attendance`, `jurors/survey`, `jurors/presence`, `jurors/management`, `jurors/assignment` | 71 (24) | 152 |
| FC | Calificación y resultados: `grading`, `results` | 65 (18) | 89 |
| FD | Ediciones y equipos: `editions`, `teams` | 72 (9) | 111 |
| FE | Compartido (layouts, routes, components, contexts, api): — | 34 (8) | 204 |
| | **Total** | **311 (74)** + 1 borrado | **649** |

### FA. Features pequeñas

<details><summary><b>src/features/staff-accounts</b>: 1 archivos + 0 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `pages/admin/StaffAccountsPage.tsx` | `features/staff-accounts/pages/StaffAccountsPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/home</b>: 1 archivos + 1 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `pages/grupo 9/HomePage.tsx` | `features/home/pages/HomePage.tsx` | 3 |  |

</details>

<details><summary><b>src/features/notifications</b>: 3 archivos + 1 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/pushNotifications.ts` | `features/notifications/api/pushNotifications.ts` | 2 |  |
| `lib/pushNotifications.ts` | `features/notifications/lib/pushNotifications.ts` | 2 | asignado por consumidores |
| `pages/PushNotificationsPage.tsx` | `features/notifications/pages/PushNotificationsPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/pwa</b>: 3 archivos + 2 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `components/pwa/PwaInstallNotice.tsx` | `features/pwa/components/PwaInstallNotice.tsx` | 2 |  |
| `components/pwa/PwaUpdateNotice.tsx` | `features/pwa/components/PwaUpdateNotice.tsx` | 1 |  |
| `pages/PwaInstallGuidePage.tsx` | `features/pwa/pages/PwaInstallGuidePage.tsx` | 2 |  |

</details>

<details><summary><b>src/features/auth</b>: 7 archivos + 1 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `pages/grupo 9/VerificationPage.tsx` | `features/auth/pages/AccountVerificationPage.tsx` | 1 | renombre |
| `pages/grupo 9/AuthErrorPage.tsx` | `features/auth/pages/AuthErrorPage.tsx` | 1 |  |
| `pages/grupo 9/ForgetPassword.tsx` | `features/auth/pages/ForgotPasswordPage.tsx` | 1 | renombre |
| `pages/grupo 9/ButtonLoading.tsx` | `features/auth/components/ButtonLoading.tsx` | 2 | solo lo usa auth |
| `pages/grupo 9/LoginPage.tsx` | `features/auth/pages/LoginPage.tsx` | 2 |  |
| `pages/grupo 9/ResetPassword.tsx` | `features/auth/pages/ResetPasswordPage.tsx` | 1 | renombre |
| `pages/grupo 9/UnauthorizedPage.tsx` | `features/auth/pages/UnauthorizedPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/games</b>: 12 archivos + 0 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/fetchGameFrameURL.ts` | `features/games/api/gameFrame.ts` | 1 | renombre |
| `components/videogamePage/Filters.tsx` | `features/games/components/Filters.tsx` | 2 |  |
| `components/videogamePage/GameDetailModal.tsx` | `features/games/components/GameDetailModal.tsx` | 2 |  |
| `components/videogamePage/MediaCarousel.tsx` | `features/games/components/MediaCarousel.tsx` | 1 |  |
| `components/videogamePage/TeamCard.tsx` | `features/games/components/TeamCard.tsx` | 2 |  |
| `hooks/useGameLoader.ts` | `features/games/hooks/useGameLoader.ts` | 1 |  |
| `hooks/useInfiniteCarousel.ts` | `features/games/hooks/useInfiniteCarousel.ts` | 1 |  |
| `hooks/useLikesSocket.ts` | `features/games/hooks/useLikesSocket.ts` | 1 |  |
| `pages/gameplayer/gameplayerpage.css` | `features/games/pages/GamePlayerPage.css` | 1 | renombre |
| `pages/gameplayer/GamePlayerPage.tsx` | `features/games/pages/GamePlayerPage.tsx` | 1 |  |
| `pages/grupo 5/HistoricalVideogamesPage.tsx` | `features/games/pages/HistoricalVideogamesPage.tsx` | 1 |  |
| `pages/teams/VideogamesPage.tsx` | `features/games/pages/VideogamesPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/public</b>: 10 archivos + 1 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `components/grupo 5/CountdownTimer.tsx` | `features/public/components/CountdownTimer.tsx` | 1 |  |
| `components/grupo 5/FairStartedAnnouncement.tsx` | (se borra) | 0 | sin importadores desde #299 |
| `components/grupo 5/LandingHeader.tsx` | `features/public/components/LandingHeader.tsx` | 1 | entró con #299 |
| `data/contributorsData.tsx` | `features/public/lib/contributorsData.tsx` | 2 |  |
| `pages/grupo 5/CreditsPage.css` | `features/public/pages/CreditsPage.css` | 1 |  |
| `pages/grupo 5/CreditsPage.tsx` | `features/public/pages/CreditsPage.tsx` | 1 |  |
| `pages/grupo 5/InformationPage.tsx` | `features/public/pages/InformationPage.tsx` | 1 |  |
| `pages/grupo 5/LandingPage.tsx` | `features/public/pages/LandingPage.tsx` | 1 |  |
| `pages/NotFoundPage.tsx` | `features/public/pages/NotFoundPage.tsx` | 1 |  |
| `pages/grupo 5/FeriasPasadas.tsx` | `features/public/pages/PastFairsPage.tsx` | 1 | renombre |
| `pages/RegistrationClosedPage.tsx` | `features/public/pages/RegistrationClosedPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/academic</b>: 11 archivos + 3 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/nrcs.ts` | `features/academic/api/nrcs.ts` | 2 |  |
| `components/grupo 9/CriterionTable.tsx` | `features/academic/components/CriterionTable.tsx` | 1 |  |
| `components/grupo 9/NrcsTable.tsx` | `features/academic/components/NrcsTable.tsx` | 1 |  |
| `components/grupo 9/professorsTable.tsx` | `features/academic/components/ProfessorsTable.tsx` | 1 | renombre |
| `components/grupo 9/SubjectsTable.tsx` | `features/academic/components/SubjectsTable.tsx` | 1 |  |
| `lib/weightsResponse.ts` | `features/academic/lib/weightsResponse.ts` | 2 | asignado por consumidores |
| `pages/grupo 9/CriterionPage.tsx` | `features/academic/pages/CriteriaPage.tsx` | 1 | renombre (como su componente y `/criterios`) |
| `pages/grupo 9/GradeWeightsPage.tsx` | `features/academic/pages/GradeWeightsPage.tsx` | 1 |  |
| `pages/grupo 9/NrcsPage.tsx` | `features/academic/pages/NrcsPage.tsx` | 2 |  |
| `pages/grupo 9/professorsPage.tsx` | `features/academic/pages/ProfessorsPage.tsx` | 2 | renombre |
| `pages/grupo 9/SubjetsPage.tsx` | `features/academic/pages/SubjectsPage.tsx` | 1 | renombre |

</details>

<details><summary><b>src/features/external-presenters</b>: 6 archivos + 6 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/externalPresenters.ts` | `features/external-presenters/api/externalPresenters.ts` | 18 |  |
| `components/admin/external-presenters/BulkPresentersDialog.tsx` | `features/external-presenters/components/BulkPresentersDialog.tsx` | 2 |  |
| `components/admin/external-presenters/ExternalPresenterFormDialog.tsx` | `features/external-presenters/components/ExternalPresenterFormDialog.tsx` | 2 |  |
| `lib/externalPresenters.ts` | `features/external-presenters/lib/externalPresenters.ts` | 5 | asignado por consumidores |
| `pages/admin/ExternalPresentersPage.tsx` | `features/external-presenters/pages/ExternalPresentersPage.tsx` | 2 |  |
| `pages/external-presenter/MyRegistrationPage.tsx` | `features/external-presenters/pages/MyRegistrationPage.tsx` | 2 |  |

</details>

#### Símbolos que se renombran (FA)

| Archivo (ruta nueva en `src/`) | Símbolo actual | Símbolo nuevo |
|---|---|---|
| `features/auth/pages/AccountVerificationPage.tsx` | `VerifyEmailPage` | `AccountVerificationPage` |
| `features/auth/pages/ForgotPasswordPage.tsx` | `ForgetPassword` | `ForgotPasswordPage` |
| `features/auth/pages/ResetPasswordPage.tsx` | `ResetPassword` | `ResetPasswordPage` |
| `features/public/pages/CreditsPage.tsx` | `DevelopersCredits` | `CreditsPage` |
| `features/public/pages/InformationPage.tsx` | `CompetitionInfo` | `InformationPage` |
| `features/public/pages/LandingPage.tsx` | `Landing` | `LandingPage` |
| `features/public/pages/PastFairsPage.tsx` | `CompetitionInfo` | `PastFairsPage` |

### FB. Jurados

<details><summary><b>src/features/jurors/badges</b>: 4 archivos + 0 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/jurorBadges.ts` | `features/jurors/badges/api/jurorBadges.ts` | 3 |  |
| `components/admin/juror-badges/GenerateResultDialog.tsx` | `features/jurors/badges/components/GenerateResultDialog.tsx` | 1 |  |
| `components/admin/juror-badges/JurorBadgesTable.tsx` | `features/jurors/badges/components/JurorBadgesTable.tsx` | 1 |  |
| `pages/admin/JurorBadgesPage.tsx` | `features/jurors/badges/pages/JurorBadgesPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/jurors/edition</b>: 4 archivos + 2 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/jurorEdition.ts` | `features/jurors/edition/api/jurorEdition.ts` | 7 |  |
| `components/admin/juror-edition/EditionJurorsTable.tsx` | `features/jurors/edition/components/EditionJurorsTable.tsx` | 1 |  |
| `components/admin/juror-edition/EnrollJurorDialog.tsx` | `features/jurors/edition/components/EnrollJurorDialog.tsx` | 1 |  |
| `pages/admin/EditionJurorsPage.tsx` | `features/jurors/edition/pages/EditionJurorsPage.tsx` | 2 |  |

</details>

<details><summary><b>src/features/jurors/attendance</b>: 6 archivos + 3 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/jurorAttendance.ts` | `features/jurors/attendance/api/jurorAttendance.ts` | 7 |  |
| `fetchs/jurorCheckIn.ts` | `features/jurors/attendance/api/jurorCheckIn.ts` | 4 |  |
| `components/staff/JurorAttendanceTable.tsx` | `features/jurors/attendance/components/JurorAttendanceTable.tsx` | 1 |  |
| `hooks/useJurorAttendance.ts` | `features/jurors/attendance/hooks/useJurorAttendance.ts` | 1 |  |
| `pages/staff/JurorAttendancePage.tsx` | `features/jurors/attendance/pages/JurorAttendancePage.tsx` | 2 |  |
| `pages/staff/JurorCheckInPage.tsx` | `features/jurors/attendance/pages/JurorCheckInPage.tsx` | 2 |  |

</details>

<details><summary><b>src/features/jurors/survey</b>: 3 archivos + 3 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/jurorSurvey.ts` | `features/jurors/survey/api/jurorSurvey.ts` | 10 |  |
| `components/juror-survey/JurorSurveyDialog.tsx` | `features/jurors/survey/components/JurorSurveyDialog.tsx` | 2 |  |
| `pages/admin/JurorSurveyResultsPage.tsx` | `features/jurors/survey/pages/JurorSurveyResultsPage.tsx` | 2 |  |

</details>

<details><summary><b>src/features/jurors/presence</b>: 7 archivos + 3 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/absenceAlert.ts` | `features/jurors/presence/api/absenceAlert.ts` | 2 |  |
| `fetchs/absentJurorResponses.ts` | `features/jurors/presence/api/absentJurorResponses.ts` | 2 |  |
| `fetchs/jurorPresence.ts` | `features/jurors/presence/api/jurorPresence.ts` | 12 |  |
| `components/juror-presence/JurorPresencePrompt.tsx` | `features/jurors/presence/components/JurorPresencePrompt.tsx` | 2 |  |
| `components/juror-presence/JurorPresenceSection.tsx` | `features/jurors/presence/components/JurorPresenceSection.tsx` | 3 |  |
| `contexts/JurorPresenceContext.tsx` | `features/jurors/presence/contexts/JurorPresenceContext.tsx` | 4 |  |
| `hooks/useJurorPresenceList.ts` | `features/jurors/presence/hooks/useJurorPresenceList.ts` | 1 |  |

</details>

<details><summary><b>src/features/jurors/management</b>: 8 archivos + 6 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `components/grupo 12/JurorCategoryTypeFields.tsx` | `features/jurors/management/components/JurorCategoryTypeFields.tsx` | 1 |  |
| `components/grupo 12/JuryManagementTable.tsx` | `features/jurors/management/components/JuryManagementTable.tsx` | 2 |  |
| `components/grupo 12/ManualAssignTeamDialog.tsx` | `features/jurors/management/components/ManualAssignTeamDialog.tsx` | 2 |  |
| `components/grupo 12/RemoveTeamDialog.tsx` | `features/jurors/management/components/RemoveTeamDialog.tsx` | 2 |  |
| `hooks/juryManagement.ts` | `features/jurors/management/api/juryManagement.ts` | 11 | no es un hook: son llamadas a la API |
| `components/grupo 12/manualAssignment.ts` | `features/jurors/management/lib/manualAssignment.ts` | 7 |  |
| `components/grupo 12/utils.ts` | `features/jurors/management/lib/utils.ts` | 7 |  |
| `pages/grupo 12/JuryManagementPage.tsx` | `features/jurors/management/pages/JuryManagementPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/jurors/assignment</b>: 14 archivos + 7 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/automaticAssignment.ts` | `features/jurors/assignment/api/automaticAssignment.ts` | 6 |  |
| `fetchs/jurorsExport.ts` | `features/jurors/assignment/api/jurorsExport.ts` | 4 |  |
| `components/jurados-modals/AllTeamsModal.tsx` | `features/jurors/assignment/components/AllTeamsModal.tsx` | 1 |  |
| `components/jurados-modals/AssignmentWarningsDialog.tsx` | `features/jurors/assignment/components/AssignmentWarningsDialog.tsx` | 4 |  |
| `components/jurados-modals/AuditModal.tsx` | `features/jurors/assignment/components/AuditModal.tsx` | 1 |  |
| `components/jurados-modals/AutomaticAssignmentModal.tsx` | `features/jurors/assignment/components/AutomaticAssignmentModal.tsx` | 3 |  |
| `components/jurados-modals/CreateJurorModal.tsx` | `features/jurors/assignment/components/CreateJurorModal.tsx` | 1 |  |
| `components/jurados-modals/EditJurorModal.tsx` | `features/jurors/assignment/components/EditJurorModal.tsx` | 1 |  |
| `components/jurados-modals/JuradoAssignModal.tsx` | `features/jurors/assignment/components/JurorAssignModal.tsx` | 2 | renombre |
| `components/jurados-modals/JuradosListModal.tsx` | `features/jurors/assignment/components/JurorsListModal.tsx` | 1 | renombre |
| `hooks/useAssignmentWarnings.ts` | `features/jurors/assignment/hooks/useAssignmentWarnings.ts` | 4 |  |
| `lib/assignmentWarnings.ts` | `features/jurors/assignment/lib/assignmentWarnings.ts` | 8 |  |
| `components/jurados-modals/automaticAssignmentAlerts.ts` | `features/jurors/assignment/lib/automaticAssignmentAlerts.ts` | 2 |  |
| `pages/JuradosAssignment.tsx` | `features/jurors/assignment/pages/JurorAssignmentPage.tsx` | 1 | renombre |

</details>

<details><summary><b>src/features/jurors</b> (lo que comparten dos o más subdominios): 1 archivos + 0 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `types/jurados.ts` | `features/jurors/types/jurors.ts` | 15 | lo usan `assignment` y `management`; renombre |

</details>

#### Símbolos que se renombran (FB)

| Archivo (ruta nueva en `src/`) | Símbolo actual | Símbolo nuevo |
|---|---|---|
| `features/jurors/assignment/components/JurorAssignModal.tsx` | `JuradoAssignModal` | `JurorAssignModal` |
| `features/jurors/assignment/components/JurorsListModal.tsx` | `JuradosListModal` | `JurorsListModal` |
| `features/jurors/assignment/pages/JurorAssignmentPage.tsx` | `JuradosAssignment` | `JurorAssignmentPage` |

### FC. Calificación y resultados

<details><summary><b>src/features/grading</b>: 21 archivos + 6 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/evaluationTracking.ts` | `features/grading/api/evaluationTracking.ts` | 2 |  |
| `components/grupo 8/criteriabutton.tsx` | `features/grading/components/CriteriaButton.tsx` | 2 | renombre |
| `components/grupo 8/EvaluationDrafts.tsx` | `features/grading/components/EvaluationDrafts.tsx` | 7 |  |
| `components/grupo 8/GameModal.tsx` | `features/grading/components/GameModal.tsx` | 1 |  |
| `components/grupo 8/boton.tsx` | `features/grading/components/GradingButton.tsx` | 1 | renombre |
| `components/grupo 8/input.tsx` | `features/grading/components/GradingInput.tsx` | 1 | renombre |
| `components/grupo 8/textarea.tsx` | `features/grading/components/GradingTextarea.tsx` | 3 | renombre |
| `components/grupo 8/PendingGradesGrid.tsx` | `features/grading/components/PendingGradesGrid.tsx` | 4 |  |
| `components/grupo 8/TeamVerification.tsx` | `features/grading/components/TeamVerification.tsx` | 4 |  |
| `hooks/useDraftAutosave.ts` | `features/grading/hooks/useDraftAutosave.ts` | 4 |  |
| `pages/grupo 8/batchRoute.ts` | `features/grading/lib/batchRoute.ts` | 2 |  |
| `lib/draftAutosaver.ts` | `features/grading/lib/draftAutosaver.ts` | 3 | asignado por consumidores |
| `pages/grupo 8/BatchRatePage.tsx` | `features/grading/pages/BatchRatePage.tsx` | 1 |  |
| `pages/grupo 8/GradedPage.tsx` | `features/grading/pages/GradedPage.tsx` | 1 |  |
| `pages/grupo 8/PendingGradesPage.tsx` | `features/grading/pages/PendingGradesPage.tsx` | 1 |  |
| `pages/grupo 8/PendingSchoolGradesPage.tsx` | `features/grading/pages/PendingSchoolGradesPage.tsx` | 1 |  |
| `pages/grupo 8/RatePage.tsx` | `features/grading/pages/RatePage.tsx` | 1 |  |
| `pages/RealtimeTrackingPanel.tsx` | `features/grading/pages/RealtimeTrackingPage.tsx` | 2 | renombre |
| `pages/grupo 8/SchoolGradesPage.tsx` | `features/grading/pages/SchoolGradesPage.tsx` | 1 |  |
| `pages/grupo 8/SchoolRate.tsx` | `features/grading/pages/SchoolRatePage.tsx` | 1 | renombre |
| `types/criterion.ts` | `features/grading/types/criterion.ts` | 2 | asignado por consumidores |

</details>

<details><summary><b>src/features/results</b>: 26 archivos + 12 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/finalGrade.ts` | `features/results/api/finalGrade.ts` | 4 |  |
| `fetchs/ranking.ts` | `features/results/api/ranking.ts` | 2 |  |
| `components/grupo 1/CustomTableRow.tsx` | `features/results/components/CustomTableRow.tsx` | 1 |  |
| `components/grupo 1/DownloadReport.tsx` | `features/results/components/DownloadReport.tsx` | 1 |  |
| `components/grupo 1/FilterPanel.tsx` | `features/results/components/FilterPanel.tsx` | 1 |  |
| `components/grupo 1/GraphicsDisplay.tsx` | `features/results/components/GraphicsDisplay.tsx` | 2 |  |
| `components/grupo 5/JudgesGrades.tsx` | `features/results/components/JudgesGrades.tsx` | 1 |  |
| `components/grupo 1/JudgesTable.tsx` | `features/results/components/JudgesTable.tsx` | 1 |  |
| `components/grupo 1/RankingTable.tsx` | `features/results/components/RankingTable.tsx` | 2 |  |
| `components/grupo 1/ResultsTable.tsx` | `features/results/components/ResultsTable.tsx` | 1 |  |
| `components/grupo 5/Scoreboard.tsx` | `features/results/components/Scoreboard.tsx` | 2 |  |
| `components/grupo 5/StudentGradeFilters.tsx` | `features/results/components/StudentGradeFilters.tsx` | 1 |  |
| `components/grupo 5/StudentGradeTable.tsx` | `features/results/components/StudentGradeTable.tsx` | 2 |  |
| `components/grupo 5/StudentGradeTableView.tsx` | `features/results/components/StudentGradeTableView.tsx` | 2 |  |
| `hooks/useTeacherDashboard.ts` | `features/results/hooks/useTeacherDashboard.ts` | 3 |  |
| `lib/averages.ts` | `features/results/lib/averages.ts` | 5 | asignado por consumidores |
| `lib/criteria-columns.ts` | `features/results/lib/criteriaColumns.ts` | 3 | asignado por consumidores; renombre |
| `lib/finalGradeWeights.ts` | `features/results/lib/finalGradeWeights.ts` | 2 | asignado por consumidores |
| `lib/grades.ts` | `features/results/lib/grades.ts` | 2 | asignado por consumidores |
| `pages/admin/FinalGradeReleasePage.tsx` | `features/results/pages/FinalGradeReleasePage.tsx` | 2 |  |
| `pages/grupo 9/ProfessorRankingTiesPage.tsx` | `features/results/pages/ProfessorRankingTiesPage.tsx` | 1 |  |
| `pages/grupo 5/RankingPage.tsx` | `features/results/pages/RankingPage.tsx` | 1 |  |
| `pages/grupo 1/StatisticsPage.tsx` | `features/results/pages/StatisticsPage.tsx` | 1 |  |
| `pages/grupo 5/HomeTeacherPage.tsx` | `features/results/pages/TeacherHomePage.tsx` | 1 | renombre |
| `pages/grupo 9/TiebreakerPage.tsx` | `features/results/pages/TiebreakerPage.tsx` | 1 |  |
| `components/grupo 5/student-grade-table-types.ts` | `features/results/types/studentGradeTable.ts` | 7 | renombre |

</details>

#### Símbolos que se renombran (FC)

| Archivo (ruta nueva en `src/`) | Símbolo actual | Símbolo nuevo |
|---|---|---|
| `features/grading/components/CriteriaButton.tsx` | `Criteriabutton` | `CriteriaButton` |
| `features/grading/components/GradingButton.tsx` | `Button` | `GradingButton` |
| `features/grading/components/GradingInput.tsx` | `Input` | `GradingInput` |
| `features/grading/components/GradingTextarea.tsx` | `Textarea` | `GradingTextarea` |
| `features/grading/components/PendingGradesGrid.tsx` | `PendingGamesGrid` | `PendingGradesGrid` |
| `features/grading/pages/RealtimeTrackingPage.tsx` | `RealtimeTrackingPanel` | `RealtimeTrackingPage` |
| `features/grading/pages/SchoolRatePage.tsx` | `SchoolRate` | `SchoolRatePage` |
| `features/results/components/CustomTableRow.tsx` | `CustomTableRowBeta` | `CustomTableRow` |
| `features/results/components/FilterPanel.tsx` | `FiltrosPanel` | `FilterPanel` |
| `features/results/components/GraphicsDisplay.tsx` | `GraphicDisplay` | `GraphicsDisplay` |
| `features/results/components/JudgesTable.tsx` | `TablaPorJurado` | `JudgesTable` |
| `features/results/components/RankingTable.tsx` | `TablaRanking` | `RankingTable` |
| `features/results/components/ResultsTable.tsx` | `TablaResultados` | `ResultsTable` |
| `features/results/pages/RankingPage.tsx` | `PodioGamer` | `RankingPage` |
| `features/results/pages/TeacherHomePage.tsx` | `HomeTeacherPage` | `TeacherHomePage` |

### FD. Ediciones y equipos

<details><summary><b>src/features/editions</b>: 19 archivos + 1 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `components/admin/editions/BannerUpload.tsx` | `features/editions/components/BannerUpload.tsx` | 1 |  |
| `components/admin/editions/EditionDetailView.tsx` | `features/editions/components/EditionDetailView.tsx` | 1 |  |
| `components/admin/editions/EditionForm.tsx` | `features/editions/components/EditionForm.tsx` | 1 |  |
| `components/admin/editions/EditionsTable.tsx` | `features/editions/components/EditionsTable.tsx` | 1 |  |
| `components/admin/editions/EducationalFocusesManager.tsx` | `features/editions/components/EducationalFocusesManager.tsx` | 1 |  |
| `components/grupo 9/EventSetupCard.tsx` | `features/editions/components/EventSetupCard.tsx` | 1 |  |
| `components/admin/editions/GalleryUpload.tsx` | `features/editions/components/GalleryUpload.tsx` | 1 |  |
| `components/admin/editions/HighlightedGamesSelector.tsx` | `features/editions/components/HighlightedGamesSelector.tsx` | 1 |  |
| `components/admin/editions/modals/BannerModal.tsx` | `features/editions/components/modals/BannerModal.tsx` | 1 |  |
| `components/admin/editions/modals/CreateEditionModal.tsx` | `features/editions/components/modals/CreateEditionModal.tsx` | 1 |  |
| `components/admin/editions/modals/EditionInfoModal.tsx` | `features/editions/components/modals/EditionInfoModal.tsx` | 1 |  |
| `components/admin/editions/modals/EducationalFocusesModal.tsx` | `features/editions/components/modals/EducationalFocusesModal.tsx` | 1 |  |
| `components/admin/editions/modals/GalleryModal.tsx` | `features/editions/components/modals/GalleryModal.tsx` | 1 |  |
| `components/admin/editions/modals/HighlightedGamesModal.tsx` | `features/editions/components/modals/HighlightedGamesModal.tsx` | 1 |  |
| `components/admin/editions/modals/TestimonialsModal.tsx` | `features/editions/components/modals/TestimonialsModal.tsx` | 1 |  |
| `components/grupo 9/RegistrationsToggleCard.tsx` | `features/editions/components/RegistrationsToggleCard.tsx` | 2 |  |
| `components/admin/editions/TestimonialsManager.tsx` | `features/editions/components/TestimonialsManager.tsx` | 1 |  |
| `pages/admin/EditionsManagementPage.tsx` | `features/editions/pages/EditionsManagementPage.tsx` | 1 |  |
| `components/grupo 9/EventConfigurationPage.tsx` | `features/editions/pages/EventConfigurationPage.tsx` | 1 |  |

</details>

<details><summary><b>src/features/teams</b>: 44 archivos + 8 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/editionStudents.ts` | `features/teams/api/editionStudents.ts` | 4 |  |
| `fetchs/teamGradable.ts` | `features/teams/api/teamGradable.ts` | 3 | entró con #298 |
| `fetchs/teamVerification.ts` | `features/teams/api/teamVerification.ts` | 5 |  |
| `components/grupo 5/CardTeamMembers.tsx` | `features/teams/components/CardTeamMembers.tsx` | 1 |  |
| `components/grupo 5/CardTeamVideogame.tsx` | `features/teams/components/CardTeamVideogame.tsx` | 1 |  |
| `components/grupo 5/EditBoard.tsx` | `features/teams/components/EditBoard.tsx` | 1 |  |
| `components/grupo 9/EditionStudentsPanel.tsx` | `features/teams/components/EditionStudentsPanel.tsx` | 1 |  |
| `components/grupo 5/FormEditMembers.tsx` | `features/teams/components/FormEditMembers.tsx` | 1 |  |
| `components/grupo 5/FormEditVideogame.tsx` | `features/teams/components/FormEditVideogame.tsx` | 1 |  |
| `components/grupo 5/NotEnrolledNotice.tsx` | `features/teams/components/NotEnrolledNotice.tsx` | 2 |  |
| `components/grupo 11/GameStep.tsx` | `features/teams/components/registration/GameStep.tsx` | 1 |  |
| `components/grupo 11/ImageCropper.tsx` | `features/teams/components/registration/ImageCropper.tsx` | 4 |  |
| `components/grupo 11/LinksStep.tsx` | `features/teams/components/registration/LinksStep.tsx` | 1 |  |
| `components/grupo 11/MembersStep.tsx` | `features/teams/components/registration/MembersStep.tsx` | 2 |  |
| `components/grupo 11/MultiStepWizard.tsx` | `features/teams/components/registration/MultiStepWizard.tsx` | 1 |  |
| `components/grupo 11/StepRenderer.tsx` | `features/teams/components/registration/StepRenderer.tsx` | 1 |  |
| `components/grupo 11/SubjectNrcPicker.tsx` | `features/teams/components/registration/SubjectNrcPicker.tsx` | 1 |  |
| `components/grupo 11/TeamStep.tsx` | `features/teams/components/registration/TeamStep.tsx` | 1 |  |
| `components/grupo 5/TeamImages.tsx` | `features/teams/components/TeamImages.tsx` | 1 |  |
| `components/grupo 5/TeamMembers.tsx` | `features/teams/components/TeamMembers.tsx` | 1 |  |
| `components/grupo 5/TeamSkeleton.tsx` | `features/teams/components/TeamSkeleton.tsx` | 2 |  |
| `components/grupo 9/TeamsManagementTable.tsx` | `features/teams/components/TeamsManagementTable.tsx` | 1 |  |
| `components/grupo 9/TeamVerificationCodeDialog.tsx` | `features/teams/components/TeamVerificationCodeDialog.tsx` | 1 |  |
| `components/grupo 5/TeamVideogame.tsx` | `features/teams/components/TeamVideogame.tsx` | 1 |  |
| `components/grupo 9/TeamWizardDialog.tsx` | `features/teams/components/TeamWizardDialog.tsx` | 1 |  |
| `components/grupo 9/TeamWizardForm.tsx` | `features/teams/components/TeamWizardForm.tsx` | 1 |  |
| `components/grupo 5/VerificationCode.tsx` | `features/teams/components/VerificationCode.tsx` | 1 |  |
| `contexts/MultiFormContext.tsx` | `features/teams/contexts/MultiFormContext.tsx` | 7 |  |
| `hooks/useTeamVerification.ts` | `features/teams/hooks/useTeamVerification.ts` | 3 |  |
| `components/grupo 11/azureFile.ts` | `features/teams/lib/azureFile.ts` | 4 |  |
| `lib/nrcSubjects.ts` | `features/teams/lib/nrcSubjects.ts` | 4 | asignado por consumidores |
| `lib/registration.ts` | `features/teams/lib/registration.ts` | 4 | asignado por consumidores |
| `lib/schemas.ts` | `features/teams/lib/schemas.ts` | 9 | asignado por consumidores |
| `lib/subjectRules.ts` | `features/teams/lib/subjectRules.ts` | 3 | asignado por consumidores |
| `components/grupo 9/submitTeamsAdmin.tsx` | `features/teams/lib/submitTeamsAdmin.tsx` | 1 |  |
| `components/grupo 9/teams-utils.tsx` | `features/teams/lib/teamsUtils.tsx` | 4 | renombre |
| `components/grupo 9/validationTeamsAdmin.tsx` | `features/teams/lib/validationTeamsAdmin.tsx` | 3 |  |
| `pages/grupo 5/EditTeamPage.tsx` | `features/teams/pages/EditTeamPage.tsx` | 1 |  |
| `pages/grupo 5/MisJuradosPage.tsx` | `features/teams/pages/MyJurorsPage.tsx` | 1 | renombre |
| `pages/grupo 5/HomeStudentPage.tsx` | `features/teams/pages/StudentHomePage.tsx` | 1 | renombre |
| `pages/teams/TeamRegisterPage.tsx` | `features/teams/pages/TeamRegisterPage.tsx` | 2 |  |
| `pages/grupo 9/TeamsManagementPage.tsx` | `features/teams/pages/TeamsManagementPage.tsx` | 1 |  |
| `types/teamMembers.ts` | `features/teams/types/teamMembers.ts` | 4 | asignado por consumidores |
| `types/teamVideogames.ts` | `features/teams/types/teamVideogames.ts` | 4 | asignado por consumidores |

</details>

#### Símbolos que se renombran (FD)

| Archivo (ruta nueva en `src/`) | Símbolo actual | Símbolo nuevo |
|---|---|---|
| `features/teams/components/CardTeamMembers.tsx` | `CardTeamMember` | `CardTeamMembers` |
| `features/teams/pages/MyJurorsPage.tsx` | `MisJuradosPage` | `MyJurorsPage` |
| `features/teams/pages/StudentHomePage.tsx` | `HomeStudentPage` | `StudentHomePage` |

### FE. Compartido (layouts, routes, components, contexts, api)

<details><summary><b>compartido</b>: 26 archivos + 8 pruebas</summary>

| Ruta actual (`src/`) | Ruta nueva (`src/`) | Imports | Nota |
|---|---|---|---|
| `fetchs/editions.ts` | `api/editions.ts` | 31 |  |
| `fetchs/evaluationProgress.ts` | `api/evaluationProgress.ts` | 3 |  |
| `fetchs/registrations.ts` | `api/registrations.ts` | 5 |  |
| `components/grupo 5/DiscordButton.tsx` | `components/DiscordButton.tsx` | 5 |  |
| `components/juror-presence/JurorPresenceNotice.tsx` | `components/JurorPresenceNotice.tsx` | 3 |  |
| `components/juror-survey/JurorSurveyAccess.tsx` | `components/JurorSurveyAccess.tsx` | 5 |  |
| `components/grupo 5/LoadingScreen.tsx` | `components/LoadingScreen.tsx` | 19 |  |
| `components/grupo 5/NavBar.tsx` | `components/NavBar.tsx` | 9 |  |
| `components/grupo 5/PurpleButton.tsx` | `components/PurpleButton.tsx` | 1 |  |
| `components/grupo 5/TeamCode.tsx` | `components/TeamCode.tsx` | 3 |  |
| `components/grupo 5/TextSizeControl.tsx` | `components/TextSizeControl.tsx` | 10 |  |
| `components/grupo 11/theme-provider.tsx` | `components/ThemeProvider.tsx` | 2 | renombre |
| `components/grupo 9/WorkingEditionBadge.tsx` | `components/WorkingEditionBadge.tsx` | 1 |  |
| `fetchs/grupo 1/GlobalStateContext.tsx` | `contexts/GlobalStateContext.tsx` | 14 |  |
| `hooks/use-criteria.ts` | `hooks/useCriteria.ts` | 5 | renombre |
| `components/grupo 9/app-sidebar.tsx` | `layouts/AppSidebar.tsx` | 13 | renombre |
| `components/grupo 9/BreadCrums.tsx` | `layouts/Breadcrumbs.tsx` | 1 | renombre |
| `layouts/LayoutAplication.tsx` | `layouts/LayoutApplication.tsx` | 39 | renombre |
| `components/fondo/FondoArkad.tsx` | `components/background/ArkadBackground.tsx` | 19 | renombre |
| `components/fondo/FondoPanel.tsx` | `components/background/PanelBackground.tsx` | 5 | renombre |
| `components/fondo/escena.ts` | `components/background/scene.ts` | 1 | renombre |
| `routes/RestablecerInteraccion.tsx` | `routes/RestoreInteraction.tsx` | 2 | renombre |
| `types/Team.ts` | `types/team.ts` | 15 | renombre (camelCase) |
| `components/grupo 9/nav-projects.tsx` | `layouts/NavContent.tsx` | 1 | renombre (como su componente) |
| `components/grupo 9/nav-user.tsx` | `layouts/NavUser.tsx` | 1 | renombre |
| `components/grupo 9/ProtectedRoute.tsx` | `routes/ProtectedRoute.tsx` | 2 |  |

</details>

#### Símbolos que se renombran (FE)

| Archivo (ruta nueva en `src/`) | Símbolo actual | Símbolo nuevo |
|---|---|---|
| `components/TextSizeControl.tsx` | `TextSizeControls` | `TextSizeControl` |
| `layouts/LayoutApplication.tsx` | `LayoutAplication` | `LayoutApplication` |
| `components/background/ArkadBackground.tsx` | `FondoArkad` | `ArkadBackground` |
| `components/background/ArkadBackground.tsx` | `FondoArkadProps` | `ArkadBackgroundProps` |
| `components/background/PanelBackground.tsx` | `FondoPanel` | `PanelBackground` |
| `components/background/scene.ts` | `crearEscena` | `createScene` |
| `components/background/scene.ts` | `Escena` | `Scene` |
| `components/background/scene.ts` | `OpcionesEscena` | `SceneOptions` |
| `components/background/scene.ts` | `ModoFondo` | `BackgroundMode` |
| `routes/RestoreInteraction.tsx` | `RestablecerInteraccion` | `RestoreInteraction` |
| `components/NavBar.tsx` | `navBar` | `NavBar` |
| `components/PurpleButton.tsx` | `purpleButton` | `PurpleButton` |

**Se quedan donde están (compartidos):** `contexts/AuthContext.tsx`, `contexts/SocketContext.tsx`, `contexts/TextSizeContext.tsx`, `hooks/use-mobile.ts` (shadcn), `hooks/useFetch.ts`, `hooks/useWorkingEdition.ts` (con `lib/workingEdition.ts`), `lib/api.ts`, `lib/certificates.ts`, `lib/editionDate.ts`, `lib/evaluationDrafts.ts`, `lib/gradeDrafts.ts`, `lib/jurorLabel.ts`, `lib/jurorSurvey.ts`, `lib/localDraftsOwner.ts`, `lib/notEnrolled.ts`, `lib/opaqueKeys.ts`, `lib/ownTeam.ts`, `lib/pwa.ts`, `lib/session.ts`, `lib/utils.ts`, `lib/workingEdition.ts`, `types/auth.ts`, `types/team.ts`. Se quedan por **genéricos**, aunque hoy los use un solo dominio: `components/CircularProgress.tsx`, `hooks/useLockViewportZoom.ts`, `lib/pagination.ts` y `lib/pluralize.ts`.

## Después de TA-15

- Actualizar este documento: qué bloques entraron y cuáles quedaron pendientes.
- Volver a correr los comandos de los diagnósticos para dejar la nueva línea base.
- Las 35 vistas que importan `apiFetch`, la duplicación de `grading` y los archivos de más de 500 líneas siguen como deuda, con sus hallazgos (H2–H4 del front, H2–H3 del back).
