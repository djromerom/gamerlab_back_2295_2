# Decisiones abiertas y registro de decisiones

> **Audiencia:** Scrum Master, Product Owner, todo el equipo · **Actualizado:** 2026-11-05 · **Estado:** completo a la fecha · **Fuente:** backlog §1.2, §10.3; `contexto-devops-arkad.md` §13

## Abiertas

| Código | Pregunta | Estado |
|---|---|---|
| **P-02** | ¿Qué ponderación tienen la nota del profesor y la de los jurados? | Se define en la reunión con profesores del ~6-nov. Mientras, parámetro por edición. HU-04 no depende de ella |
| P-23 | ¿Qué navegadores/dispositivos se soportan para juegos web? | Sin definir (SP-03) |
| P-24 | ¿Roles, porcentajes y sesiones de producción coinciden con lo revisado? | No se pudo consultar producción en su momento |
| P-28 | ¿La Épica V (TA-06) sigue obligatoria y se aceptan los recortes? | Abierta |
| — | ¿El botón «Históricos» del panel del profesor muestra solo sus NRC pasados o todos? | Hoy todos, por diseño. Para la reunión del 6-nov |
| — | ¿Qué rangos tienen «Excelente», «Bueno»…, o se retiran? (BG-32) | Para la reunión del 6-nov |
| — | ¿Los equipos externos compiten por el podio? | Duda para el PO |
| — | Resultado de ARK-98: notas junior de N10-PRF-1001/2/3 pasan de ~3,5 a 5 | Dudoso, sin resolver |

## Decididas (índice; detalle en [reglas-de-negocio](reglas-de-negocio.md))
- P-01 fecha de feria · P-03 ranking por nivel · P-29 podio de 3 · P-04 escala 0–5 con 2 decimales · P-05 desempate · P-06 exportaciones en Excel · P-07 senior solo profesores · P-08 colegios solo senior · P-09 cronograma · P-10 mínimo 3 evaluaciones y cuentan 3 · P-13 encuesta opcional · P-16/P-26 profesores ven seguimiento en solo lectura · P-19 alertas en el panel · P-20 sin check-in offline · P-21 asignación fija · P-22 borradores en servidor · P-25 N0 sin código · P-27 texto de suplentes sin revisión de profesores.

## Registro por fecha
- **2026-10-23:** reunión con profesores y PO (sección 6.2 del backlog); senior = solo profesores; Jorge Silva se suma a Frontend.
- **2026-10-30 (decisiones ARK-SP1):** límites de intentos (login 10/min; reset-password y resend-confirmation 5 por 10 min; validate-emails 15/min, por IP y en memoria); refresh tokens con hash, rotación y revocación en logout; borrado lógico de profesor/jurado; NRC único parcial; promedios públicos `null` si el ranking está oculto (salvo admin); `registrationsOpen` por defecto `false`. Tabla completa: `contexto-devops-arkad.md` §13.
- **2026-11-02:** jurados por edición (HU-25); flujo por edición.
- **2026-11-03:** datos por edición (8 reglas, ver [ediciones](ediciones.md)).
- **2026-11-04:** solo «suplente» (BG-29); profesor creado = Senior y Oficial (BG-26); senior sin NRC por correo (HU-28); asistencia visible para Admin y Staff (HU-29); estudiantes ven solo nota final (HU-30); notas con 2 decimales (BG-30); lista de asignación siempre de la edición (BG-25).
- **2026-11-05:** custodia de credenciales a cargo de la Scrum Master; no se rotan llave SSH, admin prod ni Gmail en V4 ([variables-y-accesos](../04-devops/variables-y-accesos.md)).

## Recortes por costo (30-oct)
Siguiente sprint: ramas 19, 20, 24, 26, Task 27, Task 28 y parte front de la 16 del plan ARK-SP1. Fuera de alcance: F6 (9 archivos de más de 500 líneas) y Redis para el throttle.
