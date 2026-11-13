# Deuda técnica del frontend

> **Audiencia:** Frontend, DevOps, Scrum · **Actualizado:** 2026-11-05 · **Estado:** parcial (hallazgos de la exploración y de documentos de DevOps; no auditado a fondo) · **Fuente:** `repo front`, `TA-02`, `ark-43-seguimiento.md`, backlog Épica VII

| Tema | Detalle | Acción sugerida |
|---|---|---|
| Supabase y página de mantenimiento | Resuelto en ARK-175 (10-nov): se retiraron `src/supabase/client.ts`, `@supabase/supabase-js`, `MaintenancePage` y las variables `VITE_SUPABASE_*` y `VITE_MAINTENANCE_*`. Si se necesita un modo mantenimiento, se diseña de nuevo | Ninguna |
| Carpetas «grupo N» | Reparto heredado de equipos de V3, con espacios en el nombre; son la mitad del código del front ([diagnóstico](diagnostico-estructura.md), H1) | Épica VII (TA-13..15): reorganizar de forma incremental, un módulo a la vez, al tocarlo por otra tarea |
| **Zona horaria del navegador** | Las horas de las ediciones se guardan y muestran con la zona del navegador (`buildISODateTime` en `src/fetchs/editions.ts`, `isoToDate`, `isoToTime`, `formatTime` en `InformationPage.tsx`, `formatEditionDate`) | Fijar `America/Bogota` (BG-34, ARK-157); ver [ediciones](../01-negocio/ediciones.md#horas-de-las-ediciones-y-zona-horaria) |
| README genérico | Resuelto el 6-nov: el README del repo ya no es la plantilla de Vite | Mantenerlo al día |
| Dependencias sin uso | Candidatas: `@radix-ui/themes`, `dotenv`, `react-error-boundary` (verificar), `@types/js-cookie` | Retirar tras confirmar con `grep` (TA-02) |
| **Lint** | `eslint .` corre en CI con `continue-on-error`: la deuda actual impide hacerlo bloqueante | Limpiar y quitar `continue-on-error` |
| `check:env` | En CI también con `continue-on-error` (aviso) | Pasarlo a obligatorio tras un sprint limpio |
| `JuradosAssignment.tsx` (~1960 líneas) | Duplica `apiFetch` y el refresh de sesión; difícil de probar | Dividir y reutilizar `lib/api.ts` (junto con BG-33) |
| Archivos > 500 líneas | Regla del equipo incumplida en 22 archivos al 13-nov ([diagnóstico](diagnostico-estructura.md)) | Refactor aparte |
| Sin entorno de preview por rama | Para probar el front con el back de un compañero hay que correr su rama en local | Ver [flujo-fullstack-y-ramas](../04-devops/flujo-fullstack-y-ramas.md) |
| Rol «Consultor» | Resto sin uso (rutas a `/inicio`) | Retirar del tipo `Role` cuando sea seguro |
| Build por ambiente | `VITE_*` se hornean: test aprobado no garantiza el build de prod | Conocido (P2 de DevOps) |
| `VITE_SITE_KEY_TEMP` en prod | Mismo par de reCAPTCHA en test y prod | Confirmar y separar |
| Pendientes funcionales | HU-18/BG-27 (autoguardado y pérdida de progreso al recargar), HU-20/HU-30 (nota final), HU-12/13/23 (asistencia/alertas), HU-14/22/09/24 (suplentes) | Ver [backlog](../05-scrum-y-proceso/backlog-y-epicas.md) |

## Estado de pruebas
Hay ≈52 pruebas Vitest en `origin/main` y el workflow `Test-front` ejecuta `npm run test:ci` como **check bloqueante** (lint y `check:env` con `continue-on-error`). Cobertura desigual: sobre todo `lib/`, `hooks/`, `fetchs/` y algunas páginas. (La copia local de mayo no tiene pruebas; no te guíes por ella.)

## Cosas que NO son deuda pero sorprenden
- `@/` es alias a `src/`; `RoutesConfiguration` exporta `routes` (la usa su test).
- Los juegos web (Pygame/Unity/Godot) se cargan con `GamePlayerPage` + `useGameLoader`; el servidor Vite añade COOP/COEP `credentialless`; navegadores soportados sin definir (P-23, SP-03).
