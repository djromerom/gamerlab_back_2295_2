# Estructura objetivo y convenciones del frontend (TA-14)

> **Audiencia:** Frontend, revisores de PR · **Actualizado:** 2026-11-13 · **Estado:** propuesta a validar con el equipo y el profesor el 17-nov · **Fuente:** [diagnóstico](diagnostico-estructura.md) (TA-13, ARK-49). Ticket: ARK-50 (TA-14). Los movimientos se hacen en TA-15 (ARK-51) según el [mapa de movimientos](../06-referencia/mapa-de-movimientos-ark-51.md).

Este documento define **dónde va cada archivo y cómo se nombra**, para que alguien nuevo encuentre las cosas por su dominio y no por el equipo de V3 que las escribió. Resuelve los hallazgos H1, H4 y H5 del diagnóstico. Los hallazgos H2 y H3 (duplicación y pantallas gigantes) se resuelven después, con refactors que sí cambian código.

## Estructura

```
src/
├─ features/<dominio>/          todo lo de un dominio funcional
│   ├─ pages/                   pantallas que monta el router
│   ├─ components/              componentes que solo usa este dominio
│   ├─ hooks/                   hooks del dominio (useX.ts)
│   ├─ api/                     llamadas al back del dominio (usan lib/api.ts)
│   ├─ lib/                     lógica pura y utilidades del dominio
│   ├─ types/                   tipos del dominio
│   └─ contexts/                contextos que solo usa este dominio
├─ api/                         llamadas al back que usan dos o más dominios
├─ components/                  componentes compartidos entre dominios
│   └─ ui/                      primitivas de shadcn (generadas, no se editan a mano)
├─ hooks/  lib/  types/         compartidos; lib/api.ts es el cliente HTTP único
├─ contexts/                    contextos globales (Auth, Socket, TextSize, GlobalState)
├─ routes/                      router, ProtectedRoute, RegistrationGate
├─ layouts/                     layout de la aplicación, sidebar, navegación, breadcrumbs
└─ assets/  styles/  data/
```

Un dominio solo crea las subcarpetas que necesita. `fetchs/` y las carpetas `grupo N` desaparecen. El alias `@/` → `src/` no cambia, y tampoco los alias de shadcn en `components.json` (`@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`).

## Dominios

| Feature | Qué contiene | Sale principalmente de |
|---|---|---|
| `auth` | Login, recuperar y establecer contraseña, verificar cuenta, errores de acceso | `pages/grupo 9` |
| `home` | `/inicio`, el panel por rol | `pages/grupo 9/HomePage` |
| `academic` | NRC, materias, profesores, criterios, pesos de calificación | `grupo 9`, `fetchs/nrcs` |
| `teams` | Registro de equipo (asistente), gestión de equipos, equipo del estudiante, verificación de código, mis jurados | `grupo 11`, `grupo 9`, `grupo 5`, `pages/teams` |
| `games` | Galería de videojuegos, históricos, reproductor web, likes | `videogamePage/`, `pages/gameplayer`, `grupo 5` |
| `grading` | Calificar (normal, colegios, por lote), pendientes, calificados, borradores, seguimiento en tiempo real | `grupo 8`, `pages/RealtimeTrackingPanel` |
| `results` | Estadísticas, ranking, desempates, notas finales, panel del profesor | `grupo 1`, `grupo 5`, `grupo 9` |
| `editions` | Gestión de ediciones, configuración del evento, inscripciones | `admin/editions/`, `grupo 9` |
| `jurors/<sub>` | `assignment`, `management`, `attendance`, `presence`, `badges`, `survey`, `edition` | `grupo 12`, `jurados-modals/`, `pages/JuradosAssignment`, `staff/`, `juror-*`, `admin/juror-*` |
| `external-presenters` | Presentadores externos (admin y «mi registro») | `admin/external-presenters/`, `pages/external-presenter` |
| `public` | Landing, información, ferias pasadas, créditos, inscripción cerrada, 404 | `grupo 5`, `pages/` |
| `notifications`, `pwa`, `staff-accounts` | Push, instalación como app, cuentas de staff | `pages/`, `components/pwa`, `pages/admin` |

`jurors` es el único dominio con subdominios, porque tiene siete áreas con pantallas propias. Es el espejo de `src/jurors/` del back.

## ¿Dónde va mi archivo?

