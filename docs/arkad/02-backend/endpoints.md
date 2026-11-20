# Endpoints

> **Audiencia:** Backend, Frontend · **Actualizado:** 2026-11-07 · **Estado:** completo (mapa por controlador + inventario de acceso de `origin/main`) · **Fuente:** `src/**/*.controller.ts`, `npm run routes:inventory`

El nivel de acceso (público / sesión / permiso por servicio y roles) de **cada** ruta está en [inventario-de-rutas](inventario-de-rutas.md). Swagger (`/api`, no en producción) muestra los DTO. Aquí el mapa por controlador.

| Prefijo | Rutas |
|---|---|
| `/` | `GET /` (health) |
| `/auth` | `POST login`, `GET outlook-login`, `GET callback`, `POST refresh`, `POST logout`, `POST resend-confirmation`, `POST reset-password`, `POST set-password`, `GET verify-token`, `POST reset-token-expiration`, `GET me` |
| `/editions` | `POST /`, `GET /`, `GET :id`, `PATCH :id`, `DELETE :id`, `PATCH :id/activate`, `POST :id/archive`, `POST :id/main-photo`, `POST|DELETE :id/photos`, `GET :id/videogames` |
| `/editions/:editionId/educational-focuses` · `/testimonials` · `/highlighted-games` | CRUD (`highlighted-games`: `POST` con `videogameId` o `historicalVideogameId` (uno solo; 409 si ya está destacado), `GET` (solo juegos en vivo), `DELETE :videogameId`, `DELETE historical/:historicalVideogameId`; HU-41, ARK-229) |
| `/highlighted-games` | `GET /?editionId=` pública: destacados en vivo e históricos de todas las ediciones (o de una), sin paginar, edición más reciente primero; cada uno con `play` (`live`/`historical` + id) y `hasGameFile` (HU-41, ARK-229) |
| `/teams` | `POST /`, `POST admin`, `GET /`, `GET incomplete-jurors`, `GET name/:teamName`, `GET videogame/:videogameName`, `GET final-score/videogame/:videogameId`, `GET final-score/team/:teamId`, `GET final-score/by-n/:n` (ranking público: solo el podio de cada nivel y sin notas, HU-48), `POST validate-emails`, `POST validate-student-codes`, `GET leader/:email/status`, `GET :id`, `GET :id/full`, `PATCH :id`, `DELETE :id`, `POST :id/member`, `DELETE :id/members/:memberId`, `PATCH :teamId/members/:memberId` |
| `/teams/:teamId/members` | **No existe en la API.** El antiguo `MembersModule` nunca se montó y se borró en TA-15 (ARK-51). Las rutas de integrantes que sí existen están en `/teams` (`POST :id/member`, `PATCH :teamId/members/:memberId`, `DELETE :id/members/:memberId`) y en `/students` (`GET members`, `PATCH members/:memberId/nrcs`) |
| `/team-verification` | `POST verify`, `GET my-code`, `GET status`, `GET :teamId`, `POST :teamId/regenerate` |
| `/videogames` | `POST`, `GET`, `GET :id`, `PATCH :id`, `DELETE :id`, `GET :id/likes`, `GET :id/my-like`, `POST :id/toggle-like` |
| `/upload` | `POST /`, `POST zip`, `GET :id`, `GET :id/url`, `POST :id/public`, `DELETE :id` |
| `/students` | `GET /`, `GET participation`, `GET my-judges`, `GET grades`, `GET members`, `PATCH members/:memberId/nrcs` |
| `/professors` | CRUD; `GET my-subjects`, `select-options`, `download-grading-report-grouped`, `nrc-report/by-id/:nrcId`, `nrc-report/:nrcCode`, `juror-evaluations`, `signature-report/:subjectName`, `POST team-evaluation`, `POST team-evaluation/batch`, `GET grading-games`, `grading-games/filter-options` |
| `/subjects` · `/nrcs` · `/criteria` | CRUD + `select-options`; `/criteria` además `PATCH :id/restore` |
| `/evaluation` | `GET progress`, `POST with-details`, `POST batch` |
| `/pending-games` · `/graded-games` | `GET /`, `search`, `count`, `search/quick` |
| `/final-grade` | `GET release`, `PATCH release` (Administrador), `GET me` (Estudiante): nota final liberada a los estudiantes (HU-20) |
| `/ranking` | `GET /`, `GET winners`, `GET ties`, `GET decisions` (historial), `POST finalize`. `GET my-ties` y `POST ties/decision` se quitaron con HU-47 (desempate siempre por inscripción) |
| `/juror` | `POST /`, `GET /`, `GET :id`, `PATCH :id`, `DELETE :id`, `GET evaluators`, `GET evaluations-assignment`, `POST resend-confirmation`, `POST assignments`, `POST assignments/substitutes/bulk` (suplentes en lote, HU-09, ARK-215; contrato: `docs/frontend/HU-09-suplentes-en-lote.md`), `PATCH assignments/reassign`, `DELETE assignments`, `DELETE assignments/all`, `DELETE :id/assignments`, `GET assignments/audit`, `GET evaluation-tracking`, `GET :id/teams`, `GET teams/:teamId/evaluation-stats`, `GET teams/:teamId/jurors-status` |
| `/juror-edition` | `GET /`, `POST import-previous`, `PATCH status`, `POST enroll` |
| `/juror-badges` | `POST generate`, `GET /`, `GET pdf`, `POST :jurorId/regenerate` |
| `/juror-checkin` | `GET badge` (vista previa del QR sin registrar, BG-49), `POST scan`, `GET search`, `POST manual` |
| `/staff` | `POST /` (alta de cuentas Staff) |
| `/evaluation-tracking` | `GET /` (seguimiento por hora) |
| `/substitute-notices` | `GET me` y `PATCH :id/read` (suplente, servicio `ViewOwnSubstituteNotices`): avisos «Te asignaron grupos» y marcar como leído; `GET unread` (Administrador, `AssignJurors`): suplentes con el aviso sin leer, para el panel de seguimiento (HU-22, ARK-84). Contrato: `docs/frontend/HU-22-aviso-suplente.md` |
| `/walk-in-jurors` | `POST /` (solo Administrador, servicio `ManageWalkInJurors`): alta del jurado que llegó sin estar registrado, siempre Junior y Suplente, Confirmado en la edición activa (`walkIn`) y con su llegada marcada, todo en una transacción. 409 `EMAIL_ALREADY_EXISTS` (trae la persona) y 409 `SIMILAR_PEOPLE` (se confirma con `confirmSimilar`). `GET :jurorId/team-suggestion` propone hasta `maxTeams` (3) grupos del nivel con más jurados faltantes, sin colegios, sin guardar nada; `POST :jurorId/assignments` asigna al suplente los grupos confirmados, solo sumando, con reglas de HU-08, bitácora y aviso de HU-22 (HU-24, ARK-217). Contrato: `docs/frontend/HU-24-alta-jurado-ultimo-momento.md` |
| `/settings` | `GET|POST|PUT weights`, `GET weights/:editionId`, `GET|PATCH evaluations-status`, `show-ranking`, `show-evaluations`, `registrations` |
| `/reports` | `GET videojuegoData`, `materiaData`, `NRCData`, `DatosGraficoMateria`, `JuradosData`, `exportExcel`, `exportJurados` |
| `/historicals` | `GET historical-teams`, `historical-teams/:editionId`, `historical-members/:TeamId`, `historical-videogames/:editionId`, `historical-teams-with-scores/:editionId`, `videogames/:historicalVideogameId/game-file` (pública: URL firmada del zip y `entry` para «Jugar», HU-40); `POST create-historical-edition-dump/:editionId`; `PATCH update-historical-{team,member,videogame}/:id`; `DELETE remove-historical-{team,member,videogame}/:id` |
| `/certificates` | `POST juror`, `POST juror/all` |
| `/email` | `POST resend-auth-email`, `resend-team-email`, `resend-certificate-email` |

