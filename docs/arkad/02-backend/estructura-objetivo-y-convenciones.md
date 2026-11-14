# Estructura objetivo y convenciones del backend (TA-14)

> **Audiencia:** Backend, revisores de PR · **Actualizado:** 2026-11-13 · **Estado:** decidido por el equipo el 13-nov; se presenta al profesor el 17-nov · **Fuente:** [diagnóstico](diagnostico-estructura.md) (TA-13, ARK-49). Ticket: ARK-50 (TA-14). Los movimientos se hacen en TA-15 (ARK-51) según el [mapa de movimientos](../06-referencia/mapa-de-movimientos-ark-51.md).

El backend ya sigue en casi todo el patrón de NestJS: un módulo por dominio, con DTOs y pruebas al lado. Este documento **conserva ese patrón**, le agrega una regla para agrupar dominios grandes (primer caso: jurados) y fija las convenciones que hoy varían de un módulo a otro.

## Estructura

```
src/
├─ <módulo>/                       un módulo Nest por dominio
│   ├─ <módulo>.module.ts
│   ├─ <módulo>.controller.ts       (o controllers/ si hay más de uno)
│   ├─ <módulo>.service.ts          (o services/ si hay más de uno)
│   ├─ <tema>.logic.ts              lógica pura, sin Prisma ni Nest, con su spec
│   ├─ <subdominio>/                archivos de una parte del módulo (sin *.module.ts propio)
│   ├─ dto/                         DTOs con class-validator
│   ├─ types/                       tipos e interfaces del módulo
│   └─ *.spec.ts                    al lado del archivo que prueban
├─ <dominio>/<módulo>/             cuando 3 o más módulos comparten dominio (hoy: jurors/)
├─ auth/                           guards, decoradores de permisos, estrategias
├─ common/                         decoradores, throttle, utilidades y DTOs transversales
├─ prisma/  cache/                 infraestructura
└─ main.ts  app.module.ts
test/                              e2e (*.e2e-spec.ts)
```

**Agrupar módulos por dominio.** Cuando 3 o más módulos son parte del mismo dominio, se agrupan en `src/<dominio en plural>/`. **Cada módulo conserva el nombre de su carpeta y de sus archivos** dentro del grupo: `src/juror-attendance/` pasa a `src/jurors/juror-attendance/` y su `juror-attendance.module.ts` no cambia de nombre. Así la búsqueda por nombre de archivo encuentra lo mismo de antes. Los imports entre módulos hermanos del grupo siguen la regla general de imports: hacia otro módulo, `src/...` (TA-15 convierte los 42 relativos que hay hoy).

**Primer grupo: `src/jurors/`** (se crea en TA-15):

| Módulo | Archivos (specs) | Qué hace |
|---|---|---|
| `juror` | 44 (20) | Jurados, asignación manual y automática, validación y auditoría de asignaciones |
| `juror-edition` | 20 (8) | Jurados inscritos por edición |
| `absence-alert` | 12 (4) | Alertas de inasistencia de jurados |
| `juror-presence` | 10 (3) | Presencia de jurados durante la feria |
| `juror-attendance` | 9 (3) | Asistencia (staff) |
| `juror-badges` | 8 (2) | Escarapelas |
| `juror-survey` | 8 (2) | Encuesta a jurados |
| `absent-juror-responses` | 6 (2) | Respuestas de jurados ausentes |
| `juror-checkin` | 5 (1) | Check-in con QR |

El resto de dominios queda como está: ninguno tiene hoy 3 o más módulos que lo justifiquen. Equipos (`teams`, `team-verification`, `students`, `videogames`, `pending-games`, `graded-games`, `highlighted-games`) es el siguiente candidato y se evalúa después de la feria.

## Mapa de dominios

| Dominio | Módulos |
|---|---|
| Jurados | `src/jurors/*` (tabla de arriba) |
| Equipos y estudiantes | `teams`, `team-verification`, `students`, `videogames`, `pending-games`, `graded-games`, `highlighted-games` |
| Evaluación y notas | `evaluation`, `evaluation-tracking`, `final-grade`, `ranking`, `criterion` |
| Académico | `professors`, `nrcs`, `subjects`, `educational-focuses` |
| Edición y feria | `editions`, `historicals`, `testimonials`, `settings`, `external-presenters`, `certificates` |
| Transversal | `auth`, `common`, `prisma`, `cache`, `email`, `upload`, `push-notifications`, `reports`, `staff` |

## ¿Dónde va mi archivo?

1. ¿Es un endpoint, servicio o DTO de un dominio existente? → dentro de ese módulo, con los nombres de la tabla de convenciones.
2. ¿Es lógica pura (cálculos, reglas, validaciones sin BD)? → `<tema>.logic.ts` en el módulo, con su `<tema>.logic.spec.ts` al lado.
3. ¿Lo usan varios módulos y no es de ningún dominio (decorador, pipe, utilidad)? → `common/`. Si tiene que ver con permisos, va a `auth/`.
4. ¿Es un dominio nuevo? → un módulo nuevo en `src/<módulo>/`, registrado en `app.module.ts`. Si con él un dominio llega a 3 módulos, se agrupan en `src/<dominio>/`.
5. ¿Es una prueba e2e (levanta la app completa)? → `test/`. Si es unitaria o de BD, va al lado del archivo, como `*.spec.ts` o `*.db.spec.ts`.

