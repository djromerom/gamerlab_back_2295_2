# Equipo, roles y revisiones

> **Audiencia:** Scrum Master, todo el equipo · **Actualizado:** 2026-11-05 · **Estado:** completo (equipo V4; la V5 lo reemplaza) · **Fuente:** backlog §5, §11

## Equipo V4

| Función | Persona | Responsabilidad |
|---|---|---|
| Scrum Master | Allison Ruiz | Jira, backlog, ceremonias, enlace con el profesor (PO) y con los profesores, custodia de credenciales de administración |
| DevOps | Santiago Díaz | Docker, pipeline, entornos (`Arkad-test` y producción), accesos al servidor, pruebas automatizadas, despliegues |
| Backend | Rafael Mejía, Juan Álvarez, Samuel Tilano | Repo backend: API, BD, reglas de negocio |
| Frontend | Camilo Acevedo, Jorge Silva (desde 23-oct) | Repo frontend: interfaces y experiencia |

**Product Owner:** el profesor del curso. Hay además profesores que dan feedback (reuniones del 21 y 23-oct y ~6-nov).

## Frentes (propuesta)
| Frente | Épicas | Quién |
|---|---|---|
| Jurados | II | 1 BE + Jorge (FE) |
| Calificaciones y profesores | F y V | 1 BE + Camilo (FE) |
| Plataforma (sesión, correos, multimedia, ediciones) | I, III, IV | 1 BE + Jorge en sesión |
| Transversal | 0, VI, VII | DevOps y Scrum Master |

**Riesgo principal:** las dos personas de Frontend tocan archivos comunes. Mitigación: cada frente tiene su FE, las pantallas del panel de profesores las lleva Camilo, las revisiones de PR se cruzan y quien entra arranca con tickets pequeños.

## Quién revisa a quién (plan del backlog)
| PR de | Lo revisa |
|---|---|
| Juan | Rafael |
| Rafael | Samuel |
| Samuel | Rafael |
| Camilo | Samuel |
| Jorge | Camilo; Samuel en HU-07, HU-08, HU-14, HU-17 y HU-18 |
| Santiago | Juan |

Además, en GitHub **`Santrosherun`** (Santiago Díaz) es el **reviewer fijo de los PR**: se le pide con `gh pr create --add-reviewer Santrosherun`. Hay otro Santiago con acceso a los repos (`santiagohoyos20`): **no** es el reviewer. Para el PR sin ticket exacto se usa el más cercano. Convención de ramas y ticket: [flujo-fullstack-y-ramas](../04-devops/flujo-fullstack-y-ramas.md).

> A CONFIRMAR: si la tabla de arriba y el reviewer fijo se aplican a la vez (Santiago aprueba, el par técnico revisa) o si el segundo reemplazó al primero.

## Carga por persona (Sprint 2, plan del 4-nov)
Samuel 28 · Camilo 14 · Juan 18 (+ 10 tickets sin estimar) · Rafael 33 · Jorge 20 · Santiago 8 · Allison 3. Ver [sprints-historial](sprints-historial.md).

## Reglas de asignación
- Asignar siempre **por persona**; en Jira una historia con dos personas se parte en subtareas.
- Repartir la carga antes de iniciar el sprint; no sumar tickets sin estimar con el sprint en curso.
