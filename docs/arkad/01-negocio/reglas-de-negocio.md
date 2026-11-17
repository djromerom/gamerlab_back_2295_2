# Reglas de negocio

> **Audiencia:** todos · **Actualizado:** 2026-11-07 · **Estado:** completo (P-02 cerrada el 6-nov; HU-34 y HU-33 en implementación) · **Fuente:** `ARKAD_v4_plan_y_backlog.md` §1.1, §2.2, §4.2, §10.3. Las reglas "vigentes" son las decididas; donde el código aún no las cumple se indica el ticket.

## 1. Calendario de la feria
- **Feria:** 26-nov-2026, 8:00 a ~12:00.
- **Inscripción de grupos:** 2 al 22 de noviembre. Es un calendario **informativo**: el sistema no bloquea inscripciones fuera de esas fechas.
- **Asignación definitiva de jurados:** 23 o 24 de noviembre. Escarapelas el 25.
- **Cronograma del día (parámetros configurables):** inicio 8:00 · alerta informativa 10:00 · control definitivo 11:00 · cierre ~12:00.
- Detalle operativo: [05-scrum-y-proceso/calendario-feria](../05-scrum-y-proceso/calendario-feria.md).

## 2. Niveles y equipos
- El **nivel** es el primer número del código del equipo (`N1-AYP-06`): N1 a N4 son las asignaturas participantes (menor a mayor). **N0 = colegios invitados.** El nivel pertenece al **grupo**, no al jurado.
- **Tres tipos de participante, que no se mezclan:**
  - **Equipo normal:** se califica con profesores y jurados junior (60 % y 40 %).
  - **Colegio (N0):** es externo a Uninorte y **sí se califica**, pero solo lo califican seniors (P-08); no tiene jurados junior. Regla de nota (propuesta del 7-nov pasada al equipo; confirmar con los profesores si hay casos): su nota final es el promedio de los seniors que lo calificaron al 100 %, y no queda en «Nota en proceso» por falta de junior.
  - **Presentador externo (HU-33):** persona sin equipo, o equipo no calificable que presenta un proyecto (HU-39, 10-nov), que **nunca se califica**; no entra al ranking, a la asignación ni a las exportaciones de notas. Lo registra solo el administrador y recibe el certificado final por correo, enviado por el administrador (nadie lo descarga). **Equipo rechazado (BG-43, 10-nov):** no tiene nota final ni sale en el ranking, pero sus evaluaciones se conservan y reaparecen si se reconfirma.
- **Marca «equipo externo» (`isExternal`):** independiente del nivel; en la nota final solo cuenta la nota de jurados junior. Qué equipos la llevan no está definido; Santiago cuenta los casos en `Arkad-test` (BG-37, HU-34). Hasta entonces no se cambia código y los casos los resuelve el administrador a mano.
- Los equipos de **colegios (N0) no tienen código de verificación** (P-25).
- Detalle: [equipos-y-verificacion](equipos-y-verificacion.md).

## 3. Calificación y nota final
| Regla | Valor | Ref. |
|---|---|---|
| Escala | 0 a 5, **2 decimales**; la nota final se redondea a 2 decimales antes de comparar empates | P-04 |
| Evaluaciones mínimas por grupo | **3**. Puede recibir más (suplentes, jurados tardíos) pero **solo cuentan las 3 primeras** (por hora de envío); las demás se guardan. Un grupo con menos de 3 sigue siendo válido y se marca | P-10 |
| Ponderación profesor/jurados | **Decidida el 6-nov (P-02):** **60 %** el promedio de las notas de los profesores que hayan calificado al grupo y **40 %** el promedio de las notas de los jurados junior. Parámetro por edición con esos valores por defecto (HU-34, Sprint 3, en implementación) | P-02, HU-34 |
| Nota incompleta | Si a un grupo le falta la nota de los profesores o la de los jurados junior, queda en **«Nota en proceso»** y sin posición en el ranking. Las ediciones pasadas no cambian. El administrador ve los grupos incompletos antes de liberar la nota (HU-20). Excepción propuesta: colegios (N0), ver sección 2 | HU-34 |
| Cálculo | Se **unifican** los dos cálculos antiguos (vista del ranking: 50/50 por defecto y promedio ausente = 0; servicio: 60/40 y, si falta un grupo, usa solo el otro) en uno solo con la regla de arriba (SP-02, HU-04, HU-34) | §4.2 #6 |
| Nota del profesor | Debe validarse 0–5 con 2 decimales en pantalla y backend (hoy solo `>= 0`) | HU-01 |
| Nota visible al estudiante | Solo la **nota final** (sin desglose), liberada por el administrador **desde las 12:00** | HU-20, HU-30 |
| Etiqueta de la nota | Decidida el 7-nov (BG-32): **Excelente** 4.50 a 5.00 · **Muy bueno** 4.00 a 4.49 · **Bueno** 3.50 a 3.99 · **Aceptable** 3.00 a 3.49 · **Insuficiente** 0.00 a 2.99. Límite inferior incluido; la nota se redondea a 2 decimales antes de elegir la etiqueta; acompaña solo a la nota final | BG-32 |

