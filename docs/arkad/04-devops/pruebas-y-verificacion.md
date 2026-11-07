# Pruebas y verificación

> **Audiencia:** DevOps, Backend, QA · **Actualizado:** 2026-11-05 · **Estado:** parcial (índice con resumen; el detalle está en la entrega de Santiago) · **Fuente:** `05-referencia-promociones-y-pruebas/*`, `verificacion/` en la raíz del proyecto

## Pruebas automáticas
| Dónde | Estado |
|---|---|
| Back (Jest) | Unit y e2e en `test/`; specs de BD con `RUN_DB_TESTS=1`. TA-10 (Hecho): corrida del 2026-11-05 sobre `origin/main` = 1313 pruebas pasan, 77 omitidas (BD), 0 fallan. Ver [02-backend/pruebas](../02-backend/pruebas.md) |
| CI del back (`Test-back`, en PR a `dev`/`main`) | build, lint (`continue-on-error`), `npm run test:ci`, integración contra Postgres 15 efímero (migrate, seed, e2e y `*.db.spec.ts`) |
| Front | Vitest (~52 archivos `*.test.ts(x)` en `origin/main`). `Test-front` ejecuta build y `npm run test:ci` como checks **bloqueantes**; lint y `check:env` con `continue-on-error`. Ver [03-frontend/deuda-tecnica](../03-frontend/deuda-tecnica.md) |
| `npm run check:env` | Valida `.env.example`; corre en CI con `continue-on-error` |

## Scripts de verificación (`verificacion/` en la raíz del proyecto, fuera de los repos)
`api_archivar_edicion.js`, `api_edicion_y_multimedia.js`, `carga_y_reintentos.js`, `movil_360px.js`, `permisos_por_rol.sh`. Verifican la API de ediciones y multimedia, carga y reintentos, vista móvil a 360 px y permisos por rol.
Cómo se ejecutan (leído de los propios scripts; los scripts viven en la carpeta `verificacion/` del equipo, fuera del repo):
- Todos apuntan a una **copia local**: back en `http://localhost:3100` y front en `http://localhost:5173`. **Nunca contra producción** (el `.sh` lo dice expresamente).
- Requieren el backend con datos de prueba y los usuarios del seed con contraseña de pruebas y `metodo_auth = PASSWORD`.
- Los `.js` usan **Playwright** (`npm install` en esa carpeta y `node <script>.js`); `permisos_por_rol.sh` usa `curl` (`bash permisos_por_rol.sh`).
- Qué prueba cada uno: `api_archivar_edicion.js` (activar y archivar ediciones, incluido archivar dos veces), `api_edicion_y_multimedia.js` (BG-01 y edición/multimedia por rol), `carga_y_reintentos.js` (HU-05/HU-06: back lento, reintento ante 503, refresh tras 401), `movil_360px.js` (pantallas del jurado a 360 px), `permisos_por_rol.sh` (matriz de permisos por rol).
> A CONFIRMAR: no están en ningún repo ni en el pipeline; algunos asumen datos y rutas del seed (p. ej. `/jurado`, que hoy redirige a `/inicio`). Revisarlos antes de reutilizarlos.

## Guiones y registros de la entrega de Santiago
| Documento | Qué contiene |
|---|---|
| pruebas-arkad-test-2026-11-04.md | Guion en 4 bloques para verificar test, con consultas de solo lectura |
| prueba-entrega-correos-acs.md | Correos de Azure ACS (TA-05 / ARK-22): llegaron a bandeja en Uninorte, Gmail y Outlook. Se añadió `withRetry` (3 intentos). El modo simulación solo aplica en `development`. Riesgo: el reenvío distingue mayúsculas en el correo. **Pendiente: verificar SPF/DKIM en el portal de Azure** |
| revision-filtros-feria-nrc-2026-10-30.md | Revisión de filtros por feria y NRC: bugs A (NRC asignados por código sin filtrar por edición), B (opciones de filtro duplicadas), C (listado y exportación del panel de profesores con reglas distintas), D (falta único de NRC). Incluye consultas de auditoría para test/prod |

## Verificación posterior a un despliegue
Ver [runbook de promoción §4](runbook-promocion-a-produccion.md).
