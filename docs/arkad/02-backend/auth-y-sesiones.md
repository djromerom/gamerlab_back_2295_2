# Autenticación, sesiones y permisos

> **Audiencia:** Backend, Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (verificado en `auth.service.ts`, guards y `main.ts`; falta Entra ID en detalle) · **Fuente:** `src/auth/**`

## Rutas (`@Controller('auth')`)
`POST login` · `GET outlook-login` y `GET callback` (Microsoft Entra ID) · `POST refresh` · `POST logout` · `POST reset-password` · `POST set-password` · `POST resend-confirmation` · `GET verify-token` · `POST reset-token-expiration` · `GET me`.

## Sesión
- **Cookies HttpOnly** `sameSite: 'lax'`, `secure` salvo que `NODE_ENV === 'development'`.
  - Cookie de acceso: `path: '/'`, vida = `ACCESS_TOKEN_EXPIRATION_MINUTES` (por defecto **15 min**).
  - Cookie de refresh: path restringido (`REFRESH_TOKEN_COOKIE_PATH`), vida = `REFRESH_TOKEN_EXPIRATION_DAYS` (por defecto **7 días**). Se limpia también la ruta antigua (`LEGACY_REFRESH_TOKEN_COOKIE_PATH`) porque el navegador envía primero la de ruta más larga.
- **Refresh tokens** (tabla `refresh_token`): se guarda solo el **sha256**, nunca el token; se **rotan** en cada refresh; motivos de revocación `ROTATED` (con ventana de gracia para reintentos del front), `LOGOUT` y `REUSE` (sin gracia). El logout revoca el refresh pero **no** el access token (muere solo a los 15 min). (Decisión I3 del 30-oct.)
- El front renueva el access token en segundo plano **5 min antes de que venza** (con el token de 15 min, cada 10 min; HU-05) y reintenta a los 30 s si falla. Ver [03-frontend](../03-frontend/estado-auth-y-sockets.md).
- Los tiempos de token (JWT `exp` y `maxAge` de las cookies) salen de una sola fuente, `src/auth/token-expiration.ts`, que lee `ACCESS_TOKEN_EXPIRATION_MINUTES` y `REFRESH_TOKEN_EXPIRATION_DAYS`; ya no están escritos fijos en el flujo de Microsoft (verificado en `origin/main`, 2026-11-05).
- `AuthMethod`: `PASSWORD` o `ENTRA_ID`; campo `microsoftOid` en `User`.
- Cuentas nuevas (jurados, staff): se registra el correo con el rol y la persona completa la cuenta por correo (token de verificación, tabla `token_verificacion`; `set-password`).

## Autorización
1. **`JwtAuthGuard` global** (`APP_GUARD`): toda ruta exige sesión salvo `@Public()`.
2. **`@UseGuards(RolePermissionGuard)` + `@RequiredService('<Servicio>')`**: busca el servicio, sus permisos requeridos y si el rol del usuario los tiene. **El rol con nombre `ADMIN_ROLE_NAME` (por defecto `Administrador`) pasa siempre.** Si la ruta no declara `@RequiredService`, el guard lanza 500 («Configuration Error»). Un servicio **sin permisos asignados queda abierto a cualquier usuario con sesión** (ver [roles-y-permisos](../01-negocio/roles-y-permisos.md)).
3. Otros guards: `AdminRoleGuard`, `OptionalJwtAuthGuard` (sesión opcional), `PendingGamesGuard`. Decoradores: `@GetUser`, `@IsAdmin`, `@UserOrGuestId`.
4. **Caché de permisos** en memoria con TTL configurable: servicio 120 min, permisos de usuario 60 min, chequeo 30 min (por defecto). Variables `CACHE_SERVICE_CONFIG_TTL_MINUTES`, `CACHE_USER_PERMISSIONS_TTL_MINUTES`, `CACHE_PERMISSION_CHECK_TTL_MINUTES`. **Tras una migración de permisos hay que reiniciar el backend o esperar el TTL.** Ver [cache-y-throttling](cache-y-throttling.md).

## Cómo proteger una ruta nueva
```ts
@Get('algo')
@UseGuards(RolePermissionGuard)
@RequiredService('NombreDelServicio')
```
Y crear por **migración** el servicio y su permiso, y asignarlo a los roles (no hay UI de roles). Añadir una prueba de que los roles sin permiso reciben 403. Para ruta pública: `@Public()` **y** `@PublicThrottle(...)` ([cache-y-throttling](cache-y-throttling.md)); revisar que no devuelva datos personales (BG-02).

## Verificar el estado real
`npm run routes:inventory` genera el inventario de rutas con su nivel de acceso; úsalo como fuente de verdad en vez de esta tabla.

## Datos personales
Correos de jurados/estudiantes y lectura de equipos ajenos estuvieron expuestos (BG-01, BG-02, BG-06, BG-07). Utilidades: `strip-personal-data.ts`, `omit-password.ts`, `team-visibility.ts`; prueba `public-routes-personal-data.spec.ts`.
