# Guía de contribución (frontend)

> **Audiencia:** Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (convenciones del equipo y de `BRANCHING-front.md`; no existe un `CONTRIBUTING` propio del front) · **Fuente:** `BRANCHING-front.md`, backlog §8, workflows

## Ramas y PR
- Ramas desde **`dev-deploy`** (test); `main` solo recibe promociones de `dev-deploy` con **merge commit**. Nomenclatura `<tipo>/<ARK-NN>-descripcion`. Todo detalle en [flujo-fullstack-y-ramas](../04-devops/flujo-fullstack-y-ramas.md).
- PR a `dev-deploy` con **squash**, reviewer fijo `Santrosherun`. Nunca merge directo a `dev-deploy` ni `main`.
- Features que cruzan back y front: contrato por escrito, misma rama en ambos repos, back primero.

## Antes de abrir el PR
1. `npm ci`, `npm run build` (incluye `tsc -b`), `npm run test:ci`, `npm run lint` (aunque en CI no bloquee).
2. Revisar la pantalla a **360 px** de ancho (sin scroll horizontal) y con las distintas edades de datos (edición activa vs. histórica).
3. Notas con 2 decimales; textos en español; «suplente» (no «remanente»).
4. Nada de secretos ni `.env` en el commit; variables nuevas: `.env.example`, `Dockerfile`, `Dockerfile.prod` y `deploy-front.yml` ([variables-y-accesos §5.A](../04-devops/variables-y-accesos.md)).
5. Archivo de menos de 500 líneas; lógica en hooks, vistas separadas. Copia el checklist de [estructura](estructura-objetivo-y-convenciones.md#cómo-se-mantiene-el-orden) en la descripción del PR.

## Convenciones
- Dónde va cada archivo y cómo se nombra: [estructura objetivo y convenciones](estructura-objetivo-y-convenciones.md) (TA-14), con `src/features/<dominio>/`.
- Alias `@/…`; componentes UI de `components/ui` (shadcn/Radix); formularios con `react-hook-form` + `zod` (`lib/schemas.ts`).
- Llamadas a la API con `apiFetch`, no `fetch` directo, y **desde `features/<dominio>/api/`**, nunca desde una página o componente ([consumo-de-api](consumo-de-api.md)).
- Pruebas con Vitest junto al código (`*.test.ts(x)`); poner en `lib/` la lógica pura para probarla fácil.
- Rutas nuevas: [rutas-y-pantallas](rutas-y-pantallas.md) (lista `routes`, menú, rol).
- Commits con prefijo: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.

## Probar con el back de un compañero
[flujo-fullstack-y-ramas §5](../04-devops/flujo-fullstack-y-ramas.md): checkout de su rama del back, `docker compose -f docker-compose.dev.yml up -d`, `.env.local` con `VITE_ENDPOINT_BACKEND=http://localhost:3000`, `npm run dev`.

## CI (`Test-front`, en PR a `dev-deploy` y `main`)
`check:env` (aviso) → `npm ci` → `npm run build` (bloqueante) → `eslint .` (aviso) → `npm run test:ci` (**bloqueante**).

## Despliegue
Push a `dev-deploy` → imagen `frontend_dev` → test; push a `main` → `Dockerfile.prod` → `frontend_prod` → producción ([pipeline](../04-devops/pipeline-y-despliegue.md)). Las `VITE_*` se hornean al construir.

> PENDIENTE: un `README` del repo front con estos pasos (hoy es la plantilla de Vite); canal de dudas en Discord (nombre por confirmar).