## Convenciones que conviene saber
- Casi todo listado acepta `?editionId=`; sin él usa la edición **activa**. Escribir sobre una edición que no es la activa devuelve **400** `EDITION_READ_ONLY`; sin edición activa, **404** `NO_ACTIVE_EDITION` (o `WEIGHTS_NOT_CONFIGURED`). Ver `docs/editions.md`.
- Descargas Excel/PDF exponen `Content-Disposition`.
- Lote de evaluaciones: `POST /evaluation/batch` (1 a 50 filas, validación en memoria, todo o nada; idempotente por clave). Calificar exige código de verificación (salvo N0) y que el juego sea de la edición activa.
- `GET /teams` sin parámetro devuelve solo la edición activa. Acepta además `search` (sin tildes ni mayúsculas; cada palabra debe estar en el nombre del equipo, el del juego o el código del equipo) y `origin` (`uninorte` o `externo`, según `isExternal`; otro valor responde 400), filtrados en la consulta y combinables con `page`, `limit`, `editionId` y `sortByLikes`: `metaData.totalItems` y `totalPages` ya son los filtrados (BG-53, ARK-253).

## Rutas nuevas en producción (no están en la rama local de lectura)
| Prefijo | Rutas | Permiso |
|---|---|---|
| `/juror/automatic-assignment` | `POST preview` (calcula el plan sin guardar), `POST confirm` (guarda el plan) | `AssignJurors` |
| `/juror-attendance` | `GET /` (tabla de asistencia de la edición: presentes y faltantes, con paginación y búsqueda; cada fila trae `attendanceId` de la llegada activa o `null`) | `ViewJurorAttendance` |
| `/juror-attendance` | `PATCH :attendanceId/annul` (BG-49, ARK-251): anula una llegada registrada por error. Body opcional `{ reason }` (máx. 500). Borrado lógico con quién, cuándo y el motivo; el jurado vuelve a `MISSING` en asistencia, alerta de inasistencia y presencia, y se puede registrar de nuevo. 404 `ATTENDANCE_NOT_FOUND`, 409 `ARRIVAL_ALREADY_ANNULLED`, 400 `EDITION_READ_ONLY`. Contrato: `docs/frontend/BG-49-anular-llegada.md` | `AnnulJurorArrival` (solo Administrador; Staff no) |

## Acceso por ruta
Inventario completo y verificado: [inventario-de-rutas](inventario-de-rutas.md), generado con `npm run routes:inventory` sobre `origin/main` (`bcfe237`): **203 rutas** = 145 con permiso por servicio, 48 públicas, 10 solo con sesión, 0 sin decidir. Hay una prueba (`route-access.spec.ts`) que falla si una ruta queda sin decidir.
