# Jira y flujo de trabajo

> **Audiencia:** Scrum Master, todo el equipo · **Actualizado:** 2026-11-05 · **Estado:** completo · **Fuente:** backlog §2, §5, §8; `JIRA_guia_y_sprint_1.md`; ramas: [flujo-fullstack-y-ramas](../04-devops/flujo-fullstack-y-ramas.md)

## Jira
- Proyecto **ARK** (ARKAD 2026-30), sitio `arkadv4.atlassian.net`, tipo company-managed (plan Free), **en español**. Tipos: Historia, Tarea, Error, Subtarea.
- **Tablero:** Por hacer → En progreso → En revisión (PR) → En pruebas → Hecho.
- **Convención de IDs:** el código del backlog va en el Resumen (`[HU-01]`); Jira asigna `ARK-n`. Tipos del backlog: `HU` historia de usuario · `TA` tarea técnica/operativa · `SP` spike (investigación con tiempo limitado) · `BG` bug. Los códigos no se reutilizan. Etiqueta `feedback`: viene del feedback de profesores del 21-oct.
- **Estructura de cada ticket:** Resumen, Tipo, Épica, Prioridad, Etiquetas; Descripción con (1) historia de usuario, (2) justificación/origen, (3) criterios de aceptación, (4) subtareas sugeridas Backend/Frontend, (5) caso de uso (flujo básico, alternos, postcondiciones, excepciones). Los casos de uso van **dentro** de las historias.
- **Un solo Assignee:** las historias de dos personas (BE + FE) se parten en **subtareas**. Las subtareas no se importan por CSV: se crean a mano.
- **Puntos:** Jira no deja ponerlos al crear Error/Historia nuevos desde la API (el campo no está en la pantalla); en esos casos van como «propuestos» en la descripción.
- Importar por CSV: usar siempre primero una importación de prueba (`jira_import/`). El detalle está en la Parte A de `JIRA_guia_y_sprint_1.md`.
- Acceso por herramientas: existe un MCP local `atlassian-allison`; verificar con `atlassianUserInfo` quién es la cuenta antes de escribir (el conector de claude.ai estaba ligado a otra cuenta).

## Regla de documentación
**Todo cambio en Jira se anota también en `ARKAD_v4_plan_y_backlog.md`** (secciones 10 y 11) para que el `.md` siga siendo la fuente completa.

## Cómo se trabaja una historia
- Cada historia se divide en subtareas **Backend** y **Frontend**; máximo **una persona de BE y una de FE** por historia.
- Backend y Frontend acuerdan primero el **contrato de la API** por escrito (comentario en el ticket).
- Una historia empieza y termina en el mismo sprint.
- Queda «Hecha» cuando **ambas** subtareas están integradas y probadas en `Arkad-test`.

## Definition of Done
1. Cumple los criterios de aceptación.
2. Cada subtarea fue revisada por otro integrante y se integró.
3. Probado en local y en `Arkad-test`; pantallas nuevas o modificadas revisadas también a **360 px**.
4. Ningún archivo supera **500 líneas**; código nuevo modular (lógica en hooks, separada de las vistas).
5. Si es de la Épica V, tiene su test funcional aprobado.
6. Documentación necesaria actualizada.

## Reglas técnicas
- Ramas desde `dev` (back) / `dev-deploy` (front); `main` y las de integración protegidas: todo entra por PR con revisión. Nomenclatura y merges: [flujo-fullstack-y-ramas](../04-devops/flujo-fullstack-y-ramas.md).
- **Credenciales, llaves y `.env` nunca se suben a Jira, Discord ni GitHub.** Los datos de la BD tienen información personal: solo en local.

## Ceremonias y cadencia
Sprints **semanales** de viernes a viernes (23-oct, 30-oct, 6-nov, 13-nov, 20-nov): planning, revisión intermedia el miércoles, demo/cierre al final. Entregas semanales y Discord como canal (TA-03). Se recalcula el plan al cerrar cada sprint con la velocidad real.

> PENDIENTE: confirmar días y horas exactas de cada ceremonia (están en `JIRA_guia_y_sprint_1.md` Parte B.6).