1. ¿Es una primitiva visual genérica (botón, diálogo, tabla base)? → `components/ui/` si viene de shadcn, si no `components/`.
2. ¿Lo usa un solo dominio? → `features/<dominio>/<tipo>/`, donde el tipo es `pages`, `components`, `hooks`, `api`, `lib`, `types` o `contexts`.
3. ¿Lo usan dos o más dominios? → la carpeta compartida de su tipo: `components/`, `hooks/`, `lib/`, `types/` o `api/`.
4. ¿Es navegación, layout o protección de rutas? → `layouts/` o `routes/`.
5. ¿No encaja en ningún dominio existente? → se propone un dominio nuevo en el PR y se agrega a la tabla de arriba en ese mismo PR.

Un dominio **puede** importar algo de otro dominio (por ejemplo, `grading` usa `features/teams/hooks/useTeamVerification`). Cuando un archivo pasa a usarse en **3 o más dominios**, contando el propio, **se sube a la carpeta compartida** en el mismo PR que agrega el tercer uso. Con el mapa de TA-15 quedan 17 imports entre dominios, todos entre dos dominios; lo que ya usaban tres o más (`api/editions`, `api/registrations`, `NavBar`, `DiscordButton`, `TeamCode`, `useCriteria`, `JurorPresenceNotice`, `JurorSurveyAccess`) queda en compartido desde el principio.

## Convenciones

| Qué | Regla | Ejemplo |
|---|---|---|
| Carpetas | kebab-case, en inglés, sin espacios | `external-presenters/`, `jurors/attendance/` |
| Componentes y páginas | `PascalCase.tsx`, en inglés; las páginas terminan en `Page` | `PastFairsPage.tsx`, `TeamsManagementTable.tsx` |
| Hooks | `useAlgo.ts` | `useWorkingEdition.ts` |
| API, lib y types | `camelCase.ts`, sustantivo del recurso | `api/jurorAttendance.ts`, `lib/batchRoute.ts` |
| Pruebas | `*.test.ts(x)` al lado del archivo probado | `NrcsTable.test.tsx` |
| Idioma | Identificadores y nombres de archivo en inglés; textos de la interfaz en español | — |
| URLs | **No cambian** al mover o renombrar archivos | `/ediciones-pasadas` sigue igual |

**Reglas de código:**
- **Una vista no llama al back.** Las páginas y los componentes no importan `apiFetch` ni leen `VITE_ENDPOINT_BACKEND`: usan una función de `features/<dominio>/api/` (o de `api/` si es compartida), que a su vez usa `lib/api.ts`. Resuelve H4. Las 35 vistas que hoy importan `apiFetch` se corrigen cuando se toquen; no son parte de TA-15.
- **Un solo cliente HTTP y un solo refresh de sesión:** `lib/api.ts`. No se escribe otro `fetch` con su propio manejo de 401 (H3).
- **Tamaño:** máximo 500 líneas por archivo (regla del equipo). Un archivo nuevo apunta a 400 o menos. Partir un archivo grande va en un PR propio, nunca dentro de una feature.
- **Duplicar una pantalla para una variante** (como `RatePage` y `SchoolRate`, H2) no se acepta en código nuevo: la variante se resuelve con props o con un hook compartido.

## Cómo se mantiene el orden

No hay un chequeo automático (decisión del 13-nov), así que el orden depende de cuatro hábitos.

**1. Checklist en cada PR.** Se copia en la descripción y se marca:

```markdown
### Estructura (docs/arkad/03-frontend/estructura-objetivo-y-convenciones.md)
- [ ] Cada archivo nuevo está donde dice «¿Dónde va mi archivo?»
- [ ] Nombres según la tabla de convenciones (sin espacios, PascalCase, inglés)
- [ ] Ningún archivo tocado pasa de 500 líneas (o el PR explica por qué)
- [ ] Ninguna página o componente importa `apiFetch` ni lee `VITE_ENDPOINT_BACKEND`
- [ ] Las pruebas nuevas están al lado de su archivo
```

**2. Criterio de revisión.** Un archivo nuevo fuera de lugar o mal nombrado es un comentario **bloqueante**, no un `nit:`. Es parte del paso «Código» de la revisión de PRs del equipo.

**3. Regla del boy scout, en PR aparte.** Quien necesite tocar un archivo que todavía está fuera de lugar lo mueve **en un PR previo y pequeño**, sin mezclarlo con la feature. Así el diff de la feature sigue siendo legible.

**4. Re-medición al cierre de cada sprint.** Se corren los comandos de la sección «Cómo se midió» del [diagnóstico](diagnostico-estructura.md) y se comparan con la línea base del 13-nov: archivos de más de 500 líneas, porcentaje duplicado, ciclos, vistas que llaman a la API. Si alguna cifra empeora, se abre un ticket en la épica ARK-11.

**Si la regla no aplica** a un caso real, se propone el cambio **por PR a este documento**. No se hace una excepción silenciosa.
