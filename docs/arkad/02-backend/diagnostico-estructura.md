# Diagnóstico de la estructura del backend (TA-13)

> **Audiencia:** Backend, Scrum · **Actualizado:** 2026-11-13 · **Estado:** completo · **Fuente:** `origin/dev` en `a564190` (13-nov), medido con los comandos de abajo. Ticket: ARK-49 (TA-13). Insumo de la [estructura objetivo y convenciones](estructura-objetivo-y-convenciones.md) (TA-14, ARK-50).

Este documento dice **qué hay y qué estorba**, no cómo se arregla: la propuesta va en TA-14 y los movimientos de archivos en TA-15 (ARK-51). Nada de lo que aparece aquí se cambió al escribirlo.

## Cómo se midió

| Qué | Comando (desde la raíz del repo, sin agregar dependencias) |
|---|---|
| Tamaño por carpeta y archivos grandes | `find src -name '*.ts' -exec wc -l {} +` |
| Archivos y exports sin uso | `npx --yes knip@5 --reporter compact` |
| Código duplicado (sin specs) | `npx --yes jscpd@4 src --min-lines 15 --ignore "**/*.spec.ts"` |
| Dependencias circulares | `npx --yes madge@8 --circular --extensions ts src` |

Todo candidato a «sin uso» se confirmó con `git grep` del nombre antes de listarlo.

## Mapa actual

`src/` tiene **41 carpetas** de primer nivel, **546 archivos `.ts`** (204 son `*.spec.ts`) y **72 167 líneas**. Las e2e están aparte, en `test/` (16 archivos). Cada carpeta de dominio es un módulo Nest con `<dominio>.module|controller|service.ts`, `dto/` y specs al lado del archivo probado; ese patrón se cumple en casi todo el repo y es la base de la propuesta.

| Grupo | Carpetas | Archivos / líneas |
|---|---|---|
| Jurados | `juror` (con `assignment-audit/`, `assignment-validation/`, `automatic-assignment/`), `juror-attendance`, `juror-badges`, `juror-checkin`, `juror-edition`, `juror-presence`, `juror-survey`, `absent-juror-responses`, `absence-alert` | 122 / 20 658 |
| Equipos y estudiantes | `teams`, `team-verification`, `students`, `members`, `videogames`, `pending-games`, `graded-games`, `highlighted-games` | 111 / 12 518 |
| Evaluación y notas | `evaluation` (con `drafts/`), `evaluation-tracking`, `final-grade`, `ranking`, `criterion` | 55 / 8 283 |
| Académico | `professors`, `nrcs`, `subjects`, `educational-focuses` | 55 / 8 397 |
| Edición y feria | `editions`, `historicals`, `testimonials`, `settings`, `external-presenters`, `certificates` | 73 / 7 973 |
| Transversal | `auth`, `common`, `prisma`, `cache`, `email`, `upload`, `push-notifications`, `reports`, `staff`, `templates` | 124 / 13 865 |
| Raíz de `src/` | `main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts` y dos specs | 6 / 473 |

## Archivos de más de 500 líneas

| Código (11) | Líneas | | Pruebas (7) | Líneas |
|---|---|---|---|---|
| `teams/repositories/team.repository.ts` | 1315 | | `juror/assignment-audit/juror-assignment.service.spec.ts` | 1071 |
| `professors/professors.service.ts` | 1313 | | `evaluation/evaluation.service.spec.ts` | 1063 |
| `auth/auth.service.ts` | 1284 | | `juror/juror.service.spec.ts` | 1014 |
| `juror/juror.service.ts` | 1172 | | `professors/grading-games.service.spec.ts` | 853 |
| `juror/assignment-audit/juror-assignment.service.ts` | 1114 | | `auth/auth.service.spec.ts` | 712 |
| `teams/services/teams.service.ts` | 872 | | `juror/assignment-validation/assignment-rules.spec.ts` | 574 |
| `reports/reports.service.ts` | 871 | | `team-verification/team-verification.service.spec.ts` | 526 |
| `email/email.service.ts` | 696 | | | |
| `evaluation/evaluation.service.ts` | 661 | | | |
| `ranking/ranking.service.ts` | 569 | | | |
| `professors/professors.controller.ts` | 518 | | | |

El ticket hablaba de 9 archivos y un máximo de 2162 líneas: el repo cambió desde entonces y aquí vale lo medido el 13-nov. Los controladores grandes **no** tienen lógica: `professors.controller.ts` dedica 211 de sus 518 líneas a decoradores de Swagger, y ningún controlador usa Prisma directamente.

## Hallazgos priorizados

Prioridad = cuánto frena a alguien nuevo × cuántos archivos toca.

