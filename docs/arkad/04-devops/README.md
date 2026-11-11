# DevOps — visión general

> **Audiencia:** DevOps V5 (y quien haga de DevOps) · **Actualizado:** 2026-11-05 · **Estado:** completo salvo el `docker run` exacto de los receptores (ver [docker-y-builds](docker-y-builds.md)) · **Fuente:** entrega de Santiago (ARK-48), `contexto-devops-arkad.md`

## Qué hace DevOps en ARKAD
Pipeline CI/CD, despliegues en test y producción, base de datos (migraciones, históricos, respaldos), servidor, custodia técnica de accesos y documentación. Santiago Díaz fue DevOps de la V4 y sucedió a Carlos Morales (V3).

## Sistema en una tabla

| Pieza | Detalle |
|---|---|
| Back | NestJS + Prisma + PostgreSQL 15. Gotenberg (PDF de certificados), Azure Blob/Azurite (archivos), Azure Communication Services (correo). Auth JWT en cookies HttpOnly |
| Front | React 19 + Vite 6 + TypeScript + Tailwind 4. Producción: build + nginx (puerto 80 del contenedor) |
| Repos origen | `djromerom/gamerlab_back_2295_2` y `djromerom/gamerlab_front_2295_2` |
| Ramas back | `dev` (test) → `main` (producción) |
| Ramas front | `dev-deploy` (test) → `main` (producción) |
| Servidor | Servidor OpenLab, **compartido con ~15 proyectos más**. Acceso SSH por llave |
| Imágenes | Docker Hub, un solo repo para todo (ver [pipeline](pipeline-y-despliegue.md)) |

## Índice
1. [Pipeline y despliegue](pipeline-y-despliegue.md): cómo llega un merge a producción.
2. [Docker y builds](docker-y-builds.md): Dockerfiles, compose, dev local.
3. [Variables y accesos](variables-y-accesos.md): dónde vive cada secreto, custodia, rotación, `DEPLOY_PAT`.
4. [Base de datos: operación](base-de-datos-operacion.md): migraciones, ensayo, históricos, respaldo.
5. [Runbook: promoción a producción](runbook-promocion-a-produccion.md).
6. [Runbook: incidentes frecuentes](runbook-incidentes.md).
7. [Riesgos y deuda técnica](riesgos-y-deuda.md).
8. [Flujo full-stack y ramas](flujo-fullstack-y-ramas.md).
9. [Pruebas y verificación](pruebas-y-verificacion.md).

## Lo primero que debe hacer un DevOps nuevo
1. Pedir a la Scrum Master el traspaso de credenciales ([variables-y-accesos §4](variables-y-accesos.md)). **Nunca por chat.**
2. Confirmar que tiene acceso de colaborador a los repos del back y front, y al repo receptor del front (`openlabun/Arkad-Front`).
3. Crear **su propio** `DEPLOY_PAT` y cargarlo en back y front (el actual vence el **2026-12-19**; ver [§5.F](variables-y-accesos.md)).
4. Leer [riesgos y deuda](riesgos-y-deuda.md): hay dos P0 abiertos.
5. Levantar el entorno local ([docker-y-builds](docker-y-builds.md)).

## Deuda DevOps heredada de V3
Buenas prácticas del `.env` de producción, limpieza de jobs de GitHub Actions, dumps históricos, tests unitarios y de integración, documentación de arranque/pipeline/BD/servidor.

## Lo que sigue sin cubrir
- Límites de `@nestjs/throttler` y caché de permisos: ya documentados en [02-backend/cache-y-throttling](../02-backend/cache-y-throttling.md) (se mantiene la advertencia de que ambos son **en memoria**).
- Guía de arranque actualizada: [flujo-fullstack-y-ramas](flujo-fullstack-y-ramas.md) y los README de [backend](../02-backend/README.md) y [frontend](../03-frontend/README.md). La de V3 (`arkad_docs/.../0_version_starting.md`) está desactualizada; no usarla.
- Diagrama de despliegue: el de V3 (`Depoyment_Diagram.png`) está desactualizado porque el flujo real **no** tiene aprobación formal en producción; vale el de [arquitectura-general](../00-inicio-rapido/arquitectura-general.md) y [pipeline-y-despliegue](pipeline-y-despliegue.md).
