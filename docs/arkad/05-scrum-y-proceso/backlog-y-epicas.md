# Backlog y épicas

> **Audiencia:** Scrum Master, PO, todo el equipo · **Actualizado:** 2026-11-05 · **Estado:** parcial (mapa y claves; estado individual de cada ticket debe leerse en Jira) · **Fuente:** backlog §9, §10; memoria del proyecto (claves Jira)

Fuente completa de cada ticket (historia, criterios, subtareas y caso de uso): `ARKAD_v4_plan_y_backlog.md` §9 y §10 (documento del equipo, fuera del repo). Ahí se encuentra el detalle; esta página es el mapa.

## Épicas
| Épica | Nombre | Tickets |
|---|---|---|
| 0 | Arranque v4 y Gobierno | TA-01 (respaldo y ensayo), TA-02 (docker compose/build), TA-03 (proceso, Jira, Discord), SP-01 (feedback profesores) |
| F | Panel de Profesores, Calificaciones y Ranking (prioritaria) | SP-02, HU-01 (Guardar todo), HU-02 (exportar filtrado), TA-04 (retirar «Subir plantilla»), HU-03 (filtros), HU-04 (ranking con desempate), HU-20 (nota final a estudiantes), HU-30 |
| I | Estabilidad y Seguridad de Sesión | TA-05 (correos ACS), HU-05 (refresh token), HU-06 (reintentos), BG-01, BG-02, BG-06, BG-07, BG-08 |
| II | Gestión de Jurados (prioritaria) | HU-07 a HU-14, HU-16, HU-17, HU-19, HU-21 a HU-25, HU-28, HU-29, SP-04, BG-05, BG-16, BG-25, BG-26 |
| III | Videojuegos Online y Multimedia | SP-03 (Pygame, Unity, Godot en navegador), BG-24 |
| IV | Ediciones y Pantalla de Inicio | BG-03, BG-04, BG-14, BG-15, BG-17 a BG-23, HU-26, HU-27, TA-17 |
| V | Flujo de Evaluación Robusto | HU-18 (pausar/reanudar, borradores), TA-06, BG-27 |
| VI | DevOps, Calidad y Documentación | TA-07 a TA-12, TA-16 |
| VII | Orden de los repositorios | TA-13, TA-14, TA-15 |

Otros bugs: BG-09 a BG-13 (registro de equipos), BG-28 a BG-32 (pruebas del Sprint 1). Total: ~81 tickets (HU-01 a HU-30, BG-01 a BG-32, TA-01 a TA-17, SP-01 a SP-04). HU-15 se retiró.

## Claves de Jira conocidas
HU-02 = ARK-18 · HU-03 = ARK-20 · HU-05 = ARK-23 · HU-07 = ARK-27 · HU-08 = ARK-28 · HU-20 = ARK-81 · HU-21 = ARK-73 · TA-16 = ARK-77 · BG-07 = ARK-97 · HU-25 = ARK-124 · BG-15 = ARK-123 · **BG-17 = ARK-128 · HU-26 = ARK-129 · HU-27 = ARK-130 · BG-18 = ARK-131 · BG-19 = ARK-132 · BG-20 = ARK-133 · BG-21 = ARK-134 · BG-22 = ARK-135 · BG-23 = ARK-136 · TA-17 = ARK-137** · BG-24 = ARK-138 · BG-26 = ARK-139 · BG-25 = ARK-140 · HU-28 = ARK-141 · HU-29 = ARK-142 · BG-28 = ARK-143 · BG-29 = ARK-144 · BG-30 = ARK-145 · BG-27 = ARK-146 · BG-31 = ARK-147 · BG-32 = ARK-148 · HU-30 = ARK-149 · subtareas ARK-150 a 155. Agregados el 10 y 11-nov (Sprint 3): BG-43 = ARK-205 · BG-44 = ARK-206 · HU-39 = ARK-207 (subtareas ARK-209 y ARK-210) · TA-24 = ARK-208 · TA-25 = ARK-211. El resto: buscar en Jira por el código en el Resumen (`[HU-xx]`).

## Dependencias clave
`BG-01` → `HU-11` · `SP-02` → `HU-04` · `TA-04` → `HU-01` · `HU-10` → `HU-11` → `HU-12` → `HU-14` · `HU-11` → `HU-23` · `HU-08` → `HU-07`, `HU-09`, `HU-14` · `HU-14` → `HU-22` · `HU-04` → `HU-20` · `HU-05`/`HU-06` → `HU-18` → `TA-06` · `HU-03` → `HU-02` · `HU-27` (ARK-130) bloquea BG-18 a BG-23 · `BG-17` (ARK-128) bloquea `HU-26` (ARK-129).

## Priorización por fases
0 Arranque (BG-01, BG-02, TA-01..03, TA-05, SP-01, SP-02) → 1A Panel de profesores (Épica F) → 1B Jurados y día de la feria (Épica II) → 2 Plan heredado de V3 (I, III, IV, V, VI) → 3 Orden de repos (VII, incremental) → 4 Semana de feria (TA-16).

