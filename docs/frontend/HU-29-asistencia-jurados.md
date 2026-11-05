# Contrato de API · HU-29 · Asistencia de los jurados de la edición

**Para:** Rafael (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-152 (backend) / ARK-153 (frontend) · **Rama backend:** `feat/ARK-152-juror-attendance` · **Estado:** implementado y probado en local (migración contra Postgres y pruebas unitarias e integración); pendiente de PR a `dev` y de migración en `Arkad-test`
Swagger local: `http://localhost:3000/api` (sección *Juror attendance*)

## Qué hace
Lista **todos los jurados de la edición activa** (externos confirmados y profesores de la edición, la misma definición que usan las escarapelas y el check-in) con su estado:
- **Presente** (`PRESENT`): ya se registró su llegada en la mesa de escarapelas (HU-11), con la hora, el método (QR o manual) y quién la registró.
- **Falta** (`MISSING`): todavía no tiene registro de llegada.

Trae también los totales (presentes, faltantes y total) para las pestañas o los contadores de la página. Es solo lectura: para registrar llegadas se sigue usando `POST /juror-checkin/scan` y `/manual`.

## Roles y permisos
- **Administrador** y **Staff** (servicio nuevo `ViewJurorAttendance`).
- Estudiante, Profesor y Jurado reciben **403**.
- Ver la lista no da permiso de registrar llegadas: son permisos distintos.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (enviar con `credentials: 'include'`).
- Errores con el formato de Nest: `{ "statusCode": 404, "message": "...", "error": "Not Found" }`. En los **400** de validación, `message` es una **lista** de textos.
- **401**: sin sesión · **403**: el rol no tiene permiso.
- `checkedInAt` viene en ISO 8601 UTC: mostrarlo en hora de Colombia.
- No vienen correos, códigos ni teléfonos (a propósito: Staff también ve la página).

## Tipos (TypeScript)
```ts
type AttendanceStatus = 'PRESENT' | 'MISSING';

interface JurorAttendanceItem {
  jurorId: string;
  name: string;                 // "Nombre Apellido"
  category: 'Senior' | 'Junior' | 'Sin categoría'; // todo profesor es Senior
  isProfessor: boolean;
  hasBadge: boolean;            // tiene escarapela activa en la edición
  status: AttendanceStatus;
  checkedInAt: string | null;   // ISO UTC; null si falta
  method: 'QR' | 'MANUAL' | null;
  checkedInBy: { id: string; name: string } | null; // quién registró la llegada (Staff o admin)
}

interface JurorAttendanceResult {
  edition: { id: number; title: string };
  totals: { present: number; missing: number; total: number };
  data: JurorAttendanceItem[];
  metadata: {
    totalItems: number;         // filas que cumplen búsqueda + estado
    itemsOnCurrentPage: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
  };
}
```

## Ruta: `GET /juror-attendance`
Query (todo opcional):
| Parámetro | Valores | Por defecto |
|---|---|---|
| `status` | `PRESENT` o `MISSING` | todos |
| `search` | nombre o apellido, 2 a 50 caracteres; no distingue tildes ni mayúsculas; cada palabra debe coincidir | sin búsqueda |
| `page` | entero ≥ 1 | 1 |
| `limit` | 1 a 100 | 50 |

**Orden** (lo hace el servidor): primero los que **faltan**, por apellido y nombre; luego los **presentes**, el último en llegar arriba. Así, al escanear una escarapela, la fila que cambió queda a la vista al comienzo de los presentes.

**Totales:** `totals` respeta `search` pero **no** `status`, para que las pestañas "Presentes (42) / Faltan (71)" no cambien al pasar de una a otra. `metadata.totalItems` sí respeta los dos filtros.

```json
// GET /juror-attendance?page=1&limit=50  → 200
{
  "edition": { "id": 5, "title": "ARKAD 2026-30" },
  "totals": { "present": 42, "missing": 71, "total": 113 },
  "data": [
    {
      "jurorId": "7a1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c02",
      "name": "Luis Gómez",
      "category": "Junior",
      "isProfessor": false,
      "hasBadge": false,
      "status": "MISSING",
      "checkedInAt": null,
      "method": null,
      "checkedInBy": null
    },
    {
      "jurorId": "5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01",
      "name": "Ana Pérez",
      "category": "Senior",
      "isProfessor": true,
      "hasBadge": true,
      "status": "PRESENT",
      "checkedInAt": "2026-11-26T13:05:12.000Z",
      "method": "QR",
      "checkedInBy": { "id": "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03", "name": "Staff Mesa 1" }
    }
  ],
  "metadata": { "totalItems": 113, "itemsOnCurrentPage": 50, "currentPage": 1, "itemsPerPage": 50, "totalPages": 3 }
}
```

| Código | Cuándo | Qué mostrar |
|---|---|---|
| 200 | Hay edición activa (puede traer `data: []` y totales en 0) | La tabla; si está vacía, "No hay jurados para este filtro" (o "La edición no tiene jurados confirmados" si `totals.total` es 0 sin búsqueda) |
| 400 | `status`, `search`, `page` o `limit` no válidos | El texto de `message` |
| 401 | Sin sesión | Ir al inicio de sesión |
| 403 | Rol sin permiso | "No tienes permiso para ver la asistencia de los jurados" |
| 404 | No hay edición activa (`code: "NO_ACTIVE_EDITION"`) | "No hay una feria activa" |

## Notas de UI
- **Se actualiza sin recargar:** consultar cada **10 s**, como el seguimiento por hora (HU-21). Si una consulta falla, mantener la última tabla y mostrar un aviso sin vaciar la pantalla. No hay socket.
- Columnas sugeridas: nombre, categoría (y una marca si `isProfessor`), estado, hora de llegada (hora de Colombia), método, registrado por. `hasBadge: false` sirve para avisar "sin escarapela" (llegada solo manual).
- Pestañas o filtro Todos / Presentes / Faltan con los números de `totals`.
- La búsqueda se manda al servidor (con un pequeño retraso al escribir); la página vuelve a 1 al cambiar la búsqueda o el estado.
- Un jurado que no es de la edición (pendiente, declinó o sin NRC) no aparece aunque tenga un registro viejo.
- Para probar: escanear una escarapela en la página de check-in y ver que, en la siguiente consulta, la fila pasa a Presente con la hora y el nombre de quien la registró.

## Preguntas para Frontend
1. ¿Les sirve el límite de 100 por página o prefieren pedir todo de una vez para filtrar en el cliente? (El tope de 100 es el general de la API).
2. ¿Necesitan Oficial/Suplente en la tabla? Hoy no viene porque los profesores no tienen esa marca; se puede agregar en HU-12 si hace falta.
3. ¿Quieren exportar el listado (extra del ticket)? No está en esta versión.
