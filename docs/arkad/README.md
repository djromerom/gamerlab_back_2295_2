# Documentación de ARKAD (V4)

> Última actualización: 2026-11-06 · Responsable: Scrum Master V4 (Allison Ruiz) · Estado: **primera versión completa, publicada en los repos el 6-nov y en actualización continua desde el Sprint 3**

ARKAD es la plataforma de la feria de videojuegos de Uninorte (próxima feria: **26-nov-2026**). Esta carpeta es el punto de entrada para quien reciba el proyecto: explica **qué hay, qué no hay y cómo funciona hoy**. Esta copia vive en `docs/arkad/` de los repos de backend y frontend (el contenido es el mismo en ambos).

## Cómo leer esta documentación
- Cada archivo empieza con una cabecera: audiencia, última actualización, fuente y **estado** (`completo`, `parcial`, `pendiente`).
- Donde algo no se pudo verificar, aparece `> PENDIENTE:` o `> A CONFIRMAR con <rol>`. No hay que asumir que existe.
- **Aquí no hay secretos.** Las credenciales, llaves y datos de acceso se entregan por canal privado a la Scrum Master y al DevOps del equipo; los documentos solo dicen dónde viven y cómo se rotan.

## ¿Por dónde empiezo según mi rol?

| Soy… | Lee primero | Después |
|---|---|---|
| **DevOps** | [04-devops/README](04-devops/README.md) → [pipeline](04-devops/pipeline-y-despliegue.md) → [variables y accesos](04-devops/variables-y-accesos.md) | [runbook de promoción](04-devops/runbook-promocion-a-produccion.md), [incidentes](04-devops/runbook-incidentes.md), [riesgos](04-devops/riesgos-y-deuda.md) |
| **Backend** | [02-backend](02-backend/README.md) | [01-negocio](01-negocio/reglas-de-negocio.md), [04-devops/base-de-datos](04-devops/base-de-datos-operacion.md) |
| **Frontend** | [03-frontend](03-frontend/README.md) | [01-negocio](01-negocio/reglas-de-negocio.md), [flujo full-stack](04-devops/flujo-fullstack-y-ramas.md) |
| **Scrum Master** | [05-scrum-y-proceso](05-scrum-y-proceso/jira-y-flujo-de-trabajo.md) → [checklist de traspaso](05-scrum-y-proceso/checklist-traspaso-v5.md) | [01-negocio](01-negocio/reglas-de-negocio.md) |

## Mapa

| Carpeta | Contenido | Estado |
|---|---|---|
| [00-inicio-rapido](00-inicio-rapido/) | Qué es ARKAD, onboarding por rol, arquitectura, estado actual | completo (estado: parcial) |
| [01-negocio](01-negocio/) | Reglas de negocio, jurados, ediciones, roles, decisiones, juegos web por motor y montaje de los videojuegos | completo (roles y equipos: parcial) |
| [02-backend](02-backend/) | NestJS, Prisma, auth, endpoints, integraciones | completo (contrastado con producción) |
| [03-frontend](03-frontend/) | React, rutas, estado, deuda técnica | completo en lo verificable (leído de `origin/main`) |
| [04-devops](04-devops/) | Pipeline, servidor, variables, BD, runbooks, riesgos | completo (base de Santiago) |
| [05-scrum-y-proceso](05-scrum-y-proceso/) | Jira, sprints, backlog, traspaso a V5 | completo salvo retrospectiva (se completa al cierre) |
| [06-referencia](06-referencia/) | Glosario, mapa de fuentes, changelog | completo |

El estado real de cada archivo está en [06-referencia/changelog-documentacion.md](06-referencia/changelog-documentacion.md).

## Fuentes originales fuera de esta carpeta
`ARKAD_v4_plan_y_backlog.md` (reglas de negocio, backlog, sprints), `JIRA_guia_y_sprint_1.md`, `jira-*.md`, y los repos de backend y frontend. Esos documentos del equipo no están en el repo. Ver [mapa de fuentes](06-referencia/mapa-de-fuentes.md).
