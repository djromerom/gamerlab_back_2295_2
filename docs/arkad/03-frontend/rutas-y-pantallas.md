# Rutas y pantallas por rol

> **Audiencia:** Frontend, QA · **Actualizado:** 2026-11-05 · **Estado:** completo para `RoutesConfiguration.tsx` de `origin/main` (`5b70d2e`) · **Fuente:** `src/routes/RoutesConfiguration.tsx`

Un solo router (`BrowserRouter`) con una lista `routes` de `{ path, element, roles? }`. Si `roles` está definido, la ruta va dentro de `ProtectedRoute`; si no, es pública. Mientras `AuthContext` carga, se muestra `LoadingScreen`. El rol `Consultor` es un resto sin uso (redirige a `/inicio`). **Staff** es el rol nuevo de V4.

## Públicas (sin sesión)
| Ruta | Pantalla |
|---|---|
| `/` | LandingPage |
| `/ranking` | RankingPage |
| `/informacion` | InformationPage |
| `/equipos` | VideogamesPage (galería) |
| `/ediciones-pasadas` y `/ediciones-pasadas/:editionId/juegos` | FeriasPasadas, HistoricalVideogamesPage |
| `/contribuidores` | CreditsPage |
| `/registro-equipo` | **RegistrationGate**: consulta si las inscripciones están abiertas y muestra `TeamRegisterPage` o `RegistrationClosedPage` |
| `/login`, `/OlvidastePassword`, `/establecer-contrasena`, `/verificar-cuenta` | Acceso y cuenta |
| `/play-game/:videogameID` | GamePlayerPage |
| `/unauthorized`, `/auth-error` | Errores |

## Por rol
| Rol | Rutas |
|---|---|
| **Todos con sesión** | `/inicio` (HomePage, con Staff incluido) |
| **Administrador** | `/estadisticas`, `/jurados`, `/jurados-assignment`, `/jurados-edicion` (jurados de la edición), `/escarapelas`, `/cuentas-staff`, `/gestionar-ediciones`, `/materias`, `/nrcs`, `/criterios`, `/profesores`, `/equipos-inscritos`, `/tiebreaker`, `/ponderado-calificaciones`, `/configuracion-evento` |
| **Administrador + Staff** | `/check-in-jurados`, `/asistencia-jurados` |
| **Administrador + Profesor** | `/profesor`, `/realtime-tracking-panel` (seguimiento) |
| **Profesor** | `/home-profesor`, `/colegios-calificar`, `/colegios-calificar/:id`, `/colegios-evaluados`, `/ranking/mis-empates` |
| **Profesor + Jurado** | `/calificar-lote` |
| **Profesor + Estudiante** | `/mi-equipo` |
| **Jurado** | `/pendientes-calificar`, `/pendientes-calificar/:id`, `/calificados`; `/jurado` redirige a `/inicio` |
| **Estudiante** | `/editar-equipo`, `/mis-jurados` |
| **Consultor** | `/consultor` → `/inicio` |

Hay una ruta `NotFoundPage` para URLs desconocidas.

## Reglas al agregar una pantalla
1. Añadirla a `routes` con sus `roles`.
2. Agregarla al **menú lateral** (`layouts/LayoutAplication.tsx`) según rol.
3. Si es un rol nuevo: añadirlo al tipo `Role` (aquí y en `types/auth.ts`), a la lista de rutas permitidas y a la pantalla de inicio; si no, el usuario verá «no autorizado» o un menú vacío.
4. El control real de permisos lo hace el **backend**; ocultar rutas en el front es solo UX.
5. Revisar a **360 px** de ancho (DoD).
6. Prueba en `RoutesConfiguration.test.tsx` si cambia el acceso.

## Nota de seguridad
`ProtectedRoute` guarda en el estado la ruta de origen (`state.from`) para volver tras el login; el cambio de usuario en el mismo navegador produjo «Acceso no autorizado» (BG-08): la ruta de origen se ignora si el rol no tiene permiso.
