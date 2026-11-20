# Decisiones abiertas y registro de decisiones

> **Audiencia:** Scrum Master, Product Owner, todo el equipo · **Actualizado:** 2026-11-17 · **Estado:** completo a la fecha · **Fuente:** backlog §1.2, §10.3; `contexto-devops-arkad.md` §13

## Abiertas

| Código | Pregunta | Estado |
|---|---|---|
| P-23 | ¿Qué navegadores/dispositivos se soportan para juegos web? | Sin definir (SP-03) |
| P-24 | ¿Roles, porcentajes y sesiones de producción coinciden con lo revisado? | No se pudo consultar producción en su momento |
| P-28 | ¿La Épica V (TA-06) sigue obligatoria y se aceptan los recortes? | Abierta |
| — | ¿Los equipos externos tienen su propio podio? | Decisión de Allison del 7-nov (por confirmar con el profesor): sí compiten, con un podio propio, separado de los niveles (HU-38, en el backlog) |
| — | ¿Qué equipos llevan la marca «externo» y qué nota tienen los colegios (N0), que solo califican seniors? | Propuesta del 7-nov: el colegio tiene el promedio de los seniors al 100 %. Santiago cuenta los casos en `Arkad-test`; confirmar con los profesores |
| — | ¿Qué avisos exactos envía el push (HU-37)? ¿La PWA funciona bien en iPhone (HU-36)? | Avisos implementados: cambio de equipos (al asignar grupos nuevos dice cuántos y sus códigos y abre «Pendientes por calificar», HU-51; al quitar o reasignar, el texto genérico), recordatorio de llegada y equipos pendientes; faltan pruebas en iPhone |
| — | BG-41: ¿fue el reasignar equipos lo que sacó al jurado de ARKAD? | La sospecha del profesor Daniel no se confirmó; se revisan los logs de `Arkad-test` |
| — | Resultado de ARK-98: notas junior de N10-PRF-1001/2/3 pasan de ~3,5 a 5 | Dudoso, sin resolver |

## Decididas (índice; detalle en [reglas-de-negocio](reglas-de-negocio.md))
- **P-02 ponderación 60 % profesores / 40 % jurados junior (6-nov)** · P-01 fecha de feria · P-03 ranking por nivel · P-29 podio de 3 · P-04 escala 0–5 con 2 decimales · P-05 desempate · P-06 exportaciones en Excel · P-07 senior solo profesores · P-08 colegios solo senior · P-09 cronograma · P-10 mínimo 3 evaluaciones y cuentan 3 · P-13 encuesta opcional · P-16/P-26 profesores ven seguimiento en solo lectura · P-19 alertas en el panel · P-20 sin check-in offline · P-21 asignación fija · P-22 borradores en servidor · P-25 N0 sin código · P-27 texto de suplentes sin revisión de profesores.

## Registro por fecha
- **2026-10-23:** reunión con profesores y PO (sección 6.2 del backlog); senior = solo profesores; Jorge Silva se suma a Frontend.
- **2026-10-30 (decisiones ARK-SP1):** límites de intentos (login 10/min; reset-password y resend-confirmation 5 por 10 min; validate-emails 15/min, por IP y en memoria); refresh tokens con hash, rotación y revocación en logout; borrado lógico de profesor/jurado; NRC único parcial; promedios públicos `null` si el ranking está oculto (salvo admin); `registrationsOpen` por defecto `false`. Tabla completa: `contexto-devops-arkad.md` §13.
- **2026-11-02:** jurados por edición (HU-25); flujo por edición.
- **2026-11-03:** datos por edición (8 reglas, ver [ediciones](ediciones.md)).
- **2026-11-04:** solo «suplente» (BG-29); profesor creado = Senior y Oficial (BG-26); senior sin NRC por correo (HU-28); asistencia visible para Admin y Staff (HU-29); estudiantes ven solo nota final (HU-30); notas con 2 decimales (BG-30); lista de asignación siempre de la edición (BG-25).
- **2026-11-06:** reunión con los profesores. **P-02 cerrada:** 60 % el promedio de los profesores que calificaron al grupo, 40 % el promedio de los jurados junior (HU-34); la nota incompleta queda en «Nota en proceso». Selector de NRC con la opción A, botones por materia (HU-31); correo repetido sin pegar (HU-32); rol de **presentador externo**, registrado solo por el administrador y sin calificación (HU-33); en lo que ven los jurados y usuarios finales solo dice «Jurados», sin junior ni senior (HU-35); PWA instalable (HU-36) y push (HU-37) para jurados; instructivo PDF de inscripción (TA-23).
- **2026-11-07:** **rangos de las etiquetas de nota (BG-32), decididos por Allison:** Excelente 4.50 a 5.00, Muy bueno 4.00 a 4.49, Bueno 3.50 a 3.99, Aceptable 3.00 a 3.49, Insuficiente 0.00 a 2.99. **Podio de externos:** los equipos externos compiten por el podio con uno propio, separado de los niveles (HU-38; por confirmar con el profesor). Aclaración de tipos: equipo normal, colegio (N0, externo, sí se califica solo con seniors) y presentador externo (nunca se califica). Propuesta para la nota de los colegios: promedio de seniors al 100 %. BG-37: «guardar la nota del profesor no modifica las notas de los jurados» (la nota del profesor sí entra a la final por P-02). BG-24: las fotos se resuelven firmándolas, sin marcar archivos como públicos.
- **2026-11-17 (kary, BG-63):** la pestaña «Históricos» del panel de calificaciones muestra al profesor solo los equipos archivados de sus NRC (los equipos sin NRC tampoco); el Administrador sigue viendo todos. Revierte la vista histórica global del 2026-10-29. El semestre se muestra legible en todos lados: «2026 - 1», «2026 - 2», «2026 - Intersemestral».
- **2026-11-05:** custodia de credenciales a cargo de la Scrum Master; no se rotan llave SSH, admin prod ni Gmail en V4 ([variables-y-accesos](../04-devops/variables-y-accesos.md)).

## Recortes por costo (30-oct)
Siguiente sprint: ramas 19, 20, 24, 26, Task 27, Task 28 y parte front de la 16 del plan ARK-SP1. Fuera de alcance: F6 (9 archivos de más de 500 líneas) y Redis para el throttle.
