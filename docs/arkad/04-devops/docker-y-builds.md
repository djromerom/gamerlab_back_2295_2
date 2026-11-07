# Docker, compose y builds

> **Audiencia:** DevOps, Backend, Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (resumen; verificar detalles en los Dockerfiles) · **Fuente:** `TA-02-docker-compose-build.md` (ARKAD-13), Dockerfiles y compose de `repo back` y `repo front`

## Back
- **Dockerfile** multi-stage sobre `node:20-alpine`: etapas `deps`, `dev`, `builder`, `prod-deps` y producción (instala `postgresql-client`). Expone 3000; entrypoint `entrypoint.sh`; `CMD node dist/src/main.js`.
- **`docker-compose.yml`** (producción-like): `db`, `migrate-and-seed`, `gotenberg` (3001), `app`. Trae una contraseña de BD de desarrollo en claro dentro del archivo: usar solo en local.
- **`docker-compose.dev.yml`** (desarrollo): `db`, `migrate-and-seed-dev`, `gotenberg`, `azurite` (10000-10002) y `app-dev` con hot reload y Swagger (`:3000/api`). **Monta el código del repo como volumen.** Construye la imagen `arkad-back-dev:local`.
- Build con SWC (`nest start -b swc`).

## Front
- **`Dockerfile`** (test) y **`Dockerfile.prod`** (multi-stage `node:22.11.0` → `nginx:1.25.2-alpine`). Reciben `VITE_ENDPOINT_BACKEND` y `VITE_SITE_KEY` como build secrets (horneadas en el bundle).
- **`nginx.conf`:** `client_max_body_size 500M`, `try_files` hacia `/index.html`, caché de estáticos por 6 meses.
- En desarrollo se usa Vite **sin Docker** (`npm ci && npm run dev`, `:5173`, con headers COOP/COEP `credentialless` para juegos web).

## Optimización de builds (TA-02, mergeada el 2026-10-31: back #201, front #210)

| Métrica del back | Antes | Después |
|---|---|---|
| Build en frío | 204.6 s | 163.6 s (−20 %) |
| Rebuild tras cambio de código | 93.6 s | 65.5 s (−30 %) |
| Tamaño de imagen | 1.12 GB | 782 MB |
| Compose dev en caliente | 178.7 s | 37.7 s |

Cambios: `.dockerignore`, `npm ci`, etapa `prod-deps`, `prisma` movido a `dependencies`, target `dev` sin `npm install`, caché `type=gha` en CI. El front no cambió localmente; su mejora está en la caché de capas en CI.
> PENDIENTE: medir el segundo deploy con la caché llena.

## Dev local rápido
Ver [flujo-fullstack-y-ramas §5](flujo-fullstack-y-ramas.md). Resumen: en el back `docker compose -f docker-compose.dev.yml up -d`; en el front `npm ci && npm run dev`.

## Producción en el servidor
Los contenedores los crean los workflows receptores (ver [pipeline](pipeline-y-despliegue.md)). El `.env` vive en el servidor; ver [variables y accesos](variables-y-accesos.md).

Lo que se sabe de los receptores (según Santiago, `contexto-devops-arkad`): `test-deploy.yml` / `prod-deploy.yml` hacen `docker pull` y `docker run` por SSH; **no compilan**. Defectos conocidos: hacen `docker stop/rm` **antes** del `pull` (si el tag falla, el ambiente queda caído; invertir el orden), no tienen `concurrency` y el `docker run` tiene `--network` repetido.

> PENDIENTE (requiere acceso): el comando exacto de `docker run` (redes, `--env-file`, reinicio) vive en el repo receptor del back y en `openlabun/Arkad-Front`, **que la cuenta de GitHub usada en esta documentación no puede ver** (`gh` no resuelve `openlabun/Arkad-Front`). Debe completarlo quien tenga acceso a esos repos (DevOps V5 o el administrador del repo openlab), copiando la sección `docker run` de ambos workflows (sin los secretos).
