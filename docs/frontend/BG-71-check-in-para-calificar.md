# Contrato de API · BG-71 · Check-in obligatorio para calificar

**Para:** Frontend (Jorge, ARK-286) · **De:** Backend (ARK-285)
**Ticket:** BG-71 (ARK-282) · **Estado:** implementado y probado en local (Postgres real y pruebas unitarias); pendiente de PR a `dev`. No trae migración ni permisos nuevos.
Swagger local: `http://localhost:3000/api` (secciones *Evaluation* y *Evaluation drafts*)

## Qué cambió
Un jurado **asignado a un grupo** solo puede calificarlo si **registró su llegada en la mesa de ARKAD** (check-in de HU-11). Antes cualquier jurado asignado calificaba sin check-in y aparecía a la vez como ausente en el panel.

Si no tiene llegada activa en la edición activa, el back responde **409** en:
- `POST /evaluation/with-details` (envío individual: `RatePage`, `SchoolRatePage`),
- `POST /evaluation/batch` (lote: `BatchRatePage`),
- `PUT /evaluation/drafts/:videogameId` (guardar el borrador / autoguardado).

```json
{
  "statusCode": 409,
  "code": "JUROR_NOT_CHECKED_IN",
  "message": "Registra tu llegada en la mesa de ARKAD para poder calificar."
}
```
Es el mismo `code` que ya devuelve `POST /juror-presence/me/confirm` (HU-23), con otro `message`. `message` ya está en español, listo para mostrar.

## Cómo se comporta en cada ruta
| Ruta | Sin check-in | Con check-in |
|---|---|---|
| `POST /evaluation/with-details` | **409** `JUROR_NOT_CHECKED_IN`, no guarda nada | 201 como siempre |
| `POST /evaluation/batch` | **409 de toda la petición** (no 201 con `failed[]`), no guarda ninguna fila | 201 con el reporte por fila como siempre |
| `PUT /evaluation/drafts/:videogameId` | **409** `JUROR_NOT_CHECKED_IN`, no guarda el borrador | 200 como siempre |
| `GET /evaluation/drafts` | **No** bloquea: el borrador sigue `PENDING` (sin `blockedReason`) | igual |

- **Sin perder lo escrito:** el 409 no toca nada del lado del servidor ni del formulario. El front solo debe mostrar el mensaje y **conservar** lo que el jurado escribió; cuando el administrador registre la llegada, el jurado reintenta con el mismo formulario.
- El autoguardado de borradores también da 409 mientras no haya check-in: conviene mostrar el aviso una vez y no repetir un toast por cada autoguardado.
- La lista de borradores no se bloquea a propósito: un borrador de un jurado cuya llegada se anuló no aparece como «no asignado» (no se le ofrece descartarlo).
- Se distingue de los otros bloqueos: «grupo no asignado», «edición no activa», «colegios solo senior», etc. siguen siendo **403** con el motivo en `message`. Solo el de check-in es **409** con `code`.
- Un 409 de borrador también puede ser `DRAFT_VERSION_CONFLICT` o `EVALUATION_ALREADY_SUBMITTED`: distinguirlos por `code`, nunca por el status.

## A quién aplica
- **Jurados** asignados al grupo y **profesores asignados como jurados**.
- **No aplica** a la nota que el profesor pone a sus NRC (`/professors/team-evaluation`, `/batch`) ni al profesor que califica un grupo solo por ser dueño de un NRC de un integrante, sin estar asignado.
- El **jurado de último momento** (HU-24) no se bloquea: su llegada se registra al darlo de alta.

## Cómo se arregla una llegada olvidada
El administrador (o el staff de la mesa) la registra en **Check-in → búsqueda manual** (`POST /juror-checkin/manual`, ya existe). Si la llegada se anula (`PATCH /juror-attendance/:id/annul`), el jurado vuelve a quedar bloqueado hasta que se registre de nuevo. No hay endpoint nuevo.

## Qué tiene que hacer el front (ARK-286)
1. En `RatePage`, `SchoolRatePage` y `BatchRatePage`: si la respuesta es 409 con `code === 'JUROR_NOT_CHECKED_IN'`, mostrar el mensaje «Registra tu llegada en la mesa de ARKAD para poder calificar» **sin limpiar el formulario**.
2. En el guardado de borradores (`src/lib/evaluationDrafts.ts`): tratar ese 409 sin descartar lo escrito.
3. Ya existe un manejo del mismo código en presencia (`jurorPresence.ts`, `JurorPresenceContext.tsx`): se puede reutilizar.
