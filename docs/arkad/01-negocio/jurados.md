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
2. **8:00** check-in por QR o buscando por nombre (HU-11; sin modo offline, P-20). Si una llegada se registró por error (otro jurado, el QR vecino), **solo el administrador** la anula desde la asistencia (BG-49): el jurado vuelve a «Sin check-in» en la asistencia, la alerta de inasistencia, la presencia y la contingencia, y queda registro de quién la anuló, cuándo y por qué. El Staff no puede anular. Después se puede registrar la llegada correcta.
3. **10:00** alerta informativa de jurados sin check-in (HU-12; la ven admin y profesores en solo lectura). Los profesores contactan a los ausentes y el equipo registra la respuesta (HU-13).
4. **11:00** control definitivo: el sistema **sugiere** suplentes y el administrador acepta, rechaza o asigna a mano; lo asignado **se suma** (nadie pierde grupos, aunque el jurado llegue tarde) (HU-14, HU-09).
5. **Durante:** pregunta de presencia cada hora (HU-23); seguimiento por hora de evaluaciones por grupo (HU-21).
6. **Jurado de último momento** (HU-24): lo da de alta solo el administrador; es **Junior y Suplente**, sin escarapela ni QR; la asignación automática elige un solo nivel (el de más faltantes), excluye colegios, tope 3 grupos y muestra la lista antes de asignar.
7. **Cierre ~12:00:** nota final liberada por el administrador (HU-20); encuesta opcional al jurado (HU-17).

## Aviso al suplente (HU-22)
- Cuando el administrador asigna grupos a un **suplente** (tipo `BACKUP` confirmado en la edición; asignar o reasignar a mano, o en lote con HU-09), se registra el aviso «Te asignaron grupos» con los grupos y su nivel. A los oficiales y a los profesores no se les avisa; la asignación automática no carga a los suplentes. Quitar grupos no crea ni borra avisos.
- El aviso queda en la plataforma hasta que el suplente lo marca como leído (el front consulta cada 10 s). También sale un correo por Azure ACS con su nombre, los grupos y a dónde ir, sin datos de otras personas. Si el correo falla, queda registrado y el aviso sigue activo; la asignación nunca falla por el correo.
- El panel de seguimiento puede mostrar quién no ha leído el aviso (`GET /substitute-notices/unread`). El «Entendido» del texto explicativo lo guarda el front, no el backend.

## Suplentes en lote (HU-09)
- El administrador elige uno o varios jurados (los que no llegaron) y uno o varios suplentes, y en **una sola operación** cada suplente queda asignado a **todos** los grupos que esos jurados tienen en la edición activa (`POST /juror/assignments/substitutes/bulk`, ARK-215).
- **Se suma, no se quita:** los jurados originales conservan sus grupos y sus evaluaciones; un grupo puede quedar con más de 3 jurados (solo cuentan las 3 primeras evaluaciones, P-10). Si el suplente ya estaba en un grupo, ese grupo se omite sin error; repetir la operación no duplica nada.
- Solo se aceptan suplentes de verdad: rol Jurado, cuenta activa y tipo Suplente **confirmado** en la edición activa. Si uno no lo es, no se asigna nada. Un mismo usuario no puede venir como jurado a cubrir y como suplente.
- Los grupos sin confirmar o no calificables no reciben jurados (BG-35, HU-39): se omiten y se informan. Un jurado sin grupos en la edición activa se informa; si ninguno tiene grupos asignables, la operación responde error y no cambia nada.
- Se aplican las reglas de HU-08 a todos los pares nuevos juntos: un bloqueo (por ejemplo, suplente junior y un grupo de colegios) frena toda la operación; las advertencias (más de 3 grupos, niveles distintos, NRC) se muestran y piden confirmación antes de guardar.
- Todo va en una transacción: cada par queda en la bitácora (acción `ASSIGN`, nota «Suplente en lote desde módulo admin (HU-09).» con los jurados cubiertos) y cada suplente recibe **un** aviso de HU-22 con todos sus grupos nuevos. Si algo falla a mitad, se revierte todo y ninguna asignación cambia. Contrato para el front: `docs/frontend/HU-09-suplentes-en-lote.md`.

## Jurado de último momento (HU-24)
Para quien llega a la feria sin estar registrado. Lo hace **solo el Administrador** (`POST /walk-in-jurors`); el Staff no tiene el permiso.
- Pide nombre, apellido y correo. El jurado queda siempre **Junior y Suplente**, Confirmado en la edición activa, con la marca «alta el día de la feria» y con su **llegada registrada** a mano. No tiene escarapela ni QR.
- Cuenta, inscripción y llegada se guardan juntas o no se guarda nada. El correo para crear la contraseña sale después; si falla, el jurado queda creado y se reenvía desde Personal → Jurados.
- **Correo repetido:** no se crea nada y no se cambia a la persona que ya existe (conserva su tipo y sus grupos). Si es jurado de la edición se le marca la llegada por nombre (HU-11); si es profesor, no se crea como jurado.
- **Nombre parecido** (sin tildes ni mayúsculas) entre jurados y profesores: el sistema muestra las coincidencias y el Administrador decide si usa la persona que existe o confirma el alta.
- **Asignar grupos automáticamente:** para cualquier Suplente Junior confirmado de la edición. Propone grupos de **un solo nivel**: el que suma más jurados faltantes (cada grupo necesita 3); si empatan, el de más grupos con faltantes y luego el nivel más bajo. Excluye colegios, equipos sin confirmar o no calificables y los que el suplente ya tiene. Dentro del nivel van primero los grupos a los que más jurados les faltan, hasta 3 (parámetro `maxTeams`); si hay menos, no completa con otro nivel. Antes de la hora de control (11:00) cuentan los jurados asignados; desde ella, los presentes (con llegada o que ya evaluaron ese grupo). El administrador confirma o edita la lista; la asignación **suma sin quitar**, pasa por las reglas de HU-08, queda en la bitácora y el suplente recibe el aviso de HU-22.

## Calificar un grupo
- El jurado debe digitar el **código de verificación** del grupo (lo ve el estudiante) para calificar; N0 no lo lleva (HU-19, P-25).
- Quién puede calificar (decisión U1 del 30-oct): actor asignado al grupo, o Profesor dueño de un NRC del equipo en su edición; N0 exige además senior; el juego debe ser de la edición activa.
- Lote: `evaluations` de 1 a 50 filas; escritura todo o nada (U2).

## Asignación automática y manual
Reglas en [reglas-de-negocio §5](reglas-de-negocio.md). Existe bitácora de cambios (`JurorAssignmentAuditLog`). «Quitar todas las asignaciones» debe afectar solo la edición activa (BG-20).

## Panel de seguimiento
Se actualiza cada 10 s. Lo ven Administrador y, en solo lectura, profesores senior (P-16, P-26). Asistencia visible también para Staff en solo lectura (HU-29).

> PENDIENTE: confirmar en producción qué jurados figuran hoy como senior sin ser profesores (subtarea de HU-07) y qué tickets de esta lista ya están mergeados (ver [backlog-y-epicas](../05-scrum-y-proceso/backlog-y-epicas.md)).
