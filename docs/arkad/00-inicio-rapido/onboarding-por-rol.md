# Onboarding por rol

> **Audiencia:** equipo V5 · **Actualizado:** 2026-11-05 · **Estado:** completo (ruta de lectura y primeras tareas) · **Fuente:** toda esta documentación

Antes que nada, todos: leer [qué es ARKAD](que-es-arkad.md), [arquitectura](arquitectura-general.md) y [estado actual](estado-actual.md).

## Backend
1. Leer [02-backend/README](../02-backend/README.md), luego [modelo de datos](../02-backend/modelo-de-datos.md) y `docs/editions.md` (**obligatorio**).
2. Leer [auth y permisos](../02-backend/auth-y-sesiones.md), [reglas de negocio](../01-negocio/reglas-de-negocio.md) y [jurados](../01-negocio/jurados.md).
3. Levantar el entorno: `docker compose -f docker-compose.dev.yml up -d` ([guía](../04-devops/flujo-fullstack-y-ramas.md)); abrir Swagger en `:3000/api`.
4. Correr `npm run test:ci` y `npm run routes:inventory`.
5. Leer [guía de contribución](../02-backend/guia-de-contribucion.md) y [ramas](../04-devops/flujo-fullstack-y-ramas.md).
6. Primera tarea: un bug pequeño; el PR a `dev`, reviewer `Santrosherun` (o quien designe la V5).

## Frontend
1. [03-frontend/README](../03-frontend/README.md), [estructura](../03-frontend/estructura-del-proyecto.md), [rutas](../03-frontend/rutas-y-pantallas.md).
2. [Auth y sesión](../03-frontend/estado-auth-y-sockets.md), [consumo de API](../03-frontend/consumo-de-api.md).
3. **Leer el código de `origin/dev-deploy`/`origin/main`, no de la copia local si está vieja.**
4. Levantar front + back local ([flujo](../04-devops/flujo-fullstack-y-ramas.md)); `npm run test:ci`.
5. [Deuda técnica](../03-frontend/deuda-tecnica.md) y [guía de contribución](../03-frontend/guia-de-contribucion.md).
6. Primera tarea: un ticket pequeño; revisión a 360 px.

## DevOps
1. [04-devops/README](../04-devops/README.md) → [pipeline](../04-devops/pipeline-y-despliegue.md) → [variables y accesos](../04-devops/variables-y-accesos.md).
2. Pedir el traspaso de credenciales a la Scrum Master (nunca por chat) y verificar accesos a GitHub (4 repos), servidor, Docker Hub, Azure.
3. Crear **tu propio `DEPLOY_PAT`** ([§5.F](../04-devops/variables-y-accesos.md)).
4. Leer [riesgos](../04-devops/riesgos-y-deuda.md) (2 P0 abiertos) y los [runbooks](../04-devops/runbook-promocion-a-produccion.md).
5. Verificar un deploy a test con `workflow_dispatch`.
6. Primera tarea: resolver los P0 (eliminar los `main.yml` legados, ya deshabilitados) y confirmar si los históricos están cargados en producción.

## Scrum Master
1. [05-scrum-y-proceso/jira-y-flujo-de-trabajo](../05-scrum-y-proceso/jira-y-flujo-de-trabajo.md), [roles](../05-scrum-y-proceso/roles-y-revisiones.md), [sprints](../05-scrum-y-proceso/sprints-historial.md), [backlog](../05-scrum-y-proceso/backlog-y-epicas.md).
2. [Reglas de negocio](../01-negocio/reglas-de-negocio.md) y [decisiones abiertas](../01-negocio/decisiones-abiertas.md) (P-02 primero).
3. Recibir el [traspaso](../05-scrum-y-proceso/checklist-traspaso-v5.md) y la carpeta de credenciales.
4. Pedir a la Scrum Master saliente el plan y backlog de V4 (el detalle de cada ticket); no está en el repo.
5. Primera tarea: crear Sprint 1 de V5 con lo que quedó abierto ([backlog](../05-scrum-y-proceso/backlog-y-epicas.md#qué-queda-abierto-para-v5-a-5-nov-a-confirmar-en-jira)).

## Reglas de oro para todos
- Nunca subir credenciales, `.env`, dumps ni datos personales a repos, Jira, Discord ni docs compartidos.
- Trabajar siempre sobre la **edición activa**; las anteriores son solo lectura.
- Un cambio de contrato front/back se acuerda por escrito **antes** del push.
- Documentar lo que cambie: actualizar esta carpeta y el [changelog](../06-referencia/changelog-documentacion.md).
