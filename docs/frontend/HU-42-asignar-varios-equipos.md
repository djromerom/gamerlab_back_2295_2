# Contrato de API · HU-42 · Asignar varios equipos a un jurado

**Para:** Frontend (Jorge, ARK-276) · **De:** Backend (ARK-275)
**Ticket:** HU-42 (ARK-274) · **Estado:** implementado y probado en local (Postgres real y pruebas unitarias); pendiente de PR a `dev`. No trae migración ni permisos nuevos.
Swagger local: `http://localhost:3000/api` (sección *Juror*)

## Qué hace
En el diálogo «Asignar equipo» (Jurados) el administrador marca **uno o varios equipos** para un jurado y los asigna con un solo botón.

- Cada equipo pasa por las **mismas reglas de HU-08** que `POST /juror/assignments`.
- **Los equipos que fallan no frenan a los demás.** Un equipo bloqueado queda sin asignar y sale en el resultado con su motivo; los otros se asignan.
- Las **advertencias** se piden juntas: sin `confirmWarnings: true` el back responde 409 y no guarda nada (es el «Cancelar»); con `confirmWarnings: true` guarda («Continuar»). Se calculan solo sobre los equipos que sí se van a asignar.
- **Todo o nada al guardar:** todos los equipos válidos van en una transacción. Si se pierde la conexión o falla algo, no se asigna ninguno (500) y se puede reintentar.
- Una fila de bitácora por equipo y **un solo** aviso push al jurado (no uno por equipo). Si el jurado es suplente, recibe un solo aviso de HU-22 con todos sus equipos. El front no tiene que hacer nada para eso.
- `POST /juror/assignments` (un solo equipo) **no cambia**.

## Autenticación y errores generales
- Sesión por cookie HttpOnly `access-token` (`credentials: 'include'`).
- Solo **Administrador** (servicio `AssignJurors`, el mismo de asignar y reasignar). **401** sin sesión · **403** cualquier otro rol.
- **404** sin edición activa (`code: "NO_ACTIVE_EDITION"`) o jurado inexistente.

## `POST /juror/assignments/bulk` → 200

### Cuerpo
```ts
interface BulkAssignBody {
  jurorId: string;           // jurado o profesor
  teamIds: number[];         // 1 a 50 equipos, sin repetir
  confirmWarnings?: boolean; // true = guardar aunque haya advertencias de HU-08
}
```

### Respuesta 200
```ts
type BulkTeamStatus = 'ASSIGNED' | 'ASSIGNED_WITH_WARNINGS' | 'BLOCKED';

interface BulkTeamResult {
  equipoId: number;
  codigo: string | null;      // "N1-AYP-06"; null si el equipo no existe o es de otra edición
  nombre: string | null;
  videojuego: string | null;
  estado: BulkTeamStatus;
  advertencias: Warning[];    // las que se aceptaron para este equipo (vacío si no hubo o si no se asignó)
  cantidadJurados: number | null; // jurados del equipo después de asignar; null si no se asignó
  bloqueo: { code: string; message: string } | null; // solo con estado BLOCKED
}

interface BulkAssignResponse {
  message: string;            // "Se asignaron 2 equipos al jurado. 1 equipo no se asignó por un bloqueo."
  edicion: { id: number; title: string };
  jurado: { id: string; nombre: string };
  resultados: BulkTeamResult[]; // en el mismo orden de teamIds
  totales: { solicitados: number; asignados: number; bloqueados: number };
  advertenciasAceptadas: Warning[]; // todas, sin repetir por equipo
}
```
Ejemplo (2 asignados, uno con advertencia aceptada, y 1 bloqueado):
```json
{
  "message": "Se asignaron 2 equipos al jurado. 1 equipo no se asignó por un bloqueo.",
  "edicion": { "id": 5, "title": "Feria Gamer 2026-30" },
  "jurado": { "id": "d4e5f6a7-b8c9-4123-d456-678901234567", "nombre": "Ana Pérez" },
  "resultados": [
    { "equipoId": 12, "codigo": "N1-AYP-06", "nombre": "Los Pixeles", "videojuego": "Pixel Quest",
      "estado": "ASSIGNED", "advertencias": [], "cantidadJurados": 3, "bloqueo": null },
    { "equipoId": 15, "codigo": "N1-AYP-07", "nombre": "Byte Club", "videojuego": "Byte Run",
      "estado": "ASSIGNED_WITH_WARNINGS",
      "advertencias": [{ "code": "JUROR_OVER_LIMIT", "message": "El jurado senior Ana Pérez quedaría con 4 grupos; el máximo recomendado es 3 por jurado.", "jurorId": "d4e5f6a7-b8c9-4123-d456-678901234567" }],
      "cantidadJurados": 4, "bloqueo": null },
    { "equipoId": 18, "codigo": "N0-COLEGIOS-01", "nombre": "Colegio Demo", "videojuego": "Demo",
      "estado": "BLOCKED", "advertencias": [], "cantidadJurados": null,
      "bloqueo": { "code": "SCHOOL_REQUIRES_SENIOR", "message": "Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0). Los colegios solo los califican jurados senior (profesores)." } }
  ],
  "totales": { "solicitados": 3, "asignados": 2, "bloqueados": 1 },
  "advertenciasAceptadas": [{ "code": "JUROR_OVER_LIMIT", "message": "…", "jurorId": "d4e5f6a7-b8c9-4123-d456-678901234567" }]
}
```