## 4. Ranking y desempate
- **Ranking oficial por nivel (N0–N4).** El ranking general se conserva como vista informativa (P-03).
- **Podio:** los **3 primeros** de cada nivel, configurable (P-29). La tabla de podio se eliminó de la BD en mayo de 2026: el podio se calcula desde el ranking.
- El administrador ve ganadores y empates por nivel para comunicarlos.
- **Desempate (P-05)**, reemplaza el puntaje automático 70 % jurados / 30 % profesores:
  1. Si los empatados son de NRC **del mismo profesor** (cualquier NRC suyo), **decide ese profesor**.
  2. Si son de profesores distintos, **gana el primer grupo inscrito** (`fecha_registro` del equipo).
  3. Si el profesor no quiere decidir, se aplica la inscripción.
  4. Un empate que mezcla grupos del mismo profesor con otros se resuelve por inscripción.
- La decisión del profesor queda registrada (`TieBreakDecision`).
- **Equipos externos (decisión de Allison del 7-nov, por confirmar con el profesor):** sí compiten por el podio, pero con uno **propio** de 3 (configurable), separado de los niveles, porque no pueden competir con los de nivel 1 (HU-38, en el backlog; hoy no está implementado). Los colegios (N0) siguen en su propio nivel.

## 5. Asignación de jurados
| Regla | Valor | Ref. |
|---|---|---|
| Grupos por jurado | **Máx. 3** (parámetro configurable). En manual solo **advierte** | HU-07, HU-08 |
| Jurados por grupo | 3 (la automática asigna 3). Más es válido: con suplentes un grupo puede quedar con más de 3, sin advertencia | P-10, HU-09 |
| Nivel | Todos los grupos de un jurado del **mismo nivel** (automática lo exige; manual advierte) | HU-07 |
| Colegios (N0) | Solo los califican jurados **senior (= profesores)**. Los junior siguen **bloqueados** | P-08 |
| Senior | **Solo profesores.** Todos los demás jurados son junior | P-07 |
| Suplentes | No reciben carga en la automática: entran solo como reemplazo. En lote (HU-09) se **suman** a todos los grupos de los jurados que cubren, sin quitarle grupos a nadie, en una sola transacción con bitácora y aviso de HU-22; aplican los bloqueos y advertencias de HU-08 | HU-07, HU-09 |
| Asignaciones fijas | La automática respeta las asignaciones manuales marcadas como fijas | P-21 |
| Conflicto de interés | La automática no asigna a un profesor equipos de NRC que él dicta (excepto colegios); la manual **advierte** | HU-07, HU-08 |
| Un senior por equipo | La automática intenta incluir al menos un senior/profesor por equipo universitario y avisa cuántos quedaron sin uno | HU-07 |
| Edición | Todo se asigna sobre la **edición activa** (hoy la automática usa la de id más alto: se corrige) | HU-07, BG-18 |
| Qué bloquea / qué advierte | **Bloquean** (integridad): asignación duplicada, usuario que no es jurado/profesor, nivel no legible, junior en colegios, equipo de otra edición. **Advierten** (negocio): límite de 3 grupos, niveles, menos de 3 jurados en un grupo | HU-08 |

Detalle: [jurados](jurados.md).

## 6. Edición (feria) y datos
- Cada edición tiene estado activa / inactiva / archivada. Semestre se guarda como número: 10 primer semestre, 20 intersemestral, 30 segundo. En pantallas y Excel se muestra «2026 - 1», «2026 - Intersemestral» o «2026 - 2» y en nombres de archivo `2026-1`, `2026-intersemestral` o `2026-2`, nunca el código crudo (`src/editions/semester-label.ts`, BG-63).
- La edición de trabajo es siempre la `ACTIVE` y **la decide el servidor**. Solo se escribe sobre la activa; las anteriores son historial de solo lectura. Ver [ediciones](ediciones.md).

## 7. Otras reglas vigentes
- **Likes:** sin video/fotos/logo, tope de 10; con logo pero sin video ni fotos, tope de 20. Dar y quitar like nunca baja de 0; único por usuario.
- **Sesión:** acceso 15 min y refresco 7 días por defecto (en prod dependen de variables); el front renueva 5 min antes de vencer, es decir cada 10 min con el token de 15 (HU-05).
- **Inscripciones:** el flag `registrationsOpen` (por defecto `false`) en la configuración del evento; el Administrador siempre pasa.
- **Fechas del evento en certificados:** variables `EVENT_DATE_TEXT`, `EVENT_TIME_TEXT`, `EVENT_PLACE_TEXT`.
- Reglas del borrador de evaluación: guardado automático en el servidor (P-22, HU-18).
- Exportaciones: se quedan en Excel como están (P-06); el panel del profesor exporta **lo filtrado**.
- Excel de notas del panel del profesor (BG-36): las notas (Docente, Feria y Jurado Junior) salen como **números** redondeados a 2 decimales con formato `0.00` (4 → 4.00, 3.5 → 3.50, 3.456 → 3.46), igual que en pantalla (BG-30); se pueden ordenar y sumar. Sin nota, la celda queda vacía.

## 8. Decisiones del flujo por edición (resumen)
(1) crear y activar edición con su configuración; (2) cargar NRC; (3) abrir inscripciones; (4) armar jurados externos; (5) cerrar inscripciones el 22; (6) asignación automática con validaciones; (7) escarapelas el 25; (8) feria el 26 con check-in QR y alta de último momento; (9) la siguiente edición repite el flujo.

Reglas aún abiertas y decisiones con fecha: [decisiones-abiertas](decisiones-abiertas.md).
