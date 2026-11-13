# Frontend de ARKAD

> **Audiencia:** Frontend V5 · **Actualizado:** 2026-11-05 · **Estado:** parcial (leído de `origin/main` = producción, commit `5b70d2e`, vía `git show`; **la copia de trabajo local `repo front` está en `main` de mayo-2026 y NO refleja V4**) · **Fuente:** `repo front` (`package.json`, `RoutesConfiguration.tsx`, contextos, `lib/`, workflows)

> **Importante:** para leer el código vigente usa `git show origin/main:<ruta>` (producción) u `origin/dev-deploy` (test). La rama local `main` tiene un commit de mayo de 2026 (`eea8cc4`).

## Stack
| Pieza | Detalle |
|---|---|
| Núcleo | React 19.2.1, Vite ^6.3, TypeScript ~5.7, Tailwind ^4.1 (`@tailwindcss/vite`), plugin React con SWC |
| UI | Radix UI + shadcn (`components.json`, `src/components/ui`), `lucide-react`, `react-icons`, `framer-motion`, `sonner`, `recharts` ^2.15 |
| Formularios y datos | `react-hook-form` + `zod`, `react-router` / `react-router-dom` ^7.5 |
| Tiempo real | `socket.io-client` ^4.8 |
| Otros | `react-player`, `react-image-crop`, `html5-qrcode` (escáner de check-in) y `qrcode.react` (QR), `react-google-recaptcha`, `react-error-boundary` |
| Pruebas | **Vitest** ^4.1 (`npm test`, `test:ci`, `test:watch`): ~52 archivos `*.test.ts(x)` en `origin/main` |
| Build/serve | `npm run build` = `tsc -b && vite build`; producción: imagen nginx (`Dockerfile.prod`) |

Scripts: `dev` (Vite, `:5173`, con headers COOP/COEP `credentialless` para juegos web), `build`, `lint`, `preview`, `test`, `test:ci`, `test:watch`, `check:env`.

## Índice
- [Estructura del proyecto](estructura-del-proyecto.md)
- [Diagnóstico de la estructura (TA-13)](diagnostico-estructura.md)
- [Rutas y pantallas por rol](rutas-y-pantallas.md)
- [Autenticación, estado y sockets](estado-auth-y-sockets.md)
- [Consumo de la API](consumo-de-api.md)
- [Deuda técnica](deuda-tecnica.md)
- [Guía de contribución](guia-de-contribucion.md)

## Variables de entorno (solo nombres)
`VITE_ENDPOINT_BACKEND` (URL del back), `VITE_SITE_KEY` (reCAPTCHA). **Se hornean en el bundle público** al construir la imagen: no son secretos y no se debe poner ninguno ahí. Ver [04-devops/variables-y-accesos](../04-devops/variables-y-accesos.md).

## Cómo correrlo
```bash
npm ci
# .env.local (no se commitea): VITE_ENDPOINT_BACKEND=http://localhost:3000
npm run dev
```
Necesita un backend corriendo ([flujo-fullstack-y-ramas §5](../04-devops/flujo-fullstack-y-ramas.md)). En CORS el back acepta `http://localhost:5173`.