**H1. El dominio de jurados está repartido en 9 carpetas hermanas y 3 subcarpetas sin módulo propio.** Quien busca «jurados» encuentra `juror/`, `juror-edition/`, `juror-presence/`, `juror-checkin/`, `juror-attendance/`, `juror-badges/`, `juror-survey/`, `absent-juror-responses/` y `absence-alert/`, sin un criterio que diga qué va en cada una. Además, `juror/` (44 archivos, 11 141 líneas) tiene `assignment-audit/`, `assignment-validation/` y `automatic-assignment/` como subcarpetas que **no** son módulos (ningún `*.module.ts` anidado en todo `src/`), mientras que las otras ocho sí lo son.

**H2. Cinco archivos superan las 1100 líneas y concentran la lógica más delicada.** Son `team.repository.ts`, `professors.service.ts`, `auth.service.ts`, `juror.service.ts` y `juror-assignment.service.ts`. Revisar un PR que los toca obliga a leer cientos de líneas ajenas al cambio. Partirlos es un refactor con riesgo de comportamiento: **no** entra en TA-15, que solo mueve archivos.

**H3. `teams` es el único módulo con capa de repositorio, y esa capa decide reglas de negocio.** `teams/` usa `controllers/`, `services/`, `repositories/` e `interfaces/`; `editions/` usa solo `controllers/`; el resto usa archivos planos. `team.repository.ts` tiene 28 `throw`, entre ellos reglas de negocio (`ConflictException('El nombre del equipo ya está en uso')`, línea 539) y `Error` genéricos que el cliente recibe como 500 (`throw new Error('Email already in use')`, línea 651). Los mensajes mezclan español e inglés en el mismo archivo.

**H4. Código muerto confirmado.**

| Ruta | Por qué |
|---|---|
| `src/members/members.module.ts`, `.controller.ts`, `.service.ts`, sus dos specs y `dto/create-member.dto.ts` | `MembersModule` no se importa en `app.module.ts` ni en otro módulo: sus rutas no existen en la API (ya anotado en [endpoints](endpoints.md)). **Ojo:** `members/dto/update-member.dto.ts` sí está vivo: lo usan `teams/dto/update-team.dto.ts`, `teams/interfaces/team-repository.interface.ts`, `teams/repositories/team.repository.ts` y una spec; se muda a `teams/dto/` antes de borrar el resto |
| `src/pending-games/dto/create-videogame.dto.ts`, `update-videogame.dto.ts` | Nadie los importa; se usan los de `src/videogames/dto/` |
| `src/students/dto/update-member.dto.ts` | Nadie lo importa; tiene el mismo nombre de clase que `members/dto/update-member.dto.ts` con otro contenido |
| `src/templates/email/account-verification.html` | Sin referencias; las plantillas vivas son `src/email/templates/*.hbs` |

Dudosos (no se tocan sin preguntar): `prisma/seed-test-juror.ts` (script manual de datos de prueba, sin referencias) y `scripts/migrate-blob-references.ts` (migración puntual, citada en comentarios y en `.env.example`). Los 36 exports y 22 tipos que `knip` marca sin uso son sobre todo constantes exportadas para pruebas: no se clasificaron uno por uno.

**H5. Los nombres no siguen una sola regla.**
- Abreviaturas: `graded-games/gg.controller|module|service.ts` y `pending-games/pg.*`, cuando todo el resto usa el nombre del dominio.
- La lógica pura extraída de los servicios (una buena práctica que ya está en decenas de archivos) se nombra de tres formas: `final-grade.logic.ts`, `automatic-assignment.planner.ts` o sin sufijo (`score-rules.ts`, `team-status.ts`, `fair-schedule.ts`).
- Hay un DTO fuera de `dto/` (`upload/create-upload.dto.ts`) y `.spec.ts` sueltos en la raíz de `src/` (`public-routes-personal-data.spec.ts`).

**H6. Dependencia circular `email` ↔ `certificates`.** Está resuelta con `forwardRef` en ambos módulos, así que funciona, pero cualquier movimiento de esos módulos tiene que conservar los dos `forwardRef`.

**H7. Duplicación baja.** Solo el 1,1 % del TypeScript (344 líneas en 17 clones). Lo más repetido está dentro de un mismo archivo: `reports/reports.service.ts` repite bloques de consulta (líneas 80–113 y 720–754, y 164–193 y 802–831). También se repiten los DTOs de filtros por edición (`list-attendance-query.dto.ts`, `list-edition-jurors-query.dto.ts`, `list-edition-students-query.dto.ts`) y algo de `gg.service.ts` contra `pg.service.ts`. No es prioridad.

## Lo que está bien y conviene conservar
- Un módulo Nest por dominio con `dto/` y specs al lado del código (204 specs en `src/`).
- Controladores delgados: la lógica está en servicios y en archivos de reglas puras con su propia prueba.
- `common/` para piezas transversales (decoradores, throttle, utilidades) y `auth/` como único dueño de guards y decoradores de permisos.
