# Contrato de API · HU-25 · Jurados por edición

**Para:** Jorge Silva (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-124 (historia) · ARK-125 (rutas) · ARK-126 (frontend) · **Rama backend:** `feat/ARK-124-juror-edition` (esquema, #215), `feat/ARK-125-juror-edition` (rutas, #218) y `fix/ARK-125-writable-editions` (qué ediciones se pueden modificar y `edition.writable`) · **Estado:** esquema y rutas en `dev` (#215 y #218, 2026-11-02); la regla de ediciones modificables, en revisión
Swagger local: `http://localhost:3000/api` (sección *Juror edition*)

## Qué hace
Hasta ahora el sistema no sabía qué jurados participan en cada edición: escarapelas, check-in y asignación tomaban a todos los jurados y profesores con cuenta, de todas las ediciones. Con HU-25 el administrador decide, **por edición**, quién viene:

- Las cuentas se conservan entre ediciones; lo que cambia es la **participación** en cada una: **Pendiente**, **Confirmado** o **Declinó**, y el tipo **Oficial** o **Suplente**.
- **Profesores:** todo profesor con al menos un NRC activo en la edición es jurado de esa edición **automáticamente** (sin confirmar, sin declinar, no editable). Por eso los NRC se cargan **antes** que todo lo demás.
- **Jurados externos (rol Jurado):** el administrador los **trae de la edición anterior** como Pendientes, marca a los que vienen y confirma en bloque; los demás pasan a Declinó. A quien tiene cuenta pero no estuvo en la anterior lo **inscribe por correo**. Quien no tiene cuenta sigue el flujo actual de alta de jurado.
- Solo los **Confirmados** y los profesores automáticos tendrán escarapela, check-in y asignación (eso lo aplica BG-16 en backend; el frontend no tiene que filtrar).
- Las ediciones anteriores conservan su lista (solo lectura) para los reportes.

## Roles y permisos
| Servicio | Rutas | Roles |
|---|---|---|
| `ListEditionJurors` | `GET /juror-edition` | Solo Administrador |
| `ManageEditionJurors` | `POST /juror-edition/import-previous`, `PATCH /juror-edition/status`, `POST /juror-edition/enroll` | Solo Administrador |

Cualquier otro rol (Estudiante, Profesor, Jurado, Staff) recibe **403**.

## Reglas generales (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (`credentials: 'include'`).
- Errores con el formato de Nest: `{ "statusCode": 404, "message": "...", "error": "Not Found" }`. En los **400** de validación, `message` es una **lista** de textos.
- **401**: sin sesión · **403**: el rol no tiene permiso.
- `editionId` es **opcional** en todas las rutas: si no se envía, se usa la edición **activa**. Para ver ediciones anteriores, enviar su `id` (las ediciones se listan con las rutas actuales de ediciones).
- **Qué ediciones se pueden modificar** (decidido el 2026-11-02): la **activa** siempre; una **inactiva** solo si aún no terminó (`endsAt` en el futuro: una edición que se está preparando). Las **archivadas** y las inactivas que **ya terminaron** (las ediciones anteriores) son de solo lectura: cualquier cambio responde **400**. Leerlas sí se puede. `GET /juror-edition` lo informa en `edition.writable`.
- Fechas en ISO 8601 UTC; mostrarlas en hora de Colombia.

## Tipos (TypeScript)
```ts
type JurorEditionStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';
// AUTOMATIC = profesor con NRC activo en la edición (no editable)
type JurorEditionListStatus = JurorEditionStatus | 'AUTOMATIC';
type JurorEditionType = 'OFFICIAL' | 'BACKUP';      // Oficial | Suplente
type JurorEditionSource = 'ENROLLED' | 'PROFESSOR_NRC';
type JurorCategoryLabel = 'Junior' | 'Senior' | 'Sin categoría';

interface EditionJurorItem {
  jurorId: string;            // texto; no siempre es UUID (hay usuarios antiguos con otros ids)
  firstName: string;
  lastName: string;
  email: string;              // solo lo ve el Administrador
  category: JurorCategoryLabel; // los profesores son siempre Senior
  type: JurorEditionType | null; // null en profesores automáticos
  status: JurorEditionListStatus;
  source: JurorEditionSource;
  updatedAt: string | null;   // último cambio de estado (null en profesores automáticos)
}

interface PaginatedEditionJurors {
  data: EditionJurorItem[];
  metadata: {
    totalItems: number;
    itemsOnCurrentPage: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
  };
  edition: {
    id: number;
    title: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    writable: boolean; // false: solo lectura (archivada o ya terminó)
  };
  counts: { PENDING: number; CONFIRMED: number; DECLINED: number; AUTOMATIC: number };
}

interface StatusRowResult {
  jurorId: string;
  ok: boolean;
  error?: 'NOT_ENROLLED' | 'IS_PROFESSOR';
}
```

## Rutas

### 1. Listar los jurados de la edición — `GET /juror-edition`
Rol: Administrador.

| Parámetro | Tipo | Notas |
|---|---|---|
| `editionId` | número | Opcional; por defecto la activa |
| `status` | `PENDING` \| `CONFIRMED` \| `DECLINED` \| `AUTOMATIC` | Opcional (filtro) |
| `type` | `OFFICIAL` \| `BACKUP` | Opcional (filtro) |
| `search` | texto | Opcional; nombre, apellido o correo (mín. 2 caracteres). Ignora tildes y mayúsculas; cada palabra debe coincidir |
| `page`, `limit` | número | Por defecto `1` y `20`; `limit` máx. `100` |

Orden: Pendientes primero, luego por apellido y nombre.

```json
// 200
{
  "data": [
    {
      "jurorId": "5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01",
      "firstName": "Ana", "lastName": "Pérez", "email": "ana.perez@empresa.com",
      "category": "Junior", "type": "OFFICIAL", "status": "PENDING",
      "source": "ENROLLED", "updatedAt": "2026-11-03T15:20:00.000Z"
    },
    {
      "jurorId": "9a2b0c1d-...",
      "firstName": "Luis", "lastName": "Gómez", "email": "lgomez@uninorte.edu.co",
      "category": "Senior", "type": null, "status": "AUTOMATIC",
      "source": "PROFESSOR_NRC", "updatedAt": null
    }
  ],
  "metadata": { "totalItems": 2, "itemsOnCurrentPage": 2, "currentPage": 1, "itemsPerPage": 20, "totalPages": 1 },
  "edition": { "id": 5, "title": "Feria Gamer 2026-30", "status": "ACTIVE", "writable": true },
  "counts": { "PENDING": 1, "CONFIRMED": 0, "DECLINED": 0, "AUTOMATIC": 1 }
}
```
| Código | Cuándo | Qué mostrar |
|---|---|---|
| 200 | Lista (puede venir vacía) | Tabla con filtro; `counts` para los contadores de las pestañas |
| 400 | Filtro inválido | El `message` |
| 404 | La edición no existe o no hay edición activa | "No hay una edición activa" + selector de edición |

### 2. Traer jurados de la edición anterior — `POST /juror-edition/import-previous`
Rol: Administrador.

```json
// Body (todo opcional)
{ "editionId": 5 }
```
- Crea como **Pendientes** a los jurados **Confirmados** de la edición anterior. No duplica: quien ya tiene fila en la edición se omite (`skipped`).
- **Solo la primera vez (edición 5):** como las ediciones anteriores no tienen lista, trae a **todos** los usuarios activos con rol Jurado (`fallback: true`).
- No toca a los profesores (son automáticos).

```json
// 201
{ "sourceEditionId": 4, "created": 37, "skipped": 0, "fallback": true }
```
| Código | Cuándo | Qué mostrar |
|---|---|---|
| 201 | Importación hecha (también si `created` es 0) | "Se agregaron N jurados como pendientes (M ya estaban)" |
| 400 | La edición es de solo lectura (archivada o ya terminó) | El `message` |
| 404 | No hay edición anterior o no hay edición activa | El `message` |

Sugerencia: pedir confirmación antes de llamar ("Se agregarán como pendientes los jurados de la edición anterior").

### 3. Confirmar, declinar o cambiar el tipo en bloque — `PATCH /juror-edition/status`
Rol: Administrador.

```json
// Body
{
  "editionId": 5,
  "declineRemaining": true,
  "items": [
    { "jurorId": "5e1c7a2b-...", "status": "CONFIRMED", "type": "OFFICIAL" },
    { "jurorId": "7f3d...",      "status": "CONFIRMED", "type": "BACKUP" },
    { "jurorId": "8a4e...",      "status": "DECLINED" }
  ]
}
```
- `items`: de **1 a 500** filas; `jurorId` sin repetir. `type` es opcional (si no se envía, se conserva).
- `status: "PENDING"` sirve para deshacer.
- `declineRemaining` (opcional, por defecto `false`): si es `true`, **todos los Pendientes de la edición que no vienen en `items`** pasan a Declinó **en bloque**, incluidos los de otras páginas y los que la búsqueda o el filtro estén ocultando. Es el botón «Confirmar seleccionados y declinar el resto». No afecta a Confirmados ni a Declinados.
- **Antes de enviarlo con `true`, la pantalla debe pedir confirmación diciendo cuántos se declinarán**: «Se declinarán N jurados pendientes. ¿Continuar?». N = `counts.PENDING` − (jurados seleccionados que hoy están Pendientes). Ojo: `counts` respeta la búsqueda y el tipo; para N usen los `counts` de un `GET /juror-edition?editionId=<id>` **sin** `search` ni `type`. El número real vuelve en `declined` de la respuesta.
- Resultado **por fila**: una fila con error no impide que las demás se guarden.

```json
// 200
{
  "results": [
    { "jurorId": "5e1c7a2b-...", "ok": true },
    { "jurorId": "7f3d...", "ok": true },
    { "jurorId": "9a2b...", "ok": false, "error": "IS_PROFESSOR" }
  ],
  "declined": 12
}
```
| Código / error | Cuándo | Qué mostrar |
|---|---|---|
| 200 | Procesado (revisar `results`) | "N actualizados, M declinados automáticamente"; resaltar filas con `ok: false` |
| fila `NOT_ENROLLED` | El jurado no está en la edición | "No está en esta edición: inscríbalo por correo" |
| fila `IS_PROFESSOR` | Es profesor (automático) | "Los profesores no se confirman: entran por sus NRC" |
| 400 | Lista vacía o de más de 500, `jurorId` repetido, estado o tipo inválido, o edición de solo lectura | El `message` |
| 404 | No hay edición activa | El `message` |

### 4. Inscribir por correo — `POST /juror-edition/enroll`
Rol: Administrador. Para un jurado **con cuenta** que no estuvo en la edición anterior.

```json
// Body
{ "email": "ana.perez@empresa.com", "editionId": 5, "type": "BACKUP" }
```
- `type` opcional; por defecto `OFFICIAL`. Queda inscrito ya **Confirmado**.

```json
// 201
{
  "jurorId": "5e1c7a2b-...", "firstName": "Ana", "lastName": "Pérez", "email": "ana.perez@empresa.com",
  "category": "Junior", "type": "BACKUP", "status": "CONFIRMED", "source": "ENROLLED",
  "updatedAt": "2026-11-03T15:20:00.000Z"
}
```
| Código | Cuándo | Qué mostrar |
|---|---|---|
| 201 | Inscrito y confirmado | Éxito + agregarlo a la tabla |
| 400 | Correo inválido, la cuenta no es de rol Jurado (p. ej. un profesor) o edición de solo lectura | El `message` |
| 404 | No hay cuenta con ese correo | "No existe una cuenta con ese correo" + botón al **alta de jurado actual** (Personal → Jurados) |
| 409 | Ya está en la edición | "Ya está en esta edición como <estado>" (el `message` lo incluye) |

## Notas de UI (página «Jurados de la edición»)
- Página nueva en el panel de administración y una línea en `layouts/AppSidebar.tsx`. No se toca todavía la columna de confirmación de Personal → Jurados (se reemplaza cuando BG-05 esté mezclado).
- Selector de edición arriba (por defecto la activa); si `edition.writable` es `false`, ocultar o deshabilitar las acciones (importar, confirmar, declinar, inscribir) y mostrar "Edición de solo lectura".
- Pestañas o filtro por estado con los contadores de `counts`; búsqueda por nombre o correo.
- Selección múltiple con acciones: **Confirmar** (con tipo Oficial o Suplente), **Declinar**, **Volver a pendiente** y **Confirmar seleccionados y declinar el resto** (`declineRemaining: true`; pedir confirmación con el número de Pendientes que se declinarán, ver la ruta 3).
- Profesores (`AUTOMATIC`): mostrarlos sin casilla de selección y con una etiqueta "Profesor con NRC".
- Textos de ayuda obligatorios (criterio de aceptación):
  - "Cargue primero los NRC de la edición: los profesores con NRC activo quedan como jurados automáticamente."
  - "Solo los jurados confirmados y los profesores con NRC tendrán escarapela, check-in y asignación."
  - "Si un jurado no tiene cuenta, créelo en Personal → Jurados y luego inscríbalo aquí."

## Por confirmar con Frontend
1. ¿Les sirve que `GET /juror-edition` devuelva `counts` y `edition` junto con la paginación, o prefieren una ruta aparte para los contadores?
2. ¿El tamaño de página por defecto (20) y el máximo (100) les sirve para la selección múltiple? Si quieren "seleccionar todos" sobre todas las páginas, se puede usar `declineRemaining` o subir el máximo.
3. ¿Necesitan algún dato más por fila (por ejemplo, si ya tiene escarapela o grupos asignados)?

## Cómo probar en local
1. Con el esquema mezclado: `npx prisma migrate deploy` (o `docker compose -f docker-compose.dev.yml up`, que aplica las migraciones) y reiniciar el backend (los permisos se cachean).
2. Iniciar sesión como Administrador y llamar `POST /juror-edition/import-previous` (en local, con el seed, trae como Pendientes a los jurados de prueba).
3. `GET /juror-edition` → `PATCH /juror-edition/status` con algunos confirmados y `declineRemaining: true` → `GET /juror-edition?status=DECLINED`.
4. Con una cuenta de Jurado o Staff, cualquiera de las rutas debe responder 403.
