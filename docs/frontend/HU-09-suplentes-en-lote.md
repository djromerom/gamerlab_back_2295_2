# Contrato de API · HU-09 · Suplentes en lote

**Para:** Frontend (Camilo, ARK-216) · **De:** Backend (ARK-215)
**Ticket:** HU-09 (ARK-29) · **Estado:** implementado y probado en local (Postgres real y pruebas unitarias); pendiente de PR a `dev`. No trae migración ni permisos nuevos.
Swagger local: `http://localhost:3000/api` (sección *Juror*)

## Qué hace
El administrador elige **uno o varios jurados** (los que no llegaron) y **uno o varios suplentes**. En una sola operación, cada suplente queda asignado a **todos** los grupos que esos jurados tienen hoy en la edición activa.

- **Se suma, no se quita.** Los jurados originales conservan sus grupos y las evaluaciones que ya hicieron. Un grupo puede quedar con más de 3 jurados.
- Si el suplente ya estaba en uno de esos grupos, ese grupo se **omite** sin error (sale en `equiposYaAsignados`). Repetir la operación no duplica nada.
- Los grupos sin confirmar o no calificables no reciben jurados: se omiten y salen en `equiposNoAsignables`.
- Se aplican las reglas de HU-08 a **todos** los pares nuevos a la vez: un bloqueo frena toda la operación; las advertencias piden confirmación (el mismo 409 y el mismo diálogo de asignar a mano).
- **Todo o nada:** pares, bitácora y avisos van en una transacción. Si algo falla, no cambia ninguna asignación.
- Cada suplente recibe **un** aviso de HU-22 («Te asignaron grupos») con todos sus grupos nuevos, más el correo. El front no tiene que hacer nada para eso.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (`credentials: 'include'`).
- Solo **Administrador** (servicio `AssignJurors`, el mismo de asignar y reasignar). **401** sin sesión · **403** cualquier otro rol.
- **404** sin edición activa (`code: "NO_ACTIVE_EDITION"`).

## `POST /juror/assignments/substitutes/bulk` → 200

### Cuerpo
```ts
interface BulkSubstituteAssignmentBody {
  jurorIds: string[];        // jurados cuyos grupos se cubren: 1 a 20, sin repetir
  substituteIds: string[];   // suplentes que reciben los grupos: 1 a 10, sin repetir
  confirmWarnings?: boolean; // true = guardar aunque haya advertencias de HU-08
}
```
- `jurorIds`: jurados o profesores (cuenta activa). No hace falta que sigan confirmados en la edición: lo que se cubre son sus grupos de la edición activa.
- `substituteIds`: deben ser **suplentes** de la edición activa: rol Jurado, tipo Suplente y estado Confirmado en *Jurados de la edición*. Para el selector, usar `GET /juror?participating=true` (trae el tipo de la edición) y quedarse con los de `jurorType: 'BACKUP'` que no son profesores (`isProfessor: false`).
- Un mismo id no puede estar en las dos listas.

### Respuesta 200
```ts
interface TeamSummary {
  id: number;
  codigo: string;   // "N1-AYP-06"
  nombre: string;
}

interface BulkSubstituteAssignmentResult {
  message: string;                       // texto listo para mostrar
  edicion: { id: number; title: string };
  suplentes: Array<{
    id: string;
    nombre: string;
    equiposAgregados: TeamSummary[];     // grupos nuevos de este suplente
    equiposYaAsignados: TeamSummary[];   // ya los tenía: se omitieron
  }>;
  juradosCubiertos: Array<{
    id: string;
    nombre: string;
    equiposCubiertos: number;            // grupos asignables de ese jurado en la edición activa
  }>;
  juradosSinGrupos: Array<{ id: string; nombre: string }>; // no tienen grupos en la edición activa
  equiposNoAsignables: Array<TeamSummary & {
    motivo: 'TEAM_NOT_CONFIRMED' | 'TEAM_NOT_GRADABLE';
  }>;
  totales: {
    equiposCubiertos: number;            // grupos distintos que se cubrieron (sin repetir)
    asignacionesAgregadas: number;       // pares suplente-grupo nuevos
    asignacionesOmitidas: number;        // pares que ya existían
  };
  advertenciasAceptadas: AssignmentWarning[]; // las que se confirmaron (vacío si no hubo)
}
```
Si no había nada nuevo (los suplentes ya tenían todos esos grupos) responde **200** con `asignacionesAgregadas: 0`, el mensaje «No había asignaciones nuevas…» y no crea avisos. No es un error.