## Convenciones

| Qué | Regla | Ejemplo |
|---|---|---|
| Carpetas de módulo | kebab-case, en inglés, igual al nombre del módulo | `juror-presence/` |
| Archivos Nest | `<módulo>.<tipo>.ts`, con el nombre completo del módulo (sin abreviar) | `graded-games.service.ts`, no `gg.service.ts` |
| Clases | `PascalCase` con el nombre del módulo; dos módulos no comparten nombre de clase | `PendingGamesService`, no un segundo `VideogamesService` |
| Lógica pura | `<tema>.logic.ts` para archivos nuevos (los existentes, como `score-rules.ts` o `automatic-assignment.planner.ts`, no se renombran en masa) | `final-grade.logic.ts` |
| DTOs | En `dto/`, `<acción>-<recurso>.dto.ts` | `dto/create-upload.dto.ts` |
| Pruebas | `*.spec.ts` al lado; `*.db.spec.ts` si usan BD real; e2e en `test/` | `ranking.logic.spec.ts` |
| Idioma | Identificadores en inglés; mensajes al usuario en español | — |
| Imports | Relativos dentro del módulo; `src/...` para importar **otro** módulo, también si es un módulo hermano dentro de un grupo (`src/jurors/...`), así mover un módulo no rompe a quien lo usa. Las excepciones son `app.module.ts` y `main.ts`, que importan con `./`. Hoy 796 imports entre módulos son relativos y 106 usan `src/`: no se reescriben en masa, solo en código nuevo y en los archivos que mueva TA-15 | `import { X } from 'src/teams/...'` |

**Reglas de código:**
- **Capas.** El controlador valida la entrada y delega; el servicio tiene las reglas de negocio; el repositorio, si existe, **solo accede a datos**: sin `HttpException` ni reglas (H3).
- **Errores.** Un error que ve el cliente es una `HttpException` de Nest (`BadRequestException`, `ConflictException`…) con mensaje en español. Nunca `throw new Error(...)` para un caso de negocio, porque llega como 500.
- **Repositorios.** Solo se agrega `repositories/` si el acceso a datos del servicio pasa de unas 300 líneas. Hoy solo lo tiene `teams`.
- **Subcarpetas por capa** (`controllers/`, `services/`): solo si el módulo tiene más de un archivo de esa capa (hoy `teams` y `editions`).
- **Tamaño.** Máximo 500 líneas por archivo (regla del equipo). Un archivo nuevo apunta a 400 o menos. Partir un archivo grande va en un PR propio, nunca dentro de una feature. Los controladores pueden pasar de 400 líneas solo por los decoradores de Swagger: los ejemplos largos van en `<módulo>.swagger-examples.ts`, como ya hace `professors`.
- **Dependencias circulares** entre módulos: no se agregan nuevas. El `forwardRef` entre `email` y `certificates` (H6) se conserva hasta que se rediseñe.

## Fuera de TA-15 (refactors con cambio de código)

Quedan como recomendación, con el hallazgo que los motiva. No se hacen antes de la feria:
- **H2:** partir los cinco archivos de más de 1100 líneas (`team.repository.ts`, `professors.service.ts`, `auth.service.ts`, `juror.service.ts`, `juror-assignment.service.ts`), cada uno en su PR y con sus pruebas pasando antes y después.
- **H3:** mover las reglas de negocio de `team.repository.ts` a `teams.service.ts` y cambiar los `throw new Error` por excepciones de Nest.
- **H7:** extraer las consultas repetidas de `reports.service.ts` y unificar los DTOs de filtros por edición.

## Cómo se mantiene el orden

No hay un chequeo automático (decisión del 13-nov), así que el orden depende de cuatro hábitos.

**1. Checklist en cada PR.** Se copia en la descripción y se marca:

```markdown
### Estructura (docs/arkad/02-backend/estructura-objetivo-y-convenciones.md)
- [ ] Cada archivo nuevo está donde dice «¿Dónde va mi archivo?»
- [ ] Nombres según la tabla de convenciones (módulo completo, sin abreviar)
- [ ] Ningún archivo tocado pasa de 500 líneas (o el PR explica por qué)
- [ ] Las reglas de negocio están en el servicio y los errores al cliente son HttpException
- [ ] Las pruebas nuevas están al lado de su archivo (e2e en test/)
```

**2. Criterio de revisión.** Un archivo nuevo fuera de lugar o mal nombrado es un comentario **bloqueante**, no un `nit:`. Es parte del paso «Código» de la revisión de PRs del equipo.

**3. Regla del boy scout, en PR aparte.** Quien necesite tocar un archivo que todavía está fuera de lugar lo mueve **en un PR previo y pequeño**, sin mezclarlo con la feature.

**4. Re-medición al cierre de cada sprint.** Se corren los comandos de la sección «Cómo se midió» del [diagnóstico](diagnostico-estructura.md) y se comparan con la línea base del 13-nov: archivos de más de 500 líneas, código sin uso, porcentaje duplicado, ciclos. Si alguna cifra empeora, se abre un ticket en la épica ARK-11.

**Si la regla no aplica** a un caso real, se propone el cambio **por PR a este documento**. No se hace una excepción silenciosa.
