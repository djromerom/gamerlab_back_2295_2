# Contrato de API · HU-22 · Aviso al suplente cuando le asignan grupos

**Para:** Frontend · **De:** Backend (ARK-84)
**Ticket:** HU-22 (ARK-84) · **Estado:** implementado y probado en local (Postgres real y pruebas unitarias); pendiente de PR a `dev` y de migración en `Arkad-test`
Swagger local: `http://localhost:3000/api` (sección *Substitute notices*)

## Qué hace
Cuando el administrador asigna grupos a un **suplente** (asignar o reasignar a mano), el backend registra un aviso **"Te asignaron grupos"** con la lista de grupos y su nivel, y envía un correo por Azure ACS.

- Solo los suplentes reciben aviso (tipo Suplente confirmado en la edición activa, rol Jurado). A los oficiales y a los profesores no se les avisa.
- Una operación que asigna varios grupos al mismo suplente produce **un** aviso con todos.
- El aviso **queda** hasta que el suplente lo marca como leído. Quitar grupos no crea avisos ni borra los que ya existen.
- El correo nunca hace fallar la asignación. Si falla, queda registrado y el aviso en la plataforma sigue activo.
- **"Entendido" del texto explicativo:** lo guarda el **front** (por ejemplo en `localStorage` por usuario y edición). El backend no lo guarda ni tiene ruta para eso. "Entendido" no marca avisos como leídos.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (`credentials: 'include'`).
- **401** sin sesión · **403** el rol no tiene permiso · **404** sin edición activa (`code: "NO_ACTIVE_EDITION"`).
- Horas en ISO 8601 UTC: mostrarlas en hora de Colombia.
- No vienen correos ni datos de integrantes ni de otros jurados.

## Tipos (TypeScript)
```ts
interface SubstituteNoticeTeam {
  teamId: number | null;        // null si el equipo se eliminó después (el resto se conserva)
  teamCode: string;             // "N1-AYP-06"
  teamName: string;
  videogameName: string | null;
  level: number | null;         // 0 = colegios; null si el código no trae nivel
  levelLabel: string;           // "Nivel 1", "Colegios" o "Sin nivel"
}

interface SubstituteNotice {
  id: number;
  createdAt: string;            // cuándo se asignaron
  readAt: string | null;        // null = sin leer
  message: 'Te asignaron grupos';
  teams: SubstituteNoticeTeam[]; // por nivel y luego por código
}

interface MySubstituteNotices {
  edition: { id: number; title: string };
  serverTime: string;
  unreadCount: number;          // sin leer en la edición activa (no cambia con `status`)
  data: SubstituteNotice[];     // primero los sin leer, luego el más reciente
}

type NoticeEmailStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

interface UnreadSubstituteNotices {
  edition: { id: number; title: string };
  serverTime: string;
  totals: { unread: number; jurors: number };
  data: Array<{
    noticeId: number;
    jurorId: string;
    name: string;
    createdAt: string;
    teamCount: number;
    emailStatus: NoticeEmailStatus; // SKIPPED = sin claves de correo (solo en desarrollo)
  }>;
}
```

## Pantallas del suplente (rol Jurado)

### `GET /substitute-notices/me?status=` → 200 `MySubstituteNotices`
Consultar al abrir las pantallas del jurado y **cada 10 s**. Si `data` trae avisos sin leer, mostrar "Te asignaron grupos" con la lista de grupos y su nivel y un botón para ir a **Pendientes por calificar** (`/pendientes-calificar`).

| Parámetro | Valores | Por defecto |
|---|---|---|
| `status` | `unread` (solo sin leer) o `all` (también los leídos) | `unread` |

Un valor distinto responde 400 con el mensaje en `message`. Un jurado oficial también puede llamarla: recibe `data: []` y `unreadCount: 0`. Si falla (sin conexión o 5xx), mantener lo último que se mostró y reintentar en la siguiente consulta.

### `PATCH /substitute-notices/:id/read` → 200 `SubstituteNotice`
Marca el aviso como leído y devuelve el aviso con `readAt`. Repetirlo no cambia la hora.

| Código | Cuándo | Qué hacer |
|---|---|---|
| 200 | Marcado (o ya estaba leído) | Quitar el aviso de la lista de no leídos |
| 400 | `:id` no es un número | — |
| 404 `SUBSTITUTE_NOTICE_NOT_FOUND` | El aviso no existe o no es del usuario | Quitarlo de la pantalla y volver a consultar `GET /substitute-notices/me` |
| Sin conexión / 5xx | — | Dejar el aviso en pantalla y reintentar |

## Panel de seguimiento (Administrador)

### `GET /substitute-notices/unread` → 200 `UnreadSubstituteNotices`
Suplentes de la edición activa con el aviso **sin leer**, el más antiguo primero. Consultar cada **10 s** junto con el resto del panel. Sirve para mostrar "Aviso sin leer" junto al suplente y, con `emailStatus: 'FAILED'`, que el correo no salió (el aviso en la plataforma sigue activo).

## Permisos
| Ruta | Quién |
|---|---|
| `GET /substitute-notices/me`, `PATCH /substitute-notices/:id/read` | Jurado (servicio `ViewOwnSubstituteNotices`). Los profesores nunca son suplentes y no tienen el permiso |
| `GET /substitute-notices/unread` | Administrador (servicio `AssignJurors`, el mismo de la asignación) |

Estudiante, Profesor, Staff y Presentador externo reciben 403 en todas.

## El correo
Asunto "Te asignaron grupos". Lleva solo el nombre del suplente, el mensaje, la tabla de grupos (código, nombre, videojuego y nivel) y un botón a `FRONTEND_URL/pendientes-calificar`. No lleva integrantes, otros jurados ni correos.

## Textos sugeridos
- Aviso: "Te asignaron grupos" · botón "Ver mis grupos".
- Texto explicativo para el suplente (con su "Entendido", guardado en el front): "Eres jurado suplente: si te asignan grupos te avisaremos aquí y por correo. Califícalos desde Pendientes por calificar."
