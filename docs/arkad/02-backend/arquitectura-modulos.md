# Arquitectura y módulos

> **Audiencia:** Backend · **Actualizado:** 2026-11-05 · **Estado:** parcial (módulos y responsabilidades inferidas de `app.module.ts` y controladores; falta leer cada servicio) · **Fuente:** `src/app.module.ts`, `src/*/*.controller.ts`

> Estructura objetivo, agrupación de dominios (`src/jurors/`) y convenciones: [estructura objetivo y convenciones](estructura-objetivo-y-convenciones.md) (TA-14).

## Patrón
NestJS clásico: cada carpeta de `src/` es un módulo (`*.module.ts`) con controlador(es), servicio(s), DTOs (`dto/`), a veces entidades/repositorios (`teams/` tiene `controllers/`, `services/`, `repositories/`). Guard JWT **global** (`APP_GUARD`) y `@Public()` para rutas abiertas; permisos con `RolePermissionGuard` + `@RequiredService('<servicio>')` ([auth-y-sesiones](auth-y-sesiones.md)). Los ficheros `*.spec.ts` van junto al código.

## Módulos por dominio

| Dominio | Módulos (`src/`) | Responsabilidad |
|---|---|---|
| Plataforma | `prisma`, `cache`, `common`, `settings`, `app.*` | Cliente Prisma, caché en memoria, utilidades (`common/throttle`, `common/utils`), configuración del evento y ponderados |
| Acceso | `auth`, `email`, `staff` | Login/refresh/logout/reset, Entra ID, guards; envío de correos; alta de cuentas Staff |
| Ediciones y landing | `editions`, `educational-focuses`, `testimonials`, `highlighted-games`, `historicals`, `minigame-records` | Ciclo de vida de la edición (crear, activar, archivar), contenido público por edición, histórico, récords de los minijuegos de la landing (HU-52) |
| Inscripción | `teams`, `team-verification`, `students`, `videogames`, `upload` | Equipos e integrantes, código de verificación, panel del estudiante, videojuegos y multimedia, archivos (Azure Blob) |
| Académico | `subjects`, `nrcs`, `professors`, `criterion` | Materias, NRC, panel del profesor (notas, reportes, filtros), criterios de evaluación |
| Jurados | `jurors/juror`, `jurors/juror-edition`, `jurors/juror-badges`, `jurors/juror-checkin`, `jurors/juror-attendance`, `jurors/juror-presence`, `jurors/juror-survey`, `jurors/absence-alert`, `jurors/absent-juror-responses`, `evaluation-tracking` | Alta y asignación de jurados (con validación y bitácora), jurados por edición, escarapelas QR, check-in, seguimiento por hora |
| Evaluación | `evaluation`, `pending-games`, `graded-games`, `ranking` | Calificar (con detalles, en lote, idempotente), juegos pendientes/calificados, ranking por nivel y desempate |
| Salidas | `reports`, `certificates` | Reportes y Excel, certificados PDF (Gotenberg); las plantillas están en `email/templates/` |

## Piezas transversales importantes
- **Edición activa:** `src/editions/active-edition.ts` (`findActiveEdition`, `requireActiveEdition`, `ACTIVE_EDITION_WHERE`, `assert*Writable`) y `list-edition.ts` (`resolveListEdition`). Una prueba (`active-edition.regression.spec.ts`) falla si alguien filtra la edición a mano. Ver `docs/editions.md`.
- **Validación de asignaciones:** `src/jurors/juror/assignment-validation/` (`assignment-rules.ts` con las reglas, servicio central, tipos). Reglas de [negocio](../01-negocio/reglas-de-negocio.md): bloqueos vs advertencias.
- **Bitácora de asignaciones:** `src/jurors/juror/assignment-audit` y modelo `JurorAssignmentAuditLog`.
- **Suplentes en lote:** `src/jurors/juror/substitute-assignment/` (subcarpeta del módulo `juror`, sin módulo propio): `POST /juror/assignments/substitutes/bulk` suma suplentes a los grupos de uno o varios jurados en una transacción, con bitácora y aviso de HU-22 (HU-09, ARK-215).
- **Evaluaciones que cuentan:** `src/evaluation/counted-evaluations.ts` (`MAX_COUNTED_EVALUATIONS = 3`, ordena por hora de envío) y `evaluation-progress.ts`.
- **Ranking:** `src/ranking/ranking.logic.ts` (lógica pura, sin BD) + `ranking.service.ts`.
- **Visibilidad/privacidad:** `common/utils/strip-personal-data.ts`, `omit-password.ts`, `opaque-user-key.ts`, `teams/team-visibility.ts` (BG-02, BG-06, BG-07).
- **Límites de peticiones:** `common/throttle/public-throttle.ts` ([cache-y-throttling](cache-y-throttling.md)).
- **Inventario de rutas:** `auth/route-inventory/route-inventory.ts` y `scripts/generate-route-inventory.ts`; prueba `route-access.spec.ts` (si existe en tu rama).