### Ejemplo
```http
POST /juror/assignments/substitutes/bulk
Content-Type: application/json

{ "jurorIds": ["d4e5f6a7-…"], "substituteIds": ["a1b2c3d4-…"] }
```
```json
{
  "message": "Se agregaron 3 asignaciones de suplentes en 3 grupos. Nadie perdió grupos.",
  "edicion": { "id": 5, "title": "Feria 2026-2" },
  "suplentes": [
    {
      "id": "a1b2c3d4-…",
      "nombre": "Laura Gómez",
      "equiposAgregados": [
        { "id": 12, "codigo": "N1-AYP-06", "nombre": "Pixel Hunters" },
        { "id": 15, "codigo": "N1-AYP-09", "nombre": "Code Knights" },
        { "id": 18, "codigo": "N1-AYP-11", "nombre": "Byte Me" }
      ],
      "equiposYaAsignados": []
    }
  ],
  "juradosCubiertos": [{ "id": "d4e5f6a7-…", "nombre": "Ana Pérez", "equiposCubiertos": 3 }],
  "juradosSinGrupos": [],
  "equiposNoAsignables": [],
  "totales": { "equiposCubiertos": 3, "asignacionesAgregadas": 3, "asignacionesOmitidas": 0 },
  "advertenciasAceptadas": []
}
```

## Advertencias: 409 `ASSIGNMENT_WARNINGS` (flujo alterno)
Mismo cuerpo que en `POST /juror/assignments`, así que sirve el diálogo que ya existe:
```json
{
  "statusCode": 409,
  "code": "ASSIGNMENT_WARNINGS",
  "message": "La asignación rompe reglas de asignación. Confirma para continuar:\n- El jurado junior Laura Gómez quedaría con 6 grupos; el máximo recomendado es 3 por jurado.",
  "warnings": [
    {
      "code": "JUROR_OVER_LIMIT",
      "message": "El jurado junior Laura Gómez quedaría con 6 grupos; el máximo recomendado es 3 por jurado.",
      "jurorId": "a1b2c3d4-…",
      "details": { "teams": 6, "maximum": 3, "teamIds": [12, 15, 18, 21, 24, 27] }
    }
  ]
}
```
1. Mostrar la lista `warnings` (cada una trae su `message`) y pedir confirmación.
2. Si el administrador confirma, **reenviar el mismo cuerpo** con `confirmWarnings: true`. Si cancela, no hacer nada: no se guardó nada.

Las advertencias posibles aquí son `JUROR_OVER_LIMIT` (el suplente queda con más de 3 grupos, lo normal si cubre a dos jurados), `JUROR_MIXED_LEVELS` (grupos de distintos niveles), `NRC_CONFLICT` y `VALIDATION_UNAVAILABLE`. Que un grupo quede con más de 3 jurados **no** advierte nada.

## Errores
| Código HTTP | `code` | Cuándo | Qué hacer |
|---|---|---|---|
| 400 | (sin `code`, `message` es una lista) | Cuerpo inválido: listas vacías, repetidos, más de 20 jurados o 10 suplentes | Mostrar `message` |
| 400 | `SUBSTITUTE_IS_COVERED_JUROR` | El mismo usuario está en las dos listas (`ids`) | Quitarlo de una de las dos |
| 400 | `NOT_AN_EVALUATOR` | Algún jurado a cubrir no existe, está inactivo o no es jurado ni profesor (`jurorIds`) | Recargar la lista de jurados |
| 400 | `NOT_A_SUBSTITUTE` | Algún suplente no es Suplente confirmado de la edición activa (`substituteIds`) | Recargar la lista; marcarlo como Suplente en *Jurados de la edición* |
| 400 | `NO_TEAMS_TO_COVER` | Ningún jurado elegido tiene grupos asignables en la edición activa | Mostrar `message` |
| 400 | Bloqueo de HU-08: `SCHOOL_REQUIRES_SENIOR`, `MISSING_JUROR_CATEGORY`, `UNREADABLE_TEAM_LEVEL`… | Un par nuevo rompe una regla que no se puede saltar (por ejemplo, suplente junior y un grupo de colegios). Trae `teamId` y `jurorId` | Mostrar `message`; `confirmWarnings` no lo salta |
| 404 | `NO_ACTIVE_EDITION` | No hay edición activa | — |
| 409 | `ASSIGNMENT_WARNINGS` | Hay advertencias sin confirmar | Ver la sección anterior |
| 500 | — | Falló al guardar: se revirtió todo | Mostrar «No se pudo asignar a los suplentes. No cambió ninguna asignación.» y permitir reintentar |

En todos los errores **no se guarda nada**.

## Después de guardar
- Refrescar la tabla de asignación (`GET /juror/evaluation-tracking`) y la de evaluadores.
- Los suplentes ven el aviso «Te asignaron grupos» con la consulta de HU-22 (`GET /substitute-notices/me`, cada 10 s) y reciben el correo.
- La bitácora (`GET /juror/assignments/audit?action=ASSIGN`) muestra una fila por par con la nota «Suplente en lote desde módulo admin (HU-09). Cubre a …».

## Textos sugeridos
- Botón: «Asignar suplentes» · título del diálogo: «Cubrir jurados con suplentes».
- Ayuda: «Los suplentes se suman a todos los grupos de los jurados elegidos. Nadie pierde grupos y las evaluaciones hechas se conservan.»
- Resumen: usar `message` y, por suplente, «N grupos nuevos» (`equiposAgregados.length`) y «M ya los tenía» (`equiposYaAsignados.length`). Si `equiposNoAsignables` o `juradosSinGrupos` traen algo, mostrarlo como nota.
