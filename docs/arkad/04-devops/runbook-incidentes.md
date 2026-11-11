# Runbook: incidentes frecuentes

> **Audiencia:** DevOps · **Actualizado:** 2026-11-05 · **Estado:** parcial (solo incidentes ya ocurridos) · **Fuente:** `contexto-devops-arkad.md`, `variables-y-accesos.md`, promociones

## DEPLOY_PAT
**Síntoma:** `docker-image` en verde, pero `test-dispatch`/`prod-dispatch` falla (`Bad credentials` 401 o `Not Found` 404) y el servidor no se actualiza.
**Causas:** token vencido/revocado; secreto cargado en un solo repo (incidente 2026-10-28: `Deploy-back` falló desde el 2026-10-24 porque el token nuevo solo estaba en el front); el dueño del token perdió acceso a los repos receptores; `REPO_DISPATCH_TARGET` mal escrito.
**Solución:** [variables-y-accesos §5.F](variables-y-accesos.md). Después, relanzar el run.

## La imagen se publicó pero el servidor no cambió
1. Mirar el job de dispatch (arriba).
2. Mirar que el workflow receptor (`Test_deploy_back`, `Deploy-dev-front`, `Prod_deploy_back`, `Deploy-prod-front`) haya corrido en el repo receptor.
3. Ojo: el receptor del back y del front reciben **el mismo nombre de evento**; si un receptor no filtra por sufijo de tag, puede reaccionar al tag equivocado (riesgo P1).

## Cambié el `.env` y no se nota
`docker restart` **no** relee el `.env`. Hay que **recrear** el contenedor o volver a desplegar.

## Una migración falló pero la app arrancó
`entrypoint.sh` corre `prisma migrate deploy` sin `set -e`. Revisar siempre el log del contenedor y `_prisma_migrations` tras desplegar. Nunca editar una migración ya mergeada.

## Se cayó producción tras un push a `main` en un repo receptor
Sospechar de `main.yml` legado (back: detiene `arkad-api`; front: detiene `arkadn` en el puerto 5035). Desde el 2026-11-10 están deshabilitados en ambos receptores (siguen en el repo; ver [riesgos P0](riesgos-y-deuda.md)); si alguien los reactivó, vuelven a ser la causa más probable. Recrear el contenedor con la última imagen buena `sha-<7>-api_prod` / `-frontend_prod`.

## Producción quedó caída por un tag que no existe
Los receptores hacen `docker stop/rm` **antes** de `docker pull`: si el pull falla, el ambiente queda caído. Recrear manualmente con la imagen anterior (etiquetas `arkad-rollback/*` si existen).

## Puerto o memoria ocupados en el servidor
Servidor compartido con ~15 proyectos: mirar `docker ps` y el uso antes de levantar nada. **Nunca `docker system prune`.**

## Backend en desarrollo local: puerto 5432 ocupado
Un Postgres local de Windows puede ocupar el 5432 (pgAdmin se conectó por `localhost:5433`). Cambiar el puerto publicado en el compose local.

## Pendiente
Ver logs (en el servidor, por SSH): `docker ps` para los nombres y `docker logs --tail 200 -f <contenedor>`; nombres y puertos en [pipeline-y-despliegue](pipeline-y-despliegue.md).

> PENDIENTE (requiere acceso): el comando exacto con que el receptor recrea el contenedor; ver [docker-y-builds](docker-y-builds.md#producción-en-el-servidor). Hasta entonces, para recuperar un ambiente, **re-ejecutar el workflow de despliegue con el tag anterior** (`workflow_dispatch`) en lugar de armar el `docker run` a mano.