## Qué queda abierto para V5 (a 5-nov, a confirmar en Jira)
- Sprint 3 y 4 completos (HU-12/13/23/18/17/20/30, HU-14/22/09/24, TA-06, TA-16) si no se terminan en V4.
- **Épica VII** (orden de repos): solo diagnóstico/propuesta; reorganización incremental.
- TA-08/TA-09/TA-10/TA-11 (limpieza de Actions, dumps, tests): ver [riesgos y deuda](../04-devops/riesgos-y-deuda.md).
- Decisiones P-02, P-23, P-24, P-28.
- Refactor F6 (9 archivos de más de 500 líneas) y Redis para throttle (fuera de alcance de ARK-SP1).

## Estado real de los tickets en Jira (consulta del 2026-11-05)

Fuente: Jira, proyecto ARK (tipos estándar, sin subtareas). Las 9 épicas (ARK-3 a ARK-11) están en «Por hacer», como es habitual en épicas. Para refrescar: JQL `project = ARK AND issuetype in standardIssueTypes() ORDER BY key ASC`.

### Hechos
| Ticket | Clave Jira | Responsable |
|---|---|---|
| TA-01, TA-02, TA-05, TA-07 | ARK-12, 13, 22, 43 | Santiago Díaz |
| TA-03, SP-01, SP-02 | ARK-14, 15, 16 | Allison Ruiz |
| HU-01, HU-02, HU-03, TA-04, HU-06 | ARK-17, 18, 20, 19, 24 | Camilo Acevedo |
| HU-05, HU-10, HU-19, BG-04, BG-05, BG-08, BG-28, BG-29 | ARK-23, 30, 71, 40, 95, 116, 143, 144 | Jorge Silva |
| HU-07, HU-08, BG-01, BG-25, BG-31, HU-30, BG-17..23, HU-26, HU-27, TA-17 | ARK-27, 28, 25, 140, 147, 149, 128..136, 137 | Juan Álvarez |
| HU-04, HU-16, BG-02, BG-03, BG-06, BG-07, BG-09..13, BG-26, BG-30, SP-04 | ARK-21, 36, 26, 39, 96, 97, 120..122, 117, 118, 139, 145, 76 | rdmp300 (Rafael Mejía) |
| HU-11, HU-21, HU-25, HU-28, HU-29, BG-16, TA-10 | ARK-31, 73, 124, 141, 142, 127, 46 | Samuel Tilano |
| BG-15 | ARK-123 | Santiago Díaz |

### En revisión
| Ticket | Clave | Responsable |
|---|---|---|
| BG-14 (hora de fin 05:30 de «Feria Gamer 2025 - S2») | ARK-119 | rdmp300 (cerrado el 6-nov como investigación; ver [ediciones](../01-negocio/ediciones.md#horas-de-las-ediciones-y-zona-horaria)) |
| BG-34 (el front debe fijar America/Bogota en las horas de ediciones) | ARK-157 | rdmp300, 2 pts, Sprint 3 (asignado el 6-nov) |

### Por hacer (queda abierto para V5 si no se cierra antes)
| Ticket | Clave | Responsable asignado |
|---|---|---|
| BG-33 (la asignación pide 300 jurados y el servidor acepta máx. 100 por página) | ARK-156 | Juan Álvarez |
| BG-27 (progreso de evaluación/notas se pierde al recargar) | ARK-146 | Jorge Silva |
| BG-32 («Excelente» con nota 3.5) | ARK-148 | rdmp300 |
| BG-24 (fotos de ediciones pasadas no públicas) | ARK-138 | Samuel Tilano |
| TA-12 (esta documentación, ARK-48) | ARK-48 | Allison Ruiz |
| HU-09 suplentes en lote | ARK-29 | sin asignar |
| HU-12 alerta temprana · HU-13 respuesta de profesores · HU-14 contingencia con suplentes | ARK-32, 33, 34 | sin asignar |
| HU-17 encuesta a jurados · HU-18 borradores en servidor · HU-20 nota final · HU-22 aviso a suplentes · HU-23 jurados que se retiraron · HU-24 alta de jurado sin registro | ARK-37, 41, 72, 74, 75, 94 | sin asignar |
| SP-03 juegos Pygame/Unity/Godot | ARK-38 | Samuel (resultados en [juegos web por motor](../01-negocio/juegos-web-por-motor.md)) |
| TA-06 pruebas del flujo consecutivo · TA-08 pipeline · TA-09 dumps · TA-11 pruebas de integración | ARK-42, 44, 45, 47 | sin asignar |
| TA-13, TA-14, TA-15 (orden de repos, Épica VII) | ARK-49, 50, 51 | sin asignar |
| TA-16 despliegue y ensayo antes de la feria | ARK-77 | sin asignar |

> A CONFIRMAR: HU-15 no aparece en la consulta (posiblemente cancelada o eliminada). Los estados de Jira mandan sobre las tablas de texto del backlog anterior: HU-07, HU-08, HU-11 y HU-25 ya figuran «Hecho».
