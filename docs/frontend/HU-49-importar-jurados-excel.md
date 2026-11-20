# HU-49: importar jurados de la edición desde Excel (contrato para el front)

> **Ticket back:** ARK-280 · **Ticket front:** ARK-281 · **Pantalla:** «Jurados de la edición» · **Rol:** solo Administrador (servicio `ManageEditionJurors`)

El administrador sube un Excel con los jurados que confirmaron y el back los deja **Confirmados** en la **edición activa**, creando las cuentas que no existan. Reemplaza a «Traer de la edición anterior»: `POST /juror-edition/import-previous` **ya no existe** (responde 404).

## Rutas

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/juror-edition/import/template` | Descarga la plantilla `.xlsx` (hojas «Jurados» e «Instrucciones») |
| POST | `/juror-edition/import` | Sube el Excel (multipart, campo **`file`**) y devuelve el informe por fila |

Las dos usan la cookie `access-token` (`credentials: 'include'`), como el resto de la API. En el `POST` **no** se pone `Content-Type` a mano: el navegador arma el `multipart/form-data` con su `boundary`.

## Plantilla

Primera hoja, fila 1 con las columnas **Nombres, Apellidos, Correo, Tipo**; una fila por jurado desde la fila 2.

- Nombres, Apellidos y Correo son obligatorios.
- Tipo: `Oficial` o `Suplente`. Vacío = Oficial.
- Máximo 2 MB y 500 filas con datos. Las filas totalmente vacías se saltan.
- La plantilla no trae filas de ejemplo (se importarían).

## `POST /juror-edition/import`

```ts
const form = new FormData();
form.append('file', file); // File de <input type="file" accept=".xlsx">
const res = await apiFetch(`${API_URL}/juror-edition/import`, { method: 'POST', body: form });
```

**201**

```json
{
  "edition": { "id": 5, "title": "Feria Gamer 2026-30" },
  "summary": { "total": 3, "created": 1, "confirmed": 1, "alreadyConfirmed": 0, "errors": 1, "emailsQueued": 1 },
  "rows": [
    { "row": 2, "email": "ana.perez@empresa.com", "firstName": "Ana", "lastName": "Pérez", "type": "OFFICIAL",
      "result": "CREATED", "accountCreated": true, "emailStatus": "QUEUED" },
    { "row": 3, "email": "luis.gomez@empresa.com", "firstName": "Luis", "lastName": "Gómez", "type": "BACKUP",
      "result": "CONFIRMED", "accountCreated": false, "emailStatus": "NOT_NEEDED" },
    { "row": 4, "email": "correo-malo", "firstName": "Eva", "lastName": "Ruiz", "type": null,
      "result": "ERROR", "accountCreated": false, "emailStatus": "NOT_NEEDED",
      "error": "INVALID_EMAIL", "message": "El correo electrónico no es válido" }
  ]
}
```

`row` es el número de fila **en el Excel** (la 1 es el encabezado). `email`, `firstName` y `lastName` ya vienen normalizados (correo en minúsculas y sin espacios).

### `result`

| Valor | Qué pasó | Texto sugerido |
|---|---|---|
| `CREATED` | No había cuenta: se creó (Junior, con el tipo del Excel) y quedó confirmado | Creado |
| `CONFIRMED` | La cuenta existía y quedó confirmada (estaba Pendiente, Declinó o no tenía fila) | Confirmado |
| `ALREADY_CONFIRMED` | Ya estaba confirmado (o es un profesor con NRC activo, que ya es jurado). No se toca ni se duplica | Ya estaba |
| `ERROR` | No se importó; mire `error` y `message` | Error |

### `emailStatus`

`QUEUED` = el correo para crear la contraseña (o verificar la cuenta) quedó **en cola** y sale en segundo plano, con pausa entre uno y otro (unos 2,5 s). Para 100 jurados tarda unos 4 minutos. `NOT_NEEDED` = la cuenta ya estaba verificada o la fila falló. **El informe sale antes de que se envíen los correos**, así que no dice si un correo llegó: si alguno falla, se reenvía desde Personal → Jurados.

### `error` (solo con `result: "ERROR"`; `message` ya viene en español para mostrarlo)

| `error` | Cuándo |
|---|---|
| `MISSING_FIELD` | Falta Nombres, Apellidos o Correo |
| `INVALID_EMAIL` | Correo inválido |
| `INVALID_NAME` | Nombres o Apellidos con caracteres no permitidos (solo letras, espacios, `'`, `.` y `-`) |
| `INVALID_TYPE` | Tipo distinto de Oficial / Suplente |
| `DUPLICATE_IN_FILE` | El correo ya aparece antes en el archivo (cuenta solo la primera) |
| `WRONG_ROLE` | El correo ya tiene una cuenta que no es Jurado ni Profesor |
| `ACCOUNT_DISABLED` | La cuenta está desactivada (se reactiva en Personal → Jurados) |
| `ACCOUNT_CREATION_FAILED` | No se pudo crear la cuenta; se puede reintentar |
| `UNEXPECTED` | Error inesperado en esa fila; se puede reintentar |

Una fila con error **no frena a las demás**. Se corrige el Excel y se vuelve a importar: las que ya están no se duplican.

### Errores de la petición completa (no se importa nada)

| Código | Cuándo | `message` |
|---|---|---|
| 400 | No es un `.xlsx`, no trae las columnas de la plantilla, no tiene filas con datos, tiene más de 500 filas, no se envió el campo `file`, o la edición activa es de solo lectura | Texto en español para mostrar |
| 401 / 403 | Sin sesión / no es Administrador | |
| 404 | No hay edición activa | «No hay una edición activa» |
| 413 | El archivo pesa más de 2 MB | |

## Reglas que conviene mostrar en la pantalla

- Solo importa en la **edición activa** (no recibe `editionId`).
- Un correo repetido dentro del archivo cuenta una sola vez.
- Si el jurado ya estaba **Confirmado**, no se cambia su tipo aunque el Excel diga otro.
- Si estaba Pendiente o Declinó, pasa a Confirmado y toma el tipo del Excel.
- Cuenta existente sin verificar (por ejemplo, creada antes en Personal → Jurados y sin contraseña): se le reenvía el correo y queda confirmada, aunque ya estuviera en la edición.
- Importar de nuevo el mismo archivo no duplica nada, pero sí vuelve a poner en cola el correo de quienes aún no verifican su cuenta.

## Qué se retira

`POST /juror-edition/import-previous` y su respuesta (`sourceEditionId`, `created`, `skipped`, `fallback`). El front debe quitar `importPreviousJurors`, el tipo `ImportPreviousResult`, el botón «Traer de la edición anterior» y su diálogo de confirmación.