### Si todos los equipos quedan bloqueados
Responde **200** igual, con todos los `resultados` en `BLOCKED`, `totales.asignados = 0` y `message: "No se asignó ningún equipo: 3 equipos tienen un bloqueo."`. No se guarda ni se avisa nada. La pantalla de resultados es la misma; **no** es un error (no uses el camino de `!res.ok`).

### `bloqueo.code` (por equipo)
| `code` | Cuándo |
|---|---|
| `TEAM_NOT_FOUND` | El equipo no existe o está inactivo |
| `EDITION_READ_ONLY` | El equipo es de una edición que no es la activa |
| `TEAM_NOT_CONFIRMED` | La inscripción del equipo no está confirmada (Pendiente o Rechazado) |
| `TEAM_NOT_GRADABLE` | Es un presentador externo (no se califica) |
| `DUPLICATE_ASSIGNMENT` | El jurado ya está asignado a ese equipo |
| `SCHOOL_REQUIRES_SENIOR` | Jurado junior en un colegio (nivel 0) |
| `UNREADABLE_TEAM_LEVEL` | El código del equipo no tiene el formato `N<número>-…` |

`bloqueo.message` ya viene en español, listo para mostrar.

## Respuestas de error de toda la petición (no se asigna nada)

### 409 `ASSIGNMENT_WARNINGS` (advertencias sin confirmar)
Mismo 409 de `POST /juror/assignments`, con la lista de equipos que **no** se asignarán (para mostrarlos antes de «Continuar»):
```json
{
  "statusCode": 409,
  "code": "ASSIGNMENT_WARNINGS",
  "message": "La asignación rompe reglas de asignación. Confirma para continuar:\n- El jurado senior Ana Pérez quedaría con 5 grupos; el máximo recomendado es 3 por jurado.",
  "warnings": [
    { "code": "JUROR_OVER_LIMIT", "message": "…", "jurorId": "d4e5f6a7-…", "details": { "teams": 5, "maximum": 3, "teamIds": [3, 5, 7, 12, 15] } }
  ],
  "blocked": [
    { "teamId": 18, "codigo": "N0-COLEGIOS-01", "code": "SCHOOL_REQUIRES_SENIOR", "message": "…" }
  ]
}
```
`warnings[].code`: `JUROR_OVER_LIMIT`, `JUROR_MIXED_LEVELS`, `TEAM_UNDER_MIN`, `NRC_CONFLICT`, `VALIDATION_UNAVAILABLE` (los mismos de HU-08). Las que traen `teamId` son de ese equipo; las que no (por ejemplo «más de 3 grupos») valen para todos. **«Continuar»** = reenviar el mismo cuerpo con `confirmWarnings: true`. **«Cancelar»** = no hacer nada: el back no guardó nada.
`blocked` puede venir vacío. `codigo` puede ser `null` si el equipo no existe.

### 400 (el problema es del jurado, no de un equipo)
Cuerpo `{ "statusCode": 400, "code": "...", "message": "..." }`:
- `EVALUATOR_NOT_IN_EDITION`: el jurado no participa en la edición activa (no está confirmado en Jurados de la edición, o el profesor no tiene un NRC activo).
- `MISSING_JUROR_CATEGORY`: el jurado no tiene categoría (Junior/Senior).
- `INVALID_EVALUATOR_ROLE` / mensaje «El usuario debe ser un jurado o un profesor.»
- Validación del cuerpo: `message` es una lista de textos en español (sin equipos, repetidos, más de 50, id que no es número).

### 500
`"No se pudieron asignar los equipos. Se revirtió todo y no cambió ninguna asignación."` Se puede reintentar.

## Cómo usarlo en el diálogo (propuesta)
1. Casillas con buscador y nivel visibles (`GET /juror/:id/teams` ya trae `nivel`, `nivelEtiqueta` y `teamCode`).
2. «Asignar» → `POST /juror/assignments/bulk` con `confirmWarnings` omitido.
3. Si responde **409** `ASSIGNMENT_WARNINGS`: mostrar `warnings` juntas (y `blocked`, si hay) con «Continuar» (reenviar con `confirmWarnings: true`) y «Cancelar».
4. Si responde **200**: mostrar `resultados` equipo por equipo (asignado / con advertencia aceptada / bloqueado con su motivo) y recargar la lista.
5. Con un solo equipo marcado se puede seguir usando `POST /juror/assignments`; no cambió.
