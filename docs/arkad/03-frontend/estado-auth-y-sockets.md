# Autenticación, estado global y sockets

> **Audiencia:** Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (`AuthContext`, `lib/session.ts`, `SocketContext`, `MultiFormContext` leídos en `origin/main`; `TextSizeContext` sin leer) · **Fuente:** `src/contexts/*`, `src/lib/session.ts`

## Contextos
| Contexto | Qué hace |
|---|---|
| `AuthContext` | `user` (perfil de `GET /auth/me`), `loading`, login/logout, renovación de sesión. Al cargar pide el perfil; mientras `loading` el router muestra `LoadingScreen` |
| `SocketContext` | Una conexión `socket.io` única (singleton) a `VITE_ENDPOINT_BACKEND`, `withCredentials: false`; expone `socket` e `isConnected`. Lo usan los likes (`useLikesSocket`) |
| `MultiFormContext` | Paso actual del formulario de registro (`next`, `back`, `reset`, `initialStep` restaurado del borrador) |
| `TextSizeContext` | Tamaño de texto (accesibilidad) |
| `fetchs/grupo 1/GlobalStateContext` | Estado global de criterios |

## Sesión (HU-05, HU-06)
- Cookies HttpOnly del backend; el front **no** guarda el token en `localStorage`.
- **Renovación programada** (`lib/session.ts`): se renueva el access token **5 min antes de vencer** (`REFRESH_MARGIN_MS`); con el token de 15 min, cada **10 min**. Si el backend no envía `accessTokenExpiresIn`, se asume 15 min. Si un token dura menos que el margen, renueva a la mitad de su vida. Reintento a los **30 s** si el refresh falla por red/servidor.
- Si el backend rechaza el refresh token (401/403), `apiFetch` lanza `SessionRejectedError` y emite el evento global `auth:session-expired` (`SESSION_EXPIRED_EVENT`) → cierre de sesión.
- Un 401 en una petición que no es de `/auth/` provoca **un** intento de refresh y la repetición de la petición original.
- Refresh en un solo vuelo: peticiones simultáneas no disparan varios refresh (ver `lib/api.ts` y `api.test.ts`).
El `setInterval` fijo de 14 minutos de la copia local de mayo ya no existe en `main` (un comentario en `AuthContext.tsx` lo deja anotado): lo reemplazó la renovación programada.

## Sockets
Los sockets **solo se usan para los likes** de los videojuegos: `useLikesSocket` emite `subscribe:likes` / `unsubscribe:likes` y escucha `likes:updated`; `GameDetailModal` también escucha `likes:updated`. No hay sockets en seguimiento ni asistencia.

Esas pantallas usan **sondeo (polling)**: `RealtimeTrackingPanel` recarga cada `REFRESH_SECONDS` (según el backlog, 10 s) y `useJurorAttendance` cada `pollMs`. Los demás `setInterval` son de animaciones (confeti, carrusel, cuenta regresiva, créditos).

## Borradores y persistencia local
- Registro de equipos: borrador en `sessionStorage` (BG-11).
- Calificación por lote: los borradores se guardaban en el navegador solo en la pantalla por lote y la de colegios; **el autoguardado en servidor (HU-18, Sprint 3) y BG-27 (el progreso se pierde al recargar) siguen pendientes** según el plan.
