# Jurados

> **Audiencia:** Backend, Frontend, Scrum · **Actualizado:** 2026-11-05 · **Estado:** completo (según backlog; ver tickets para el estado de implementación) · **Fuente:** backlog §2.1, §9.4, §10

## Quién es quién
- **Profesor:** rol Profesor; sube notas por NRC y también califica; su nota se guarda como **senior**.
- **Jurado:** rol Jurado. Un profesor que solo participa como jurado conserva el rol Jurado con categoría Senior y **no tiene NRC**.
- **Suplente** (antes «remanente»): jurado de reserva que cubre a quien no llega. Desde el 4-nov la UI usa solo «suplente» (BG-29); en el código sigue como `BACKUP`.
- **Staff:** personal de la mesa de escarapelas; escanea el QR. No califica ni administra. Rol nuevo (HU-11).

## Las dos etiquetas del jurado
| Etiqueta | Valores | Efecto |
|---|---|---|
| **Categoría** | Junior, Senior | Peso de su nota; junior no califica colegios. **Senior = solo profesores** (P-07) |
| **Tipo** | Oficial, Remanente (suplente) | Cubre grupos desde el inicio o queda de reserva |

Independientes del rol. Un suplente también es junior o senior (al reemplazar cambia el peso de la nota; por eso HU-14 sugiere suplentes de la misma categoría). Un profesor creado desde el panel queda **Senior y Oficial** (BG-26).

## Jurados por edición (HU-25)
- Todo profesor con al menos un NRC activo en la edición es jurado de esa edición, **sin confirmación y sin poder declinar**.
- Los jurados externos se traen de la edición anterior como **Pendientes** y el administrador confirma a los que vienen. Los NRC se cargan siempre primero.
- Excepción (HU-28): profesores senior **sin NRC** se agregan a «Jurados de la edición» por correo.
- La lista de asignación es siempre la de la edición (`jurorsOfEdition`, BG-25). Escarapelas y check-in solo para los elegibles de la edición (BG-16).
- El Excel de asignación (HU-16, `GET /reports/exportJurados`) trae solo a los jurados de la edición exportada (`jurorsOfEdition`, BG-40): Pendientes, los que Declinaron y los de otras ediciones no salen, aunque tengan grupos. La columna **Estado** es la de la edición («Confirmado» o «Profesor con NRC») y **Tipo** es el de la edición (`jurado_edicion.tipo`; el profesor con NRC, sin fila, usa el de su cuenta).
- Tabla `jurado_edicion` (modelo `JurorEdition`); estado de confirmación por edición.

## Flujo del día de la feria
1. **Antes:** asignación automática (HU-07, validada por HU-08) entre el 23 y 24-nov; escarapelas con QR el 25 (HU-10).
2. **8:00** check-in por QR o buscando por nombre (HU-11; sin modo offline, P-20).
3. **10:00** alerta informativa de jurados sin check-in (HU-12; la ven admin y profesores en solo lectura). Los profesores contactan a los ausentes y el equipo registra la respuesta (HU-13).
4. **11:00** control definitivo: el sistema **sugiere** suplentes y el administrador acepta, rechaza o asigna a mano; lo asignado **se suma** (nadie pierde grupos, aunque el jurado llegue tarde) (HU-14, HU-09).
5. **Durante:** pregunta de presencia cada hora (HU-23); seguimiento por hora de evaluaciones por grupo (HU-21).
6. **Jurado de último momento** (HU-24): lo da de alta solo el administrador; es **Junior y Suplente**, sin escarapela ni QR; la asignación automática elige un solo nivel (el de más faltantes), excluye colegios, tope 3 grupos y muestra la lista antes de asignar.
7. **Cierre ~12:00:** nota final liberada por el administrador (HU-20); encuesta opcional al jurado (HU-17).

## Aviso al suplente (HU-22)
- Cuando el administrador asigna grupos a un **suplente** (tipo `BACKUP` confirmado en la edición; asignar o reasignar a mano), se registra el aviso «Te asignaron grupos» con los grupos y su nivel. A los oficiales y a los profesores no se les avisa; la asignación automática no carga a los suplentes. Quitar grupos no crea ni borra avisos.
- El aviso queda en la plataforma hasta que el suplente lo marca como leído (el front consulta cada 10 s). También sale un correo por Azure ACS con su nombre, los grupos y a dónde ir, sin datos de otras personas. Si el correo falla, queda registrado y el aviso sigue activo; la asignación nunca falla por el correo.
- El panel de seguimiento puede mostrar quién no ha leído el aviso (`GET /substitute-notices/unread`). El «Entendido» del texto explicativo lo guarda el front, no el backend.

## Calificar un grupo
- El jurado debe digitar el **código de verificación** del grupo (lo ve el estudiante) para calificar; N0 no lo lleva (HU-19, P-25).
- Quién puede calificar (decisión U1 del 30-oct): actor asignado al grupo, o Profesor dueño de un NRC del equipo en su edición; N0 exige además senior; el juego debe ser de la edición activa.
- Lote: `evaluations` de 1 a 50 filas; escritura todo o nada (U2).

## Asignación automática y manual
Reglas en [reglas-de-negocio §5](reglas-de-negocio.md). Existe bitácora de cambios (`JurorAssignmentAuditLog`). «Quitar todas las asignaciones» debe afectar solo la edición activa (BG-20).

## Panel de seguimiento
Se actualiza cada 10 s. Lo ven Administrador y, en solo lectura, profesores senior (P-16, P-26). Asistencia visible también para Staff en solo lectura (HU-29).

> PENDIENTE: confirmar en producción qué jurados figuran hoy como senior sin ser profesores (subtarea de HU-07) y qué tickets de esta lista ya están mergeados (ver [backlog-y-epicas](../05-scrum-y-proceso/backlog-y-epicas.md)).
