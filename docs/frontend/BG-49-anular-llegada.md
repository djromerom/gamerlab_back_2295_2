# Contrato de API · BG-49 · Anular la llegada de un jurado

**Para:** Camilo Acevedo (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-239 / ARK-251 · **Rama backend:** `fix/ARK-251-annul-juror-arrival` · **Estado:** implementado y probado en local (pruebas unitarias y de integración contra Postgres); pendiente de PR a `dev` y de migración en `Arkad-test`
Swagger local: `http://localhost:3000/api` (sección *Juror attendance*)

## Qué hace
En la mesa de escarapelas, tocar un resultado en `/check-in-jurados` registra la llegada al instante, y el escáner puede leer el QR del jurado de al lado. Hasta ahora una llegada registrada por error no se podía deshacer y cambiaba la alerta de inasistencia (HU-12) y la presencia (HU-23).

Con esta ruta el **Administrador** anula una llegada:
- La llegada **no se borra**: queda guardada como anulada, con quién la anuló, cuándo y el motivo (si lo escribió).
- El jurado vuelve a **«Sin check-in»** (`MISSING`) en la asistencia (`GET /juror-attendance`), la alerta de inasistencia (HU-12), la presencia (HU-23, «Sigo aquí» vuelve a responder 409 hasta que llegue de nuevo), la búsqueda del check-in (`checkedInAt: null`), la contingencia de suplentes (HU-14) y los recordatorios push de llegada (HU-37).
- Después se puede registrar otra vez la llegada (por QR o por nombre) como si fuera la primera: responde `CHECKED_IN`, no `ALREADY_CHECKED_IN`.

## Roles y permisos
- Solo **Administrador** (servicio nuevo `AnnulJurorArrival`).
- **Staff** recibe **403**: puede ver la asistencia y registrar llegadas, pero no anularlas. Estudiante, Profesor, Jurado y Presentador externo, también 403.
- En la tabla de `/asistencia-jurados`, mostrar el botón «Anular llegada» solo al Administrador (el Staff también entra a esa página).

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (enviar con `credentials: 'include'`).
- Errores con el formato de Nest más un `code` en los errores de negocio: `{ "statusCode": 409, "code": "ARRIVAL_ALREADY_ANNULLED", "message": "..." }`. En los **400** de validación del cuerpo, `message` es una **lista** de textos.
- **401**: sin sesión · **403**: el rol no tiene permiso.
- Las fechas vienen en ISO 8601 UTC: mostrarlas en hora de Colombia.
- No vienen correos.

## Cambio en `GET /juror-attendance` (HU-29)
Cada fila trae un campo nuevo, `attendanceId`: el id de la llegada **activa** del jurado, o `null` si no ha llegado. Es el id que se manda a la ruta de anular. Nada más cambia en esa ruta.

```ts
interface JurorAttendanceItem {
  jurorId: string;
  attendanceId: number | null; // NUEVO (BG-49): null si status es MISSING
  name: string;
  category: 'Senior' | 'Junior' | 'Sin categoría';
  isProfessor: boolean;
  hasBadge: boolean;
  status: 'PRESENT' | 'MISSING';
  checkedInAt: string | null;
  method: 'QR' | 'MANUAL' | null;
  checkedInBy: { id: string; name: string } | null;
}
```

## Tipos (TypeScript)
```ts
interface AnnulJurorArrivalBody {
  reason?: string; // opcional, máx. 500 caracteres; vacío o solo espacios = sin motivo
}

interface PersonRef {
  id: string;
  name: string; // "Nombre Apellido"
}

interface AnnulledArrival {
  attendanceId: number;
  edition: { id: number; title: string };
  juror: PersonRef;
  checkedInAt: string;          // ISO UTC: la hora de la llegada que se anuló
  method: 'QR' | 'MANUAL';
  checkedInBy: PersonRef;       // quién registró la llegada (Staff o admin)
  annulledAt: string;           // ISO UTC: hora del servidor al anular
  annulledBy: PersonRef;        // el administrador que anuló
  annulmentReason: string | null;
  jurorStatus: 'MISSING';       // el jurado vuelve a «Sin check-in»
}
```

## Ruta: `PATCH /juror-attendance/:attendanceId/annul`
- `attendanceId`: el de la fila de `GET /juror-attendance`.
- Body opcional (se puede mandar `{}` o nada).

```json
// PATCH /juror-attendance/31/annul
{ "reason": "El escáner leyó el QR del jurado de al lado" }
```

```json
// → 200
{
  "attendanceId": 31,
  "edition": { "id": 5, "title": "ARKAD 2026-30" },
  "juror": { "id": "5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01", "name": "Ana Pérez" },
  "checkedInAt": "2026-11-26T13:05:12.000Z",
  "method": "QR",
  "checkedInBy": { "id": "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03", "name": "Staff Mesa 1" },
  "annulledAt": "2026-11-26T13:20:40.000Z",
  "annulledBy": { "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c04", "name": "Admin Arkad" },
  "annulmentReason": "El escáner leyó el QR del jurado de al lado",
  "jurorStatus": "MISSING"
}
```

| Código | `code` | Cuándo | Qué mostrar |
|---|---|---|---|
| 200 | — | Anulada | Aviso «Se anuló la llegada de {juror.name}» y volver a consultar la tabla: la fila pasa a Falta |
| 400 | — | `attendanceId` no es un número, o `reason` no es texto o pasa de 500 caracteres | El texto de `message` |
| 400 | `EDITION_READ_ONLY` | La llegada es de una edición que no es la activa | El texto de `message` |
| 401 | — | Sin sesión | Ir al inicio de sesión |
| 403 | — | No es Administrador (por ejemplo, Staff) | «Solo el administrador puede anular una llegada» |
| 404 | `ATTENDANCE_NOT_FOUND` | No existe esa llegada | «No se encontró la llegada»; volver a consultar la tabla |
| 409 | `ARRIVAL_ALREADY_ANNULLED` | Ya estaba anulada (doble clic u otro administrador la anuló antes) | «Esta llegada ya estaba anulada»; volver a consultar la tabla |

## Notas de UI
- **Confirmar antes de anular**: un diálogo con el nombre del jurado, la hora de llegada y quién la registró, y un campo de texto opcional para el motivo (máx. 500). Botones «Anular llegada» y «Cancelar».
- Deshabilitar el botón mientras la petición está en curso (evita el 409 por doble clic).
- Tras el 200, la fila cambia a Falta en la siguiente consulta (la tabla ya se refresca cada 10 s; conviene pedirla de inmediato).
- Si el jurado sí está en la feria, la mesa registra la llegada correcta después (por QR o por nombre) y queda como una llegada nueva, con hora nueva.
- La parte de **confirmar antes de registrar** en `/check-in-jurados` es solo del front: el back no cambia `POST /juror-checkin/scan` ni `/manual`.
- Hoy no hay una ruta para ver el historial de llegadas anuladas: queda guardado en la base de datos. Si lo necesitan en pantalla, avisar y se agrega.
