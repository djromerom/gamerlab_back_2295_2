# Flujo full-stack, ramas y merges

> **Audiencia:** Backend, Frontend, DevOps · **Actualizado:** 2026-11-05 · **Estado:** completo · **Fuente:** `04-ramas-y-contribucion/BRANCHING-back.md`, `BRANCHING-front.md`, `01-pipeline-y-despliegue/notas-devops-features-fullstack.md` (2026-10-24, válido para V4)

## 1. Nomenclatura de ramas
```
<tipo>/<TICKET>-<descripcion-corta>   → feat, fix, hotfix (ticket obligatorio)
<tipo>/<descripcion-corta>            → docs, refactor, chore (ticket opcional)
```
Ejemplos: `feat/ARK-25-exigir-permisos-backend`, `fix/ARK-30-boton-filtro-colgado`, `chore/actualizar-dependencias-eslint`.

Reglas:
1. **Tipo:** `feat` (funcionalidad), `fix` (bug), `docs`, `refactor` (sin cambiar comportamiento), `chore` (dependencias, config, CI), `hotfix` (urgente sobre `main`). Minúscula.
2. **Ticket:** formato `ARK-NN`. En tareas con subtareas se usa el `ARK-NN` de la **subtarea**; la tarea padre no tiene rama (excepción: rama de integración cuando el padre debe llegar completo a `dev`).
3. **Descripción:** minúsculas, kebab-case, sin tildes/ñ/espacios/guion bajo, máx. ~6 palabras.
4. **Sin `/` adicionales** (generan conflictos de refs).
5. **Ramas efímeras:** se borran al mergear el PR.

Ramas de integración: **back `dev`**, **front `dev-deploy`**; producción `main` en ambos.

## 2. Flujo de un PR
`feat|fix|...` desde `dev` / `dev-deploy` → PR hacia esa rama (**nunca a `main` directo**) → revisión (el reviewer fijo en V4 es el usuario GitHub `Santrosherun`; ver [roles y revisiones](../05-scrum-y-proceso/roles-y-revisiones.md)) → **squash merge** → verificación en test → PR de release a `main` (**merge commit**) → verificación en producción. Commits con prefijo (`feat:`, `fix:`…). Migraciones: avisar a DevOps. Sin secretos ni dumps en commits.

| PR | Tipo de merge |
|---|---|
| a `dev` / `dev-deploy` | squash |
| feature → feature (stacked) | squash si la segunda ya no se usa; merge commit si se sigue trabajando |
| promoción `dev` → `main` | **merge commit, nunca squash** |

## 3. Ramas dependientes (feature2 sobre feature1)
1. `feature1` sale de `dev` y abre su PR. `feature2` sale **de `feature1`** y abre su PR a `dev` en **Draft**.
2. **Orden obligatorio: `feature1` entra primero.** Si `feature2` entra antes, el squash arrastra `feature1` sin revisión.
3. Tras el squash de `feature1`, **rebasear** `feature2` (un `merge dev` da conflictos falsos):
```bash
git fetch origin
git rebase --onto origin/dev <ultimo-commit-de-feature1> feature2
git push --force-with-lease
```
4. Alternativa: PR de `feature2` hacia `feature1` (diff limpio) y cambiarlo a `dev` cuando `feature1` entre.

## 4. Features que cruzan front y back
No hay entorno de preview por rama: la única forma de usar lo que hizo el otro antes del merge es **correr su rama en local**.

**Regla base:** nada se mergea a `dev`/`dev-deploy` si depende de algo no mergeado en el otro repo.

1. **Contrato primero:** endpoints, método, payloads, códigos de error y permisos acordados por escrito en el ticket. El front avanza con mocks.
2. **Misma rama en ambos repos** (mismo nombre).
3. **El back publica pronto** (push aunque esté incompleto) y avisa: rama, endpoints, variables nuevas, migraciones/seeds.
4. **El front prueba contra el back en local** (ver §5).
5. **PRs en Draft y enlazados**, con «cómo probar».
6. **Validación cruzada:** el dev del otro lado confirma con un comentario; solo entonces pasan a *Ready for review*.
7. **Merge: back primero, front después**, en la misma ventana. El back debe ser **retrocompatible** (sin borrar/renombrar campos o endpoints en uso; migraciones aditivas). Si no se puede: coordinar con DevOps.
8. **Cambios de contrato a mitad de camino:** actualizar el ticket y avisar **antes** de hacer push. Prohibidos los cambios silenciosos.

## 5. Probar la rama de un compañero en local (front probando back)
Requisitos: Docker Desktop, Git, Node 20+; puertos libres `5432`, `3000`, `3001`, `10000-10002`, `5173`. Copiar `.env.example` a `.env` en el back (valores de desarrollo que entrega DevOps; **no se commitea**) con `FRONTEND_URL=http://localhost:5173` y `PORT=3000`.

```bash
# Back
git fetch origin --prune && git switch feat/ARK-123-descripcion
docker compose -f docker-compose.dev.yml up -d      # db, migrate+seed, gotenberg, azurite, app con hot reload
docker compose -f docker-compose.dev.yml logs -f app-dev
# Front
npm ci && npm run dev                                # .env.local con VITE_ENDPOINT_BACKEND=http://localhost:3000
```
Usa **siempre** `-f docker-compose.dev.yml`: el `docker-compose.yml` sin sufijo es el de producción.

| Situación | Qué hacer |
|---|---|
| Solo cambió código `.ts` | Nada (watch). Si no, `restart app-dev` |
| Trae migraciones nuevas | `docker compose -f docker-compose.dev.yml up migrate-and-seed-dev` y `restart app-dev` |
| Cambió `package.json` o `schema.prisma` | `restart app-dev` |
| Cambias a una rama con menos migraciones | Prisma no revierte: `down -v` y `up -d` (solo borra datos locales) |
| Puerto ocupado | Cerrar el proceso o ver `docker ps` |

No trabajes encima de la rama del compañero: si hallas un bug, avísale o crea tu rama derivada. Para recibir lo nuevo: `git pull --ff-only`.

> PENDIENTE: el apartado del caso inverso (back probando el front de otro) y el checklist final de PR están en la entrega original de DevOps (fuera del repo).

## 6. Pendientes de proceso
- Reglas de protección de rama y `CODEOWNERS`.
- Rulesets de GitHub que restrinjan el tipo de merge por rama.
- Revisar estas notas si aparece un entorno de preview por rama.
