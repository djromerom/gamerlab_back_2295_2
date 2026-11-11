# Sprints (historial y plan)

> **Audiencia:** Scrum Master · **Actualizado:** 2026-11-05 · **Estado:** parcial (plan completo; resultados por tickets al 5-nov; faltan velocidad y retrospectiva) · **Fuente:** backlog §10.2 y §11; `JIRA_guia_y_sprint_1.md` Parte D

| Sprint | Fechas | Pts | Nombre en Jira | Meta |
|---|---|---|---|---|
| 1 | 23-oct → 30-oct | 84 | Sprint 1 Arranque y seguridad | Seguridad, proceso, «Guardar todo» con filtros, escarapelas con QR, sesión estable |
| 2 | 30-oct → 6-nov | 124 | Sprint 2 Ranking y jurados (id 7) | Ranking por nivel con desempate, asignación automática con validaciones, check-in QR, seguimiento por hora |
| 3 | 7-nov → 13-nov | 157 | Sprint 3 Asistencia y ajustes (id 8) | Alerta de inasistencia, borradores, nota final, errores del Sprint 2 y cambios de la reunión con profesores (NRC, externos, 60/40, jurados sin niveles, PWA con push) |
| 4 | 13-nov → 20-nov | 35 | Sprint 4 Contingencia y cierre | Suplentes, jurado de último momento, cierre estable |
| Feria | 20-nov → 26-nov | 5 | — | Despliegue, ensayo, feria (jueves 26) |

Total planeado: **294 pts** (más TA-16), sin contar los 10 tickets de datos por edición (BG-17 a BG-23, HU-26, HU-27, TA-17) ni BG-24, que seguían sin estimar. Puntos propuestos de los de datos por edición (3-nov, **no aplicados en Jira**): BG-17 8, HU-26 5, HU-27 8, BG-18 3, BG-19 5, BG-20 2, BG-21 2, BG-22 3, BG-23 3, TA-17 3 = 42.

El **Sprint 3 se creó en Jira el 6-nov** (id 8, 7 al 13 de nov; el nombre no puede pasar de 30 caracteres): 33 tickets, 38 subtareas y más subtareas que se sumaron después, con responsable por persona. Pasó de 51 a 142 pts con los errores del Sprint 2, la reunión con los profesores del 6-nov y el ticket de Santiago (TA-18), y a 157 con BG-43 (ARK-205), BG-44 (ARK-206), HU-39 (ARK-207, subtareas ARK-209 y ARK-210) y TA-24 (ARK-208) el 10-nov, y TA-25 (ARK-211) el 11-nov. Detalle y claves ARK-158 a ARK-211 en el backlog (sección 10.5).

## Cómo evolucionó el Sprint 2 (para entender por qué creció)
Plan del 29-oct: 75-76 pts → +BG-09 a BG-14 de Rafael (2-nov) → +BG-15, HU-25, BG-16 → +10 tickets de datos por edición asignados a Juan (3-nov, sin estimar) → +7 de las pruebas del Sprint 1 en test (4-nov, +21 pts) = **124**. Lección: con el sprint iniciado se siguieron sumando tickets; Rafael llegó a 33 pts y Juan a HU-07/HU-08 más diez tickets sin puntos.

## Reglas de los sprints
Una historia empieza y termina en el mismo sprint · máx. un BE y un FE por historia · puntos Fibonacci aproximados confirmados en planning · contrato de API por escrito antes de empezar.

## Orden de recorte (si se atrasa)
- **Sprint 2:** TA-12 → HU-21 → HU-16 → BG-13 → BG-12 → BG-11 → BG-05 → HU-08 y HU-07 (juntas) → HU-11. No se tocan: HU-04, TA-07, TA-10, BG-06, BG-07, BG-08, BG-09, BG-14, BG-16, HU-25 (ni BG-25, HU-28, BG-26). De lo nuevo del 4-nov: BG-29 → BG-28 → HU-29 → BG-30.
- **Sprint 3:** HU-37 → HU-17 → TA-21 → TA-20 → HU-23 → HU-13 → TA-22 (HU-18 y TA-06 salen juntas). Primero se hacen BG-41, BG-27, BG-35, BG-37, BG-39, HU-34 y SP-05.
- **Sprint 4:** HU-24 → HU-09 → HU-22 (HU-14 no se toca).

## Seguimiento real
Datos de Jira (consulta del 2026-11-05; los puntos de historia no se pudieron leer por la API, así que aquí se cuentan **tickets**, no puntos):

| Sprint | Estado en Jira | Fechas reales | Tickets | Resultado |
|---|---|---|---|---|
| Sprint 1 Arranque y seguridad (id 6) | **cerrado** el 2026-11-01 | 24-oct → 30-oct (cierre el 1-nov) | 19 | **19 hechos**: ARK-12 a 20, 22 a 26, 30, 39, 40, 71, 76 |
| Sprint 2 Ranking y jurados (id 7) | **activo** (fin previsto 6-nov 13:00) | 1-nov → 6-nov | 42 | **39 hechos, 1 en revisión (ARK-119, BG-14; cerrado el 6-nov como investigación), 2 por hacer (ARK-48 esta documentación y ARK-156 BG-33)** |

- Meta del Sprint 2 en Jira: «Mostrar a los profesores el ranking por nivel con desempate, la asignación automática de jurados con sus validaciones, el check-in con QR y la exportación de la asignación, y cerrar las últimas rutas que filtran correos y equipos». Las cuatro partes están en «Hecho» (HU-04, HU-07/08, HU-11, HU-16, BG-06/07).
- **Sin sprint asignado** (siguen en «Por hacer»): BG-24 (ARK-138), BG-27 (ARK-146), BG-32 (ARK-148) y todo lo planeado para los sprints 3 y 4. Sprint 3 y 4 no aparecen en Jira al 5-nov.
- Lo que no hay: velocidad en puntos, y la retrospectiva. > PENDIENTE (Scrum Master): llenar velocidad y retrospectiva al cerrar el Sprint 2 el 6-nov (plantilla en `JIRA_guia_y_sprint_1.md` Parte D) y copiarlas aquí.

Estado a 4-nov 18:47 (Jira): casi todo lo «En pruebas» (HU-04, HU-25, HU-26, HU-27, BG-17…) pasó a «Hecho». Hechos antes: BG-09 a BG-13, BG-15, BG-16, HU-11, HU-16, HU-21, TA-10. En revisión: BG-07, BG-14, TA-07. El 6-nov, BG-14 (ARK-119) pasó a «Hecho» al anotarse la causa; el arreglo del front quedó en BG-34 (ARK-157).

## Demo del 6-nov
Guion y checklist: `ARKAD_guion_presentacion_6nov.md` y `ARKAD_checklist_frontend_demo_6nov.md` (el segundo tiene estados de Jira viejos). Contenido: ranking con desempate (HU-04), asignación automática (HU-07), validaciones (HU-08), check-in QR (HU-11), seguimiento por hora/exportación/crear jurado (HU-21, HU-16, BG-05), seguridad (BG-06, BG-07, BG-08), asistencia (HU-29, BG-28) y 2 decimales (BG-30).