## Convenciones del código
- Nombres de columnas en español con `@map`, modelos en inglés (`Team` → `equipos`).
- Borrado lógico con `isActive` (campo `activo`); **no usar `onDelete: Cascade`** para usuarios/jurados/profesores.
- Archivos de menos de 500 líneas (regla del equipo; hay ≥9 que la incumplen: refactor F6 pendiente).
- Reglas de negocio nuevas llevan prueba unitaria junto al código.

## Módulos de producción que no estaban en la rama local (`origin/main`, 2026-11-05)
`src/` de producción tiene 40 entradas. Lo nuevo respecto a la rama de lectura:

| Módulo | Qué hace | Ticket |
|---|---|---|
| `jurors/juror/automatic-assignment/` | Asignación automática de jurados. `automatic-assignment.planner.ts` es una **función pura** (sin BD) que arma el plan; `.coverage.ts` calcula cobertura y alertas; `.service.ts` toma la foto de la edición y guarda al confirmar. Reglas: hasta 3 jurados por grupo; hasta 3 grupos por jurado, todos del mismo nivel; lo ya asignado es fijo (se puede volver a ejecutar y solo completa lo que falta); suplentes excluidos; colegios (N0) solo con seniors; nadie evalúa equipos de sus propios NRC (salvo N0); cada equipo universitario recibe al menos un senior si es posible; un jurado con grupos de varios niveles o sin categoría queda fuera y se reporta | HU-07 |
| `jurors/juror/assignment-validation/` | Reglas de coherencia (`assignment-rules.ts`, `findEvaluatorBlocker`, `hasNrcConflict`, `isSeniorEvaluator`) que usan tanto la asignación manual como la automática | HU-08 |
| `jurors/juror-attendance/` | `GET /juror-attendance`: asistencia de los jurados de la edición (`PRESENT` / `MISSING`), con hora, método y quién hizo el check-in; no devuelve correos ni códigos | HU-29 |
| `jurors/juror-edition/juror-edition-enroll.ts` | Inscribir a un profesor senior sin NRC como jurado de la edición, por correo | HU-28 |
| `jurors/juror-edition/import/` | Importar desde Excel los jurados de la edición activa: lectura del xlsx (`*.xlsx.ts`), reglas por fila (`*.logic.ts`), alta de cuentas con `JurorService.create`, confirmación en `jurado_edicion` y cola de correos con pausa (`*-mail.queue.ts`). Reemplaza a `import-previous` | HU-49 |
| `professors/professor-juror-profile.ts` | Un profesor creado desde el panel queda Senior y Oficial en la tabla de jurados | BG-26 |
| `teams/final-score-breakdown.ts` | El estudiante ve solo la nota general final de su grupo, sin desglose | HU-30 |
| `editions/list-edition.ts`, `settings/active-edition-config.ts` | Filtro por edición de las listas y configuración de la edición activa | HU-27, BG-18..23 |

`jurors/juror/juror.service.ts` se redujo (la lógica de asignación salió a sus propios archivos). Documento de cierre de edición: `docs/edition-closure.md` (resumen en [01-negocio/ediciones](../01-negocio/ediciones.md)).

## Servicios con más lógica
| Servicio | Tamaño | Notas |
|---|---|---|
| `auth/auth.service.ts` | ~1200 líneas | login, Entra ID, refresh con rotación, cookies, caché del perfil ([auth-y-sesiones](auth-y-sesiones.md)) |
| `email/email.service.ts` | ~730 líneas | envío por Azure ACS con reintentos, reenvíos de correo, certificados de jurados ([integraciones](integraciones.md)) |
| `ranking/ranking.service.ts` | ~570 líneas | ranking, empates, `finalize` ([evaluacion-y-ranking](evaluacion-y-ranking.md)) |
| `upload/azure-storage.service.ts` | ~245 líneas | subida a Blob, URLs firmadas (SAS), marcar público |
| `certificates/certificates.service.ts` | ~160 líneas | arma el HTML y lo convierte a PDF con Gotenberg |

> A CONFIRMAR: el detalle de lo que lanza cada servicio no se documentó servicio por servicio; los errores de negocio relevantes están en [endpoints](endpoints.md) y [evaluacion-y-ranking](evaluacion-y-ranking.md).
