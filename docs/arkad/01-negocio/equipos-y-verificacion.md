# Equipos, inscripción y verificación

> **Audiencia:** Backend, Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (reglas del backlog; falta documentar el flujo de registro paso a paso contra el código) · **Fuente:** backlog §2.2, HU-19, BG-09..BG-12, promoción del 4-nov

## Entidades
`Team` (código `N<nivel>-<MATERIA>-<n>`, p. ej. `N1-AYP-06`), `Member` (integrantes), `Subject` (materia), `NRC` (curso/sección con grupos participantes), `Videogame` (el juego del equipo), `TeamVerification` / `TeamVerificationLog`. Cada equipo tiene `fecha_registro` (se usa en el desempate), marca de **externo** y pertenece a una **edición**.

## Inscripción (registro de equipo)
Flujo en pasos del frontend: datos del equipo, integrantes (paso 2), juego (paso 3: logo, video, imágenes), revisión (paso 4). Reglas decididas/pendientes:
- Unicidad **por edición** de correo, código estudiantil, líder y nombre de equipo (en la BD desde ARK-128).
- Normalizar correos y nombres; validar antes de subir archivos para no dejar **archivos huérfanos** (BG-10).
- El logo no debe ser obligatorio para registrar (BG-09); archivo falso debe avisar (BG-12).
- Borrador del registro en `sessionStorage`, límite de tamaño, reCAPTCHA en español, NRC con materia (BG-11).
- Sin NRC cargados en la edición, nadie completa la inscripción (BG-23).
- Los estudiantes de una edición anterior se inscriben de nuevo (BG-17, HU-26).
- **NRC por materia (HU-31, ARK-167):** cada integrante elige una o varias materias y **un solo NRC por materia** (en tercer semestre se participa por dos: Estructura de Datos I y POO). Todos deben ser NRC activos de la edición del equipo. El back responde 400 con `field: "nrc"` si falta alguno («Estos NRC no existen en la edición activa: …») o si hay dos de la misma materia («Elige un solo NRC por materia: …»). La misma regla aplica cuando el administrador cambia los NRC. `GET /nrcs/select-options?includeSubjects=true` trae la abreviatura de la materia y el nombre del profesor para el selector de botones (opción A).

## Código de verificación (HU-19)
Código propio de cada equipo, visible en el **panel del estudiante**; el estudiante se lo da al jurado, que debe **digitarlo** para calificar ese grupo. **N0 (colegios) no tiene código** (P-25). Hay único `(codigo_verificacion, id_edicion)` y se generó para equipos existentes (migración `...add_team_verification_code`).

## NRC y profesores
- Cada NRC pertenece a una edición y a un profesor; el panel del profesor muestra solo la feria activa y sus NRC; el histórico global es una pestaña aparte (decisión 16, el Administrador exporta todos los NRC de la feria activa).
- Hay un único parcial `(codigo, id_edicion) WHERE activo` (decisión D).
- Bugs conocidos de la revisión del 30-oct (NRC sin filtrar por edición, filtros duplicados, listado vs exportación, falta único) → revisión de filtros.
- Borrado de profesor/jurado: **borrado lógico** (`isActive=false`); el correo queda reservado. Nunca `onDelete: Cascade`.
- Vínculos integrante-NRC cruzados (todos al NRC 38, código 9999, edición 3): limpieza decidida el 30-oct (rama 2), ejecutada por el usuario con respaldo.

## Qué puede editar el estudiante (BG-38)

Tabla de SP-05 (ARK-166), aprobada por Allison el 7-nov y aplicada en el back por ARK-161. El back responde **403** aunque el cambio llegue directo por la API, con la frase «Para cambiar este dato, escríbele al administrador».

| Campo | Quién lo edita | Hasta cuándo |
|---|---|---|
| Descripción, logo, video, repositorio, fotos, archivo y `entry` del juego | Líder y administrador | Líder: mientras las inscripciones estén abiertas (interruptor del administrador) |
| Nombre del equipo | Líder y administrador | Igual |
| Nombre del juego, estado de aprobación, externo | Administrador | Siempre |
| Integrantes (agregar o quitar), sus NRC, nombres, códigos y correos | Administrador | Siempre |

- Editar el contenido **no** devuelve el juego a PENDIENTE; cambiar el **logo** o el **nombre del equipo** sí, para que el administrador lo revise.
- Los NRC se eligen al inscribirse (selector de HU-31); después solo los cambia el administrador.
- Código: `src/teams/student-edit-policy.ts`.

## Videojuegos y multimedia
Aprobación de juego: conserva video e imágenes (error de V3 corregido). Likes con tope según multimedia. Juegos de Pygame, Unity y Godot en navegador: SP-03 (spike); navegadores soportados sin definir (P-23). Archivos en Azure Blob (Azurite en local); URLs firmadas de lectura con vigencia por defecto y máxima de 3 años (se guardan en BD; ver [integraciones](../02-backend/integraciones.md)); zip máx. 100 MB, 3 por 10 min (I5, I6). Las fotos de ediciones pasadas no se veían por archivos no públicos (BG-24).

## Flujo de registro de un equipo (leído del código, 2026-11-05)
1. `/registro-equipo` pasa por `RegistrationGate`: consulta `GET /settings/registrations` (pública) y muestra `TeamRegisterPage` si las inscripciones están abiertas, o `RegistrationClosedPage` si no.
2. `TeamRegisterPage` es un formulario por pasos (`MultiFormContext`); el borrador se guarda en `sessionStorage` (BG-11). Cada paso se valida antes de avanzar (BG-10).
3. El back ofrece validaciones previas: `POST /teams/validate-emails`, `POST /teams/validate-student-codes` y `GET /teams/leader/:email/status`; correo, código estudiantil, líder y nombre del equipo son únicos **por edición** (BG-17).
4. Los archivos (logo, imágenes, juego) se suben **solo cuando todo es válido** (BG-10) a `/upload`, y luego se crea el equipo con `POST /teams`. Sin logo es válido (BG-09). El registro público lleva reCAPTCHA y límites de peticiones.
5. Sin NRC cargados en la edición nadie completa la inscripción (por eso hay que cargarlos antes de abrir; BG-23 avisa si faltan).

## Código de verificación (HU-19, `team-verification`)
- Cada equipo universitario tiene un código; el estudiante lo ve con `GET /team-verification/my-code` y el administrador puede verlo o regenerarlo (`POST :teamId/regenerate`). **N0 (colegios) no tiene código**: pedirlo a un colegio responde 400.
- El jurado lo digita con `POST /team-verification/verify`. Solo se puede verificar un equipo **de la edición activa y asignado a ese jurado** (si no, 404/403).
- **Bloqueo:** al llegar a `MAX_FAILED_ATTEMPTS = 5` intentos fallidos recientes el jurado queda bloqueado un tiempo para ese grupo (`lockedUntil`); el control es atómico (candado de BD por equipo y jurado) para que peticiones en paralelo no se pasen del límite.
- Calificar un grupo sin verificarlo falla con 403 (`assertVerified`); `GET /team-verification/status` indica qué grupos ya verificó el jurado.
