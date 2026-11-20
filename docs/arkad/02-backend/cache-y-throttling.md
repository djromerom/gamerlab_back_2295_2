# Caché y límites de peticiones

> **Audiencia:** Backend, DevOps · **Actualizado:** 2026-11-05 · **Estado:** completo (verificado en `public-throttle.ts`, `role-permission.guard.ts`, `app.module.ts`) · Cubre el hueco que dejó la entrega de DevOps.

## Límites de peticiones (`@nestjs/throttler`)
- `ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])` global, pero **solo cuenta en rutas con `@PublicThrottle`/`@LoginThrottle`**; el valor por defecto se sobreescribe por ruta.
- Límites (`PUBLIC_LIMITS` en `src/common/throttle/public-throttle.ts`):

| Ruta/uso | Límite |
|---|---|
| Subida de imágenes | 60 por minuto |
| Subida de `.zip` | 3 por 10 min |
| `validate-emails`, `validate-student-codes` | 15 por minuto |
| Login | 10 por minuto por **IP + correo normalizado**, y además 100 por minuto por IP (contra credential stuffing) |
| `reset-password` | 5 por 10 min |
| `resend-confirmation` | 5 por 10 min |
| Récords de los minijuegos (HU-52): `GET /minigame-records` | 300 por minuto |
| Récords de los minijuegos (HU-52): `POST /minigame-records` | 20 por minuto |

Generosos a propósito: muchos estudiantes se registran desde la red de la universidad y comparten IP pública.

### Advertencias
- **El almacenamiento es en memoria**, por proceso: reiniciar o redesplegar pone todo en cero; con N réplicas cada una cuenta aparte. Está bien con un solo contenedor (hoy). Si se escala, mover los contadores a Redis con un `ThrottlerStorage` en `app.module.ts` (fuera de alcance de V4).
- Detrás de proxy hay que poner **`TRUST_PROXY`** (ej. `1`); si no, el límite se aplica a la IP del proxy. Está definido en test y prod (`TRUST_PROXY=1`).
- Para una ruta pública nueva: `@Public()` + `@PublicThrottle(PUBLIC_LIMITS.<x>)`.

## Caché
- `CacheModule` / `CacheService` (`get`, `set`, `delete`) sobre `@nestjs/cache-manager`, **en memoria** (se pierde al reiniciar).
- Lo usa `RolePermissionGuard` con tres TTL configurables (minutos): `CACHE_SERVICE_CONFIG_TTL_MINUTES` (120), `CACHE_USER_PERMISSIONS_TTL_MINUTES` (60), `CACHE_PERMISSION_CHECK_TTL_MINUTES` (30). También se cachea el perfil de usuario (`USER_PROFILE_CACHE_TTL`).
- **Consecuencia operativa:** cambiar permisos/roles por migración no se ve hasta que venza el TTL o se reinicie el contenedor. Hacerlo en la ventana de despliegue (recrear el contenedor ya limpia la caché).
- Cambiar el rol de un usuario puede tardar hasta el TTL en reflejarse en los permisos cacheados.

Quién usa la caché (`origin/main`): `auth/auth.service.ts` (perfil del usuario; `USER_PROFILE_CACHE_TTL`, **15 min** por defecto), `auth/guards/role-permission.guard.ts` (permisos por rol/servicio) y `reports/reports.controller.ts` (resultados de reportes, vía `CACHE_MANAGER`). Es caché **en memoria del proceso**: con más de una instancia cada una tendría la suya y se vacía al reiniciar el contenedor.
