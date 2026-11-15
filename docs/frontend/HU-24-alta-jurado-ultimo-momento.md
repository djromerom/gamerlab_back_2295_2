# Contrato de API · HU-24 · Alta de jurado de último momento y asignación automática de grupos

**Para:** Camilo Acevedo (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-217 (backend) / ARK-218 (frontend) · **Rama backend:** `feat/ARK-217-walk-in-juror` · **Estado:** el **alta** (`POST /walk-in-jurors`) está implementada y probada en local (unitarias, Postgres real y e2e por HTTP), pendiente de PR a `dev` y de la migración en `Arkad-test`. La **sugerencia y asignación de grupos** va en un segundo PR: su contrato está al final, ya acordado, para que se pueda maquetar.
Swagger local: `http://localhost:3000/api` (sección *Walk-in jurors*)

## Qué hace
El administrador registra en un solo paso a un jurado que llegó a la feria sin estar registrado:

- Pide solo **nombre, apellido y correo**. El jurado queda siempre **Junior y Suplente**; la pantalla no debe ofrecer categoría ni tipo (si se envían, el backend los descarta).
- Queda **Confirmado en la edición activa**, marcado como «alta el día de la feria» (`walkIn`) y con su **llegada registrada** (manual, a nombre del administrador). No tiene escarapela ni QR.
- Todo se guarda junto o no se guarda nada. Después se envía el correo para crear la contraseña; si el envío falla, el jurado queda creado y se reenvía con la ruta que ya existe (`POST /juror/resend-confirmation`).
- Si el **correo ya existe**, no se crea nada ni se cambia a esa persona: la respuesta trae quién es para ofrecer el siguiente paso.
- Si hay jurados o profesores con un **nombre parecido** (sin tildes ni mayúsculas), la respuesta trae la lista y el administrador decide.

## Roles y permisos
- Solo **Administrador** (servicio nuevo `ManageWalkInJurors`).
- Staff, Profesor, Jurado, Estudiante y Presentador externo reciben **403**. El Staff sigue marcando llegadas con QR o por nombre, pero no da de alta.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (enviar con `credentials: 'include'`).
- Errores con el formato de Nest. En los **400** de validación, `message` es una **lista** de textos en español.
- **401**: sin sesión · **403**: el rol no tiene permiso · **404** con `code: "NO_ACTIVE_EDITION"`: no hay edición activa.
- Los **409** de esta ruta traen `code`; distinguirlos por `code`, no por el texto de `message`.
- Las fechas vienen en ISO 8601 UTC: mostrarlas en hora de Colombia.
- Las personas existentes vienen **sin correo**.

## Tipos (TypeScript)
```ts
interface CreateWalkInJurorBody {
  firstName: string;        // solo letras, espacios, guion y apóstrofo; máx. 100
  lastName: string;         // igual
  email: string;            // máx. 150; se guarda en minúsculas
  confirmSimilar?: boolean; // true = «no es ninguna de las coincidencias, créalo»
}

interface WalkInJurorCreated {
  juror: {
    id: string;
    name: string;           // "Laura Gómez Ruiz"
    email: string;
    category: 'JUNIOR';     // siempre
    type: 'BACKUP';         // siempre (Suplente)
  };
  edition: { id: number; title: string };
  attendance: { checkedInAt: string; method: 'MANUAL' };
  walkIn: true;
}

/** Persona que ya existe (409). Sin correo. */
interface ExistingPerson {
  id: string;
  name: string;
  role: string;                 // "Jurado", "Profesor", "Estudiante", "Staff"...
  isActive: boolean;
  isJurorOfEdition: boolean;    // es jurado de la edición activa: se le puede marcar la llegada
  editionStatus: 'PENDING' | 'CONFIRMED' | 'DECLINED' | null; // su fila en Jurados de la edición
  checkedInAt: string | null;   // null = todavía no tiene llegada
}

interface EmailAlreadyExistsError {
  statusCode: 409;
  code: 'EMAIL_ALREADY_EXISTS';
  message: string;
  existing: ExistingPerson;
}

interface SimilarPeopleError {
  statusCode: 409;
  code: 'SIMILAR_PEOPLE';
  message: string;
  matches: ExistingPerson[];    // máximo 10, por apellido
}
```

## Ruta: `POST /walk-in-jurors`
Body:
```json
{ "firstName": "Laura", "lastName": "Gómez Ruiz", "email": "laura.gomez@ejemplo.com" }
```

**201**
```json
{
  "juror": {
    "id": "a1b2c3d4-e5f6-4789-a012-345678901234",
    "name": "Laura Gómez Ruiz",
    "email": "laura.gomez@ejemplo.com",
    "category": "JUNIOR",
    "type": "BACKUP"
  },
  "edition": { "id": 5, "title": "ARKAD 2026-30" },
  "attendance": { "checkedInAt": "2026-11-26T14:12:05.000Z", "method": "MANUAL" },
  "walkIn": true
}
```

**409 `EMAIL_ALREADY_EXISTS`**
```json
{
  "statusCode": 409,
  "code": "EMAIL_ALREADY_EXISTS",
  "message": "Ese correo ya es de Laura Gómez Ruiz (Jurado), que es jurado de «ARKAD 2026-30». No se creó nada: marca su llegada.",
  "existing": {
    "id": "d4e5f6a7-b8c9-4123-d456-678901234567",
    "name": "Laura Gómez Ruiz",
    "role": "Jurado",
    "isActive": true,
    "isJurorOfEdition": true,
    "editionStatus": "CONFIRMED",
    "checkedInAt": null
  }
}
```

**409 `SIMILAR_PEOPLE`**
```json
{
  "statusCode": 409,
  "code": "SIMILAR_PEOPLE",
  "message": "Ya hay una persona con un nombre parecido: Laura María Gómez Ruiz (Jurado). Si es la misma, usa la que existe; si no, confirma para crear al jurado.",
  "matches": [
    {
      "id": "d4e5f6a7-b8c9-4123-d456-678901234567",
      "name": "Laura María Gómez Ruiz",
      "role": "Jurado",
      "isActive": true,
      "isJurorOfEdition": true,
      "editionStatus": "CONFIRMED",
      "checkedInAt": null
    }
  ]
}
```

| Código | Cuándo | Qué mostrar |
|---|---|---|
| 201 | Se creó el jurado, quedó inscrito y con llegada | Confirmación con el nombre y la hora de llegada, y el botón «Asignar grupos automáticamente» (segundo PR) |
| 400 | Nombre o apellido vacío o con números, correo inválido | Los textos de `message` junto a cada campo |
| 401 | Sin sesión | Flujo normal de sesión vencida |
| 403 | No es Administrador | «No tienes permiso» (la pantalla no debería verse con otro rol) |
| 404 `NO_ACTIVE_EDITION` | No hay edición activa | `message` |
| 409 `EMAIL_ALREADY_EXISTS` | El correo ya es de una cuenta | `message` y la acción según `existing` (tabla siguiente) |
| 409 `SIMILAR_PEOPLE` | Hay jurados o profesores activos con nombre parecido y no se envió `confirmSimilar: true` | La lista `matches` con dos salidas: usar a la persona que existe o «No es ninguno, crear» (reenviar el mismo body con `confirmSimilar: true`) |
| 500 | Falló el guardado | `message` («Se revirtió todo y no se creó ninguna cuenta»); se puede reintentar |

### Qué ofrecer según `existing` (o cada elemento de `matches`)
| Caso | Cómo reconocerlo | Acción |
|---|---|---|
| Jurado de la edición que no ha llegado | `isJurorOfEdition: true` y `checkedInAt: null` | Botón «Marcar llegada»: `POST /juror-checkin/manual` con `{ "jurorId": existing.id }` (ruta de HU-11; responde `CHECKED_IN` o `ALREADY_CHECKED_IN`). Conserva su tipo y sus grupos |
| Jurado de la edición que ya llegó | `checkedInAt` con hora | Solo informar la hora; no hay nada que hacer |
| Cuenta de jurado o profesor que no es de la edición | `isJurorOfEdition: false` y `role` «Jurado» o «Profesor» | Enlace a **Jurados de la edición**: inscribirlo por correo (`POST /juror-edition/enroll`) si `editionStatus` es `null`, o confirmarlo (`PATCH /juror-edition/status`) si es `PENDING` o `DECLINED`. El backend no lo inscribe solo |
| Otro rol (Estudiante, Staff, Administrador) | `role` distinto | Solo informar: ese correo no se puede usar para un jurado |

`confirmSimilar` **no** salta el correo repetido: ese 409 se responde siempre.

## Cambio en una ruta existente: `GET /juror-edition`
Cada elemento de `data` trae un campo nuevo, `walkIn: boolean`: `true` para quien se dio de alta el día de la feria. Sirve para mostrar una etiqueta en Jurados de la edición y revisarlos después. Los profesores automáticos vienen siempre con `false`.

## Notas de UI
- El formulario no tiene selector de categoría ni de tipo: mostrar «Junior · Suplente» como texto fijo.
- Tras un 201 el jurado ya aparece en `GET /juror-checkin/search`, `GET /juror-attendance` (Presente, método Manual) y `GET /juror-edition`, y ya se le pueden asignar grupos a mano con las rutas de siempre.
- El jurado entra con Microsoft si su correo es de Uninorte; con correo externo usa el enlace que le llega. Para reenviarlo: `POST /juror/resend-confirmation` (ya existe en Personal → Jurados).
- El nombre parecido se compara por palabras completas sin tildes ni mayúsculas: «Ana Pérez» coincide con «Ana María Pérez Gómez». Un error de tecleo («Peres») no se detecta.

## Segundo PR (todavía no está en la rama): sugerencia y asignación de grupos
Mismo servicio (`ManageWalkInJurors`, solo Administrador). Aplica a cualquier **Suplente Junior confirmado** de la edición activa, no solo a los dados de alta ese día.

### `GET /walk-in-jurors/:jurorId/team-suggestion?maxTeams=3`
No guarda nada. `maxTeams` es opcional (3 por defecto, de 1 a 10).
```ts
interface SuggestedTeam {
  id: number;
  codigo: string;          // "N1-AYP-06"
  nombre: string;
  videojuego: string | null;
  juradosContados: number; // asignados (antes de la hora de control) o presentes (después)
  faltantes: number;       // cuántos le faltan para llegar a 3
}

interface TeamSuggestion {
  edition: { id: number; title: string };
  phase: 'NOT_CONFIGURED' | 'BEFORE_ALERT' | 'ALERT' | 'CONTROL' | 'CLOSED';
  basis: 'ASSIGNED' | 'PRESENT';   // con qué se contaron los faltantes
  maxTeams: number;
  level: number | null;            // el nivel elegido; null si no hay faltantes
  levelLabel: string | null;       // "Nivel 2"
  teams: SuggestedTeam[];          // la propuesta: hasta maxTeams, todos del mismo nivel
  otherTeamsOfLevel: SuggestedTeam[]; // los demás grupos con faltantes de ese nivel, para «Editar»
  levels: { level: number; faltantes: number; gruposConFaltantes: number }[];
  reason: null | 'NO_SHORTAGE';    // NO_SHORTAGE: no hay grupos con faltantes; no se asigna nada
}
```
Errores: **400** `maxTeams` fuera de rango · **403** · **404** el jurado no es suplente confirmado de la edición activa (o no hay edición activa).

### `POST /walk-in-jurors/:jurorId/assignments`
Body: `{ "teamIds": [12, 15, 18], "confirmWarnings": false }` (de 1 a 10 grupos, sin repetir). Son los grupos que quedaron tras «Confirmar» o «Editar».

**200**, con la misma forma que la asignación de suplentes en lote (HU-09):
```ts
interface WalkInAssignmentResult {
  message: string;
  edicion: { id: number; title: string };
  jurado: { id: string; nombre: string };
  equiposAgregados: { id: number; codigo: string; nombre: string }[];
  equiposYaAsignados: { id: number; codigo: string; nombre: string }[];
  advertenciasAceptadas: AssignmentWarning[]; // igual que en la asignación manual
}
```
Solo suma: nadie pierde grupos. Deja una fila de bitácora por grupo y el jurado recibe el aviso «Te asignaron grupos» (HU-22) y la notificación push (HU-37).

Errores: **400** bloqueo de HU-08 con su `code` (un grupo de colegios responde `SCHOOL_REQUIRES_SENIOR`; sin confirmar, `TEAM_NOT_CONFIRMED`) · **403** · **404** · **409** `ASSIGNMENT_WARNINGS` con la lista de advertencias (por ejemplo `JUROR_MIXED_LEVELS` si se eligió un grupo de otro nivel): se reenvía con `confirmWarnings: true`, igual que en la asignación manual.

## Preguntas para Frontend
1. ¿La pantalla de alta vive en Personal → Jurados (botón «Agregar jurado del día») o en el panel de seguimiento de la feria? Al backend le da igual; es para saber qué lista se refresca después.
2. ¿Necesitas un filtro `walkIn=true` en `GET /juror-edition`, o basta con la etiqueta en cada fila? Hoy solo viene el campo.
3. En «Editar», ¿alcanza con `otherTeamsOfLevel` para cambiar un grupo, o quieres poder elegir de cualquier nivel? Lo segundo ya se puede con las listas de la asignación manual y responde la advertencia `JUROR_MIXED_LEVELS`.
