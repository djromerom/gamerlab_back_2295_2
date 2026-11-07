# Mapa de fuentes

> **Actualizado:** 2026-11-05 · **Estado:** parcial. Dónde vive cada documento original y cuál es el vigente. Rutas relativas a la carpeta `ARKAD/`.

| Tema | Fuente | Vigencia / notas |
|---|---|---|
| DevOps (pipeline, accesos, BD, ramas, promociones) | `entrega-documentacion-ARK-48/…` (fuera del repo) (entrega de Santiago, corte 2026-11-05) | **Vigente.** No se modifica; `04-devops/` la resume y enlaza. Su `00-INDICE` menciona `docs-locales/`, que no existe en la entrega |
| Reglas de negocio, backlog, épicas, sprints | `ARKAD_v4_plan_y_backlog.md` (§1 decisiones, §2 roles, §4 reglas, §8 DoD, §9 backlog, §10 adiciones, §11 sprints) | Vigente (actualizado hasta 2026-11-04) |
| Jira: guía y Sprint 1 | `JIRA_guia_y_sprint_1.md`, `Jira (1).csv`, `jira_import/` | Vigente / histórico |
| Bugs, jurados y pruebas del Sprint 2 | `jira-bugs-registro-2026-11-01.md`, `jira-jurados-por-edicion-2026-11-02.md`, `jira-tickets-sprint-2-bugs-registro-y-pruebas-2026-11-02.md`, `SP-04 jurados que llegan sin confirmar.md` | Vigentes |
| Demo del 6-nov | `ARKAD_checklist_frontend_demo_6nov.md`, `ARKAD_guion_presentacion_6nov.md` | Vigentes hasta la demo |
| Notas internas | `NOTAS_PERSONALES_ALLISON.md` | **Personal: no publicar ni migrar sin revisar** |
| Plan de trabajo V3 | `PLAN DE TRABAJO.docx` | Histórico |
| Código back | `repo back` (README, CONTRIBUTING, BRANCHING, `docs/`, `prisma/`) | Vigente. Su `.env.example` es anterior al de la entrega |
| Código front | `repo front` | Vigente. Su README es la plantilla genérica de Vite |
| Herencia V3 (guía de arranque, pipeline, pendientes, dumps, diagrama) | `arkad_docs/arkad_docs/{docs,db_dumps}` | **Desactualizada** salvo `db_dumps` (históricos). Su guía de arranque tiene datos obsoletos |
| Scripts de verificación | `verificacion/` | Vigentes; sin documentar |

## Archivos que NO deben copiarse a documentación ni a repos
Contienen secretos: `credenciales.txt`, `CREDENCIALES BACKEND.txt`, `CREDENCIALES FRONTEND (1).txt`, `arkad_docs/arkad_docs/keys/` (incluye una llave privada), y los `docker-compose.yml` con contraseña de desarrollo en claro. Ver [variables y accesos](../04-devops/variables-y-accesos.md).
