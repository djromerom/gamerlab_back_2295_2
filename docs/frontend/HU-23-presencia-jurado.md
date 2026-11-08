# Contrato de API · HU-23 · Presencia del jurado durante la feria

**Para:** Jorge (Frontend, ARK-87) · **De:** Rafael (Backend, ARK-86)
**Ticket:** ARK-75 · **Rama backend:** `feat/ARK-86-presencia-jurado` · **Estado:** implementado y probado en local (Postgres real, HTTP y pruebas unitarias); pendiente de PR a `dev` y de migración en `Arkad-test`
Swagger local: `http://localhost:3000/api` (sección *Juror presence*)

## Qué hace
Después del check-in (HU-11), cada **60 minutos** la pantalla del jurado pregunta "¿Sigues en la feria?" con el botón **"Sigo aquí"**. El administrador ve dos indicadores por jurado:

| Indicador | Cuándo |
|---|---|
| `PRESENCE_UNCONFIRMED` (presencia sin confirmar) | Pasaron **15 minutos** desde la pregunta sin respuesta |
| `POSSIBLE_LEFT` (posible salida) | **45 minutos** sin enviar evaluaciones (desde su llegada o su última evaluación) |

- Un jurado puede tener los dos, uno o ninguno. **Son solo indicadores**: no mueven ni quitan grupos. El administrador decide si suma un suplente (HU-14).
- Los tres tiempos son **configurables por edición** (por defecto 60, 15 y 45).
- Mientras las **evaluaciones estén cerradas** no se pregunta ni se marca a nadie (antes y después de la feria nadie califica).
- Responder "Sigo aquí" no cuenta como actividad: son dos señales distintas.
- Hoy la actividad es **enviar una evaluación**. Cuando exista el guardado de borradores en el servidor (HU-18) también contará guardar un borrador; el contrato no cambia.

**Limitación (documentarla en la ayuda):** el jurado debe mantener la plataforma abierta. Si la cierra, no ve la pregunta y aparecerá como "presencia sin confirmar"; el administrador lo verifica con los profesores.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (`credentials: 'include'`).
- **401** sin sesión · **403** el rol no tiene permiso · **404** sin edición activa (`code: "NO_ACTIVE_EDITION"`).
- Horas en ISO 8601 UTC: mostrarlas en hora de Colombia.
- No vienen correos, códigos ni teléfonos.

## Tipos (TypeScript)
```ts
interface PresenceSettings {
  promptEveryMinutes: number;    // 60: cada cuánto se pregunta
  responseWindowMinutes: number; // 15: minutos para responder
  inactivityMinutes: number;     // 45: minutos sin evaluar para "posible salida"
}

interface MyPresence {
  edition: { id: number; title: string };
  serverTime: string;            // hora del servidor al responder (ISO UTC)
  evaluationsOpen: boolean;
  settings: PresenceSettings;
  checkedIn: boolean;            // false: sin llegada registrada, nunca se pregunta
  checkedInAt: string | null;
  lastConfirmedAt: string | null; // último "Sigo aquí"
  nextPromptAt: string | null;   // cuándo toca la próxima pregunta
  promptDue: boolean;            // true: mostrar "¿Sigues en la feria?" ya
}

type PresenceIndicator = 'PRESENCE_UNCONFIRMED' | 'POSSIBLE_LEFT';

interface JurorPresenceItem {
  jurorId: string;
  name: string;
  category: 'Senior' | 'Junior' | 'Sin categoría';
  isProfessor: boolean;
  checkedInAt: string;
  lastConfirmedAt: string | null;
  lastActivityAt: string | null; // última evaluación enviada desde su llegada
  nextPromptAt: string;
  indicators: PresenceIndicator[]; // [] = sin alertas
}

interface JurorPresenceList {
  edition: { id: number; title: string };
  serverTime: string;
  evaluationsOpen: boolean;
  settings: PresenceSettings;
  totals: { checkedIn: number; presenceUnconfirmed: number; possibleLeft: number; withAnyIndicator: number };
  data: JurorPresenceItem[];
}
```

## Pantallas del jurado (rol Jurado y Profesor)

### `GET /juror-presence/me` → 200 `MyPresence`
Consultarla al abrir las pantallas del jurado y cada **minuto** (o programar un temporizador hasta `nextPromptAt`). Con `promptDue: true` mostrar la ventana.

- Para la cuenta regresiva usar `nextPromptAt - serverTime` (no el reloj del celular).
- Con `checkedIn: false` o `evaluationsOpen: false` nunca viene `promptDue: true`.

### `POST /juror-presence/me/confirm` → 201 `MyPresence`
El botón "Sigo aquí". Guarda la hora del servidor y devuelve el estado nuevo (`promptDue: false` y la próxima pregunta). Repetirlo no hace daño.

| Código | Cuándo | Qué mostrar |
|---|---|---|
| 201 | Confirmado | Cerrar la ventana |
| 409 `JUROR_NOT_CHECKED_IN` | No tiene llegada registrada | El `message` ("Pasa por la mesa de escarapelas") |
| Sin conexión / 5xx | — | **Dejar la ventana en pantalla** y reintentar al volver la conexión (CU-23, excepciones) |

## Panel del administrador

### `GET /juror-presence?indicator=` → 200 `JurorPresenceList`
Jurados de la edición activa **que ya llegaron**, primero los que tienen indicadores y luego por nombre.

| Parámetro | Valores | Por defecto |
|---|---|---|
| `indicator` | `PRESENCE_UNCONFIRMED`, `POSSIBLE_LEFT` o `ANY` (con al menos uno) | todos los que llegaron |

`totals` no cambia con el filtro. Consultar cada **10 s**, como el resto del panel; si falla, mantener la última lista y avisar. Los que no han llegado están en `GET /juror-attendance` (HU-29).

### `GET /juror-presence/settings` → 200 `{ edition, settings }`
### `PATCH /juror-presence/settings` → 200 `{ edition, settings }`
Cuerpo con uno o varios campos; los que no se envían se conservan.
```json
{ "promptEveryMinutes": 60, "responseWindowMinutes": 15, "inactivityMinutes": 45 }
```
Rangos: `promptEveryMinutes` 10 a 240, `responseWindowMinutes` 1 a 120, `inactivityMinutes` 10 a 240 (enteros). Fuera de rango: 400 con la lista de mensajes en `message`.

## Permisos
| Ruta | Quién |
|---|---|
| `GET /juror-presence/me`, `POST /juror-presence/me/confirm` | Jurado y Profesor (servicio `ConfirmJurorPresence`, mismo permiso que calificar) |
| `GET /juror-presence`, `GET`/`PATCH /juror-presence/settings` | Administrador (servicio `ManageJurorPresence`). HU-12 podrá dar lectura a los profesores senior |

Estudiante y Staff reciben 403 en todas.

## Textos sugeridos
- Ventana: "¿Sigues en la feria?" · botón "Sigo aquí".
- Indicadores: "Presencia sin confirmar" y "Posible salida".
- Ayuda: "Mantén la plataforma abierta durante la feria: cada hora te preguntaremos si sigues aquí."
